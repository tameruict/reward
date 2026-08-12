import type { AccountProxy } from '../interface/Account'

export interface ParsedProxyConfig {
    protocol: string
    host: string
    port: number
    username: string
    password: string
    server: string
    routeServer: string
}

function decodeUrlPart(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

function encodeUrlPart(value: string): string {
    return encodeURIComponent(value)
}

function parseProxyUrl(rawUrl: string): URL {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`
    return new URL(withProtocol)
}

export function parseProxyConfig(proxy: AccountProxy): ParsedProxyConfig {
    const rawUrl = proxy.url.trim()
    const parsed = parseProxyUrl(rawUrl)
    const protocol = parsed.protocol.replace(':', '').toLowerCase()
    const port = Number(proxy.port) || Number(parsed.port)
    const username = proxy.username.trim() || decodeUrlPart(parsed.username)
    const password = proxy.password || decodeUrlPart(parsed.password)

    if (!['http', 'https', 'socks4', 'socks5'].includes(protocol)) {
        throw new Error(`Unsupported proxy protocol: ${protocol}. Only HTTP(S) and SOCKS4/5 are supported!`)
    }

    if (!parsed.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Invalid proxy configuration: a valid host and port are required')
    }

    const routeServer = `${protocol}://${parsed.hostname.toLowerCase()}`
    const server = `${protocol}://${parsed.hostname}:${port}`

    return {
        protocol,
        host: parsed.hostname,
        port,
        username,
        password,
        server,
        routeServer
    }
}

export function formatProxyUrl(proxy: AccountProxy): string {
    const parsed = parseProxyConfig(proxy)
    const auth =
        parsed.username && parsed.password ? `${encodeUrlPart(parsed.username)}:${encodeUrlPart(parsed.password)}@` : ''

    return `${parsed.protocol}://${auth}${parsed.host}:${parsed.port}`
}

export function accountProxyRouteKey(proxy: AccountProxy): string {
    const parsed = parseProxyConfig(proxy)

    return JSON.stringify({
        server: parsed.routeServer,
        port: parsed.port,
        username: parsed.username
    })
}
