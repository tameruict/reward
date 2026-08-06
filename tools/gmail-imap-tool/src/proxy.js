'use strict'

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'socks:', 'socks4:', 'socks5:'])

/**
 * Normalize common proxy formats to a URL accepted by ImapFlow.
 *
 * Supported inputs:
 * - http://user:pass@host:port
 * - socks5://user:pass@host:port
 * - host:port
 * - host:port:user:pass
 */
function normalizeProxy(value) {
    const input = String(value || '').trim()
    if (!input) return null

    let candidate = input
    if (!candidate.includes('://')) {
        const parts = candidate.split(':')
        if (parts.length >= 4 && /^\d+$/.test(parts[1])) {
            const [host, port, username, ...passwordParts] = parts
            const password = passwordParts.join(':')
            candidate = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`
        } else {
            candidate = `http://${candidate}`
        }
    }

    let parsed
    try {
        parsed = new URL(candidate)
    } catch {
        throw new Error('Proxy không hợp lệ. Dùng host:port hoặc protocol://user:pass@host:port.')
    }

    if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
        throw new Error('Proxy chỉ hỗ trợ HTTP, HTTPS, SOCKS4 hoặc SOCKS5.')
    }
    if (!parsed.hostname) {
        throw new Error('Proxy thiếu hostname.')
    }
    if (parsed.port && (!/^\d+$/.test(parsed.port) || Number(parsed.port) > 65535)) {
        throw new Error('Port proxy không hợp lệ.')
    }

    return parsed.toString()
}

function maskProxy(value) {
    const normalized = normalizeProxy(value)
    if (!normalized) return ''

    const parsed = new URL(normalized)
    const auth = parsed.username || parsed.password ? ' • có xác thực' : ''
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${auth}`
}

module.exports = { normalizeProxy, maskProxy, SUPPORTED_PROTOCOLS }
