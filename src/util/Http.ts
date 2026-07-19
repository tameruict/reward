import { Impit } from 'impit'
import type { HttpMethod, ImpitResponse, RequestInit as ImpitRequestInit } from 'impit'
import type { AccountProxy } from '../interface/Account'
import { formatProxyUrl, parseProxyConfig } from './ProxyConfig'

const DEFAULT_TIMEOUT = 20000
const PROXY_HEALTHCHECK_TIMEOUT = 12000
const PROXY_HEALTHCHECK_ATTEMPTS = 2
const PROXY_HEALTHCHECK_RETRY_DELAY = 500
const PROXY_REQUEST_TIMEOUT = 15000
const PROXY_HEALTH_TTL = 60000
const PROXY_UNHEALTHY_COOLDOWN = 30000
const PROXY_FAILURES_TO_OPEN = 2
const PROXY_FAILURE_WINDOW = 60000
const PROXY_HEALTHCHECK_URL = 'https://api.ipify.org?format=json'

interface ProxyCircuitState {
    unavailableUntil: number
    reason: string
    failureCount: number
    lastFailureAt: number
}

const proxyCircuits = new Map<string, ProxyCircuitState>()

export class ProxyUnavailableError extends Error {
    constructor(reason: string, cause?: unknown) {
        super(`Configured proxy is unavailable (${reason}); direct fallback is disabled`, { cause })
        this.name = 'ProxyUnavailableError'
    }
}

export interface HttpRequestConfig {
    url?: string
    method?: string
    headers?: Record<string, unknown>
    params?: Record<string, string> | URLSearchParams
    data?: unknown
    timeout?: number
    responseType?: 'json' | 'text'
}

export interface HttpResponse<T = unknown> {
    data: T
    status: number
    statusText: string
    headers: Record<string, string | string[]>
    config: HttpRequestConfig
}

function toInit(config: HttpRequestConfig): { url: string; init: ImpitRequestInit } {
    let url = config.url ?? ''
    if (config.params) {
        const qs =
            config.params instanceof URLSearchParams
                ? config.params.toString()
                : new URLSearchParams(config.params).toString()
        if (qs) url += (url.includes('?') ? '&' : '?') + qs
    }

    const headers: Record<string, string> = {}
    if (config.headers) {
        for (const [key, value] of Object.entries(config.headers)) {
            if (value === undefined || value === null) continue
            headers[key] = Array.isArray(value) ? value.join(', ') : String(value)
        }
    }

    let body: ImpitRequestInit['body']
    const data = config.data
    if (data !== undefined && data !== null) {
        if (
            typeof data === 'string' ||
            data instanceof URLSearchParams ||
            data instanceof Uint8Array ||
            data instanceof ArrayBuffer
        ) {
            body = data
        } else {
            body = JSON.stringify(data)
            if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
                headers['Content-Type'] = 'application/json'
            }
        }
    }

    const init: ImpitRequestInit = {
        method: (config.method ?? 'GET').toUpperCase() as HttpMethod,
        headers,
        body,
        timeout: config.timeout ?? DEFAULT_TIMEOUT
    }

    return { url, init }
}

async function toResponse<T>(res: ImpitResponse, config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const text = await res.text()

    let data: unknown = text
    if (config.responseType !== 'text') {
        try {
            data = JSON.parse(text)
        } catch {
            data = text
        }
    }

    const headers: Record<string, string | string[]> = {}
    res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value
    })

    const withSetCookie = res.headers as Headers & { getSetCookie?: () => string[] }
    const setCookie = typeof withSetCookie.getSetCookie === 'function' ? withSetCookie.getSetCookie() : undefined
    if (setCookie && setCookie.length) headers['set-cookie'] = setCookie

    return {
        data: data as T,
        status: res.status,
        statusText: res.statusText,
        headers,
        config
    }
}

function backoff(attempt: number): Promise<void> {
    const ms = Math.min(2 ** attempt * 100, 8000) + Math.floor(Math.random() * 100)
    return new Promise(resolve => setTimeout(resolve, ms))
}

function proxyFailureReason(error: unknown): string {
    const status = (error as { status?: number })?.status
    if (status === 407) return 'proxy authentication was rejected'

    const message = error instanceof Error ? error.message : String(error)
    const networkCode = message.match(/(?:net::)?(ERR_[A-Z_]+)/)?.[1]
    if (networkCode) return networkCode
    if (/timed?\s*out|timeout/i.test(message)) return 'request timed out'
    if (/ECONNREFUSED/i.test(message)) return 'connection refused'
    if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return 'proxy host could not be resolved'
    return 'transport failure'
}

function isProxyFailure(error: unknown): boolean {
    const status = (error as { status?: number })?.status
    return status === undefined || status === 407
}

async function send<T>(
    instance: Impit,
    url: string,
    init: ImpitRequestInit,
    config: HttpRequestConfig,
    retries: number
): Promise<HttpResponse<T>> {
    let attempt = 0

    for (;;) {
        let res: ImpitResponse
        try {
            res = await instance.fetch(url, init)
        } catch (error) {
            const status = (error as { status?: number })?.status
            const retriable = status === undefined || status === 429 || status >= 500
            if (retriable && attempt < retries) {
                await backoff(attempt++)
                continue
            }
            throw error
        }

        if ((res.status === 429 || (res.status >= 500 && res.status <= 599)) && attempt < retries) {
            await backoff(attempt++)
            continue
        }

        const out = await toResponse<T>(res, config)
        if (res.status < 200 || res.status >= 300) {
            const error = new Error(`Request failed with status code ${res.status}`) as Error & {
                response?: HttpResponse<T>
                status?: number
            }
            error.response = out
            error.status = res.status
            throw error
        }

        return out
    }
}

class HttpClient {
    private instance: Impit
    private account: AccountProxy
    private readonly proxyUrl?: string
    private readonly proxyKey?: string
    private lastProxyHealthcheck = 0

    public readonly usesProxy: boolean

    constructor(account: AccountProxy) {
        this.account = account
        this.proxyUrl = this.account.url.trim() ? formatProxyUrl(this.account) : undefined
        this.proxyKey = this.proxyUrl ? this.buildProxyKey(this.account) : undefined
        this.usesProxy = Boolean(this.proxyUrl)
        this.instance = this.createInstance()
    }

    public async assertProxyReady(force = false): Promise<void> {
        if (!this.usesProxy) return

        this.throwIfProxyCircuitOpen()
        if (!force && Date.now() - this.lastProxyHealthcheck < PROXY_HEALTH_TTL) return

        let lastError: unknown
        for (let attempt = 1; attempt <= PROXY_HEALTHCHECK_ATTEMPTS; attempt++) {
            try {
                const response = await this.instance.fetch(PROXY_HEALTHCHECK_URL, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    timeout: PROXY_HEALTHCHECK_TIMEOUT
                })
                await response.text()

                if (response.status < 200 || response.status >= 300) {
                    const error = new Error(`Proxy health check returned HTTP ${response.status}`) as Error & {
                        status?: number
                    }
                    error.status = response.status
                    throw error
                }

                this.lastProxyHealthcheck = Date.now()
                if (this.proxyKey) proxyCircuits.delete(this.proxyKey)
                return
            } catch (error) {
                lastError = error
                this.instance = this.createInstance()
                if (attempt < PROXY_HEALTHCHECK_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, PROXY_HEALTHCHECK_RETRY_DELAY))
                }
            }
        }

        this.markProxyUnavailable(lastError)
        throw new ProxyUnavailableError(proxyFailureReason(lastError), lastError)
    }

    public async request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
        const { url, init } = toInit(config)

        if (this.usesProxy) {
            this.throwIfProxyCircuitOpen()
            init.timeout = Math.min(init.timeout ?? DEFAULT_TIMEOUT, PROXY_REQUEST_TIMEOUT)
        }

        try {
            // Proxied requests use one bounded attempt. Retrying a dead proxy with the
            // same connection pool is what previously made a single call hang for minutes.
            return await send<T>(this.instance, url, init, config, this.usesProxy ? 0 : 5)
        } catch (error) {
            if (this.usesProxy && isProxyFailure(error)) {
                this.markProxyUnavailable(error)
                this.instance = this.createInstance()
                throw new ProxyUnavailableError(proxyFailureReason(error), error)
            }
            throw error
        }
    }

    private createInstance(): Impit {
        return new Impit({ browser: 'chrome', proxyUrl: this.proxyUrl, timeout: DEFAULT_TIMEOUT })
    }

    private buildProxyKey(proxyConfig: AccountProxy): string {
        const parsed = parseProxyConfig(proxyConfig)
        return `${parsed.protocol}://${parsed.host}:${parsed.port}|${parsed.username}`
    }

    private throwIfProxyCircuitOpen(): void {
        if (!this.proxyKey) return
        const circuit = proxyCircuits.get(this.proxyKey)
        if (!circuit) return
        const now = Date.now()
        if (circuit.unavailableUntil > now) {
            const remainingSeconds = Math.max(1, Math.ceil((circuit.unavailableUntil - now) / 1000))
            throw new ProxyUnavailableError(`${circuit.reason}; retry allowed in ${remainingSeconds}s`)
        }
        if (circuit.unavailableUntil > 0 || now - circuit.lastFailureAt > PROXY_FAILURE_WINDOW) {
            proxyCircuits.delete(this.proxyKey)
        }
    }

    private markProxyUnavailable(error: unknown): void {
        if (!this.proxyKey) return
        const now = Date.now()
        const existing = proxyCircuits.get(this.proxyKey)
        const failureCount =
            existing && now - existing.lastFailureAt <= PROXY_FAILURE_WINDOW ? existing.failureCount + 1 : 1

        proxyCircuits.set(this.proxyKey, {
            unavailableUntil: failureCount >= PROXY_FAILURES_TO_OPEN ? now + PROXY_UNHEALTHY_COOLDOWN : 0,
            reason: proxyFailureReason(error),
            failureCount,
            lastFailureAt: now
        })
    }

}

let sharedInstance: Impit | undefined

export async function httpRequest<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    if (!sharedInstance) sharedInstance = new Impit({ browser: 'chrome', timeout: DEFAULT_TIMEOUT })
    const { url, init } = toInit(config)
    return send<T>(sharedInstance, url, init, config, 0)
}

export default HttpClient
