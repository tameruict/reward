/**
 * Offline country -> geo profile resolution.
 *
 * The single strongest bot tell is an IP whose country disagrees with the
 * browser's JS timezone / locale / geolocation. We fix that by aligning the
 * browser to the account's country (which must match the proxy's exit country):
 * timezoneId, locale, geolocation and the Rewards API `timezoneOffset` all come
 * from one place, with NO external GeoIP call.
 */
export interface GeoProfile {
    /** ISO-3166 alpha-2, uppercase */
    country: string;
    /** BCP-47 locale, e.g. 'en-US' */
    locale: string;
    /** IANA timezone, e.g. 'America/New_York' */
    timezoneId: string;
    latitude: number;
    longitude: number;
    /** metres */
    accuracy: number;
    /** getTimezoneOffset()-compatible minutes (UTC - local), for the Rewards API payloads */
    timezoneOffsetMinutes: number;
}
/**
 * getTimezoneOffset()-compatible offset in minutes (UTC - local) for an IANA zone.
 * Falls back to the host offset if the zone is unknown.
 */
export declare function timezoneOffsetForZone(timeZone: string, at?: Date): number;
export declare function isSupportedCountry(country: string | undefined): boolean;
/**
 * Resolves a stable geo profile for a country. `seed` (per-account) picks a
 * timezone for multi-zone countries and jitters the coordinate deterministically,
 * so accounts in the same country don't share an identical location.
 * Returns null for 'auto' / unknown countries — the caller keeps existing behaviour.
 */
export declare function resolveGeoProfile(country: string | undefined, seed: string): GeoProfile | null;
//# sourceMappingURL=GeoProfile.d.ts.map