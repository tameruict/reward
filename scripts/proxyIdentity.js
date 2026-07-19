import crypto from 'node:crypto'

function normalizedServer(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    const withProtocol = raw.includes('://') ? raw : `http://${raw}`
    try {
        const parsed = new URL(withProtocol)
        return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}`
    } catch {
        return raw.toLowerCase().replace(/\/+$/, '')
    }
}

export function canonicalProxyIdentity({ url, port, username }) {
    return JSON.stringify({
        server: normalizedServer(url),
        port: Number(port),
        username: String(username ?? '').trim()
    })
}

export function proxyIdentityKey(proxy) {
    return `identity_${crypto.createHash('sha256').update(canonicalProxyIdentity(proxy)).digest('hex').slice(0, 16)}`
}

export function automaticProxyLabel(proxy) {
    return `proxy-auto-${crypto.createHash('sha256').update(canonicalProxyIdentity(proxy)).digest('hex').slice(0, 10)}`
}
