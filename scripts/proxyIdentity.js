import crypto from 'node:crypto'

function decodeUrlPart(value) {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

function encodeUrlPart(value) {
    return encodeURIComponent(value)
}

export function parseProxyParts(proxy) {
    const rawUrl = String(proxy?.url ?? proxy?.host ?? '').trim()
    if (!rawUrl) {
        return {
            protocol: String(proxy?.protocol ?? 'http').replace(':', '').toLowerCase(),
            host: '',
            port: 0,
            username: String(proxy?.username ?? '').trim(),
            password: String(proxy?.password ?? '')
        }
    }

    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`
    try {
        const parsed = new URL(withProtocol)
        return {
            protocol: parsed.protocol.replace(':', '').toLowerCase(),
            host: parsed.hostname,
            port: Number(proxy?.port) || Number(parsed.port),
            username: String(proxy?.username ?? '').trim() || decodeUrlPart(parsed.username),
            password: String(proxy?.password ?? '') || decodeUrlPart(parsed.password)
        }
    } catch {
        return {
            protocol: 'http',
            host: rawUrl.toLowerCase().replace(/\/+$/, ''),
            port: Number(proxy?.port) || 0,
            username: String(proxy?.username ?? '').trim(),
            password: String(proxy?.password ?? '')
        }
    }
}

export function formatProxyUrl(proxy) {
    const parsed = parseProxyParts(proxy)
    const auth =
        parsed.username && parsed.password ? `${encodeUrlPart(parsed.username)}:${encodeUrlPart(parsed.password)}@` : ''
    return `${parsed.protocol}://${auth}${parsed.host}:${parsed.port}`
}

export function canonicalProxyIdentity({ url, port, username }) {
    const parsed = parseProxyParts({ url, port, username })
    return JSON.stringify({
        server: `${parsed.protocol}://${parsed.host.toLowerCase()}`,
        port: parsed.port,
        username: parsed.username
    })
}

export function proxyIdentityKey(proxy) {
    return `identity_${crypto.createHash('sha256').update(canonicalProxyIdentity(proxy)).digest('hex').slice(0, 16)}`
}

export function automaticProxyLabel(proxy) {
    return `proxy-auto-${crypto.createHash('sha256').update(canonicalProxyIdentity(proxy)).digest('hex').slice(0, 10)}`
}
