/**
 * Proxy exit-identity verification.
 *
 * Fetching Cloudflare's trace endpoint THROUGH the account proxy returns the
 * real exit IP and its country in one request — so we can catch a transparent,
 * rotating, or wrong-country proxy before it ever runs the account (an exit IP
 * whose country disagrees with the browser's geoLocale is the exact mismatch the
 * geo-alignment work tries to avoid).
 */
export declare const CLOUDFLARE_TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";
export interface ProxyTrace {
    ip?: string;
    country?: string;
}
export declare function parseCloudflareTrace(body: string): ProxyTrace;
export interface ProxyIdentityCheck {
    ok: boolean;
    mismatches: string[];
}
/**
 * Pure comparison of an observed exit identity against expectations. Each check
 * is only applied when its expected value is known (explicit geoLocale, or a
 * configured egress IP), so unconfigured accounts never false-positive.
 */
export declare function evaluateProxyIdentity(params: {
    observedIp?: string;
    observedCountry?: string;
    expectedCountry?: string;
    expectedIp?: string;
}): ProxyIdentityCheck;
//# sourceMappingURL=ProxyVerify.d.ts.map