/**
 * Proxy exit-identity verification.
 *
 * Fetching Cloudflare's trace endpoint THROUGH the account proxy returns the
 * real exit IP and its country in one request — so we can catch a transparent,
 * rotating, or wrong-country proxy before it ever runs the account (an exit IP
 * whose country disagrees with the browser's geoLocale is the exact mismatch the
 * geo-alignment work tries to avoid).
 */

// Cloudflare trace returns lines like `ip=1.2.3.4` and `loc=US`. HTTPS, no key,
// no rate limits, and works from any exit — ideal for a per-run identity probe.
export const CLOUDFLARE_TRACE_URL = 'https://www.cloudflare.com/cdn-cgi/trace'

export interface ProxyTrace {
    ip?: string
    country?: string
}

export function parseCloudflareTrace(body: string): ProxyTrace {
    const trace: ProxyTrace = {}
    for (const line of body.split(/\r?\n/)) {
        const eq = line.indexOf('=')
        if (eq === -1) continue
        const key = line.slice(0, eq).trim()
        const value = line.slice(eq + 1).trim()
        if (key === 'ip') trace.ip = value
        else if (key === 'loc') trace.country = value.toUpperCase()
    }
    return trace
}

export interface ProxyIdentityCheck {
    ok: boolean
    mismatches: string[]
}

/**
 * Pure comparison of an observed exit identity against expectations. Each check
 * is only applied when its expected value is known (explicit geoLocale, or a
 * configured egress IP), so unconfigured accounts never false-positive.
 */
export function evaluateProxyIdentity(params: {
    observedIp?: string
    observedCountry?: string
    expectedCountry?: string
    expectedIp?: string
}): ProxyIdentityCheck {
    const mismatches: string[] = []

    if (params.expectedIp && params.observedIp && params.observedIp !== params.expectedIp) {
        mismatches.push(`exit IP ${params.observedIp} != configured egress ${params.expectedIp} (rotating/transparent proxy?)`)
    }

    if (
        params.expectedCountry &&
        params.observedCountry &&
        params.observedCountry.toUpperCase() !== params.expectedCountry.toUpperCase()
    ) {
        mismatches.push(`exit country ${params.observedCountry} != geoLocale ${params.expectedCountry.toUpperCase()}`)
    }

    return { ok: mismatches.length === 0, mismatches }
}
