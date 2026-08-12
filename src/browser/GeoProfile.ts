import { createHash } from 'node:crypto'

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
    country: string
    /** BCP-47 locale, e.g. 'en-US' */
    locale: string
    /** IANA timezone, e.g. 'America/New_York' */
    timezoneId: string
    latitude: number
    longitude: number
    /** metres */
    accuracy: number
    /** getTimezoneOffset()-compatible minutes (UTC - local), for the Rewards API payloads */
    timezoneOffsetMinutes: number
}

interface CountryEntry {
    locale: string
    timezones: string[]
    lat: number
    lon: number
}

// Representative timezone(s), primary locale and a major-city coordinate per
// country. Multi-timezone countries list a few so accounts in one country don't
// all report the same zone. Extend as needed.
const COUNTRY_GEO: Record<string, CountryEntry> = {
    US: {
        locale: 'en-US',
        timezones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix'],
        lat: 40.7128,
        lon: -74.006
    },
    CA: {
        locale: 'en-CA',
        timezones: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Halifax'],
        lat: 43.6532,
        lon: -79.3832
    },
    GB: { locale: 'en-GB', timezones: ['Europe/London'], lat: 51.5074, lon: -0.1278 },
    IE: { locale: 'en-IE', timezones: ['Europe/Dublin'], lat: 53.3498, lon: -6.2603 },
    AU: {
        locale: 'en-AU',
        timezones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth'],
        lat: -33.8688,
        lon: 151.2093
    },
    NZ: { locale: 'en-NZ', timezones: ['Pacific/Auckland'], lat: -36.8485, lon: 174.7633 },
    DE: { locale: 'de-DE', timezones: ['Europe/Berlin'], lat: 52.52, lon: 13.405 },
    FR: { locale: 'fr-FR', timezones: ['Europe/Paris'], lat: 48.8566, lon: 2.3522 },
    IT: { locale: 'it-IT', timezones: ['Europe/Rome'], lat: 41.9028, lon: 12.4964 },
    ES: { locale: 'es-ES', timezones: ['Europe/Madrid'], lat: 40.4168, lon: -3.7038 },
    PT: { locale: 'pt-PT', timezones: ['Europe/Lisbon'], lat: 38.7223, lon: -9.1393 },
    NL: { locale: 'nl-NL', timezones: ['Europe/Amsterdam'], lat: 52.3676, lon: 4.9041 },
    BE: { locale: 'nl-BE', timezones: ['Europe/Brussels'], lat: 50.8503, lon: 4.3517 },
    CH: { locale: 'de-CH', timezones: ['Europe/Zurich'], lat: 47.3769, lon: 8.5417 },
    AT: { locale: 'de-AT', timezones: ['Europe/Vienna'], lat: 48.2082, lon: 16.3738 },
    SE: { locale: 'sv-SE', timezones: ['Europe/Stockholm'], lat: 59.3293, lon: 18.0686 },
    NO: { locale: 'nb-NO', timezones: ['Europe/Oslo'], lat: 59.9139, lon: 10.7522 },
    DK: { locale: 'da-DK', timezones: ['Europe/Copenhagen'], lat: 55.6761, lon: 12.5683 },
    FI: { locale: 'fi-FI', timezones: ['Europe/Helsinki'], lat: 60.1699, lon: 24.9384 },
    PL: { locale: 'pl-PL', timezones: ['Europe/Warsaw'], lat: 52.2297, lon: 21.0122 },
    CZ: { locale: 'cs-CZ', timezones: ['Europe/Prague'], lat: 50.0755, lon: 14.4378 },
    RO: { locale: 'ro-RO', timezones: ['Europe/Bucharest'], lat: 44.4268, lon: 26.1025 },
    GR: { locale: 'el-GR', timezones: ['Europe/Athens'], lat: 37.9838, lon: 23.7275 },
    TR: { locale: 'tr-TR', timezones: ['Europe/Istanbul'], lat: 41.0082, lon: 28.9784 },
    UA: { locale: 'uk-UA', timezones: ['Europe/Kyiv'], lat: 50.4501, lon: 30.5234 },
    RU: {
        locale: 'ru-RU',
        timezones: ['Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk'],
        lat: 55.7558,
        lon: 37.6173
    },
    VN: { locale: 'vi-VN', timezones: ['Asia/Ho_Chi_Minh'], lat: 21.0278, lon: 105.8342 },
    TH: { locale: 'th-TH', timezones: ['Asia/Bangkok'], lat: 13.7563, lon: 100.5018 },
    ID: { locale: 'id-ID', timezones: ['Asia/Jakarta', 'Asia/Makassar'], lat: -6.2088, lon: 106.8456 },
    MY: { locale: 'ms-MY', timezones: ['Asia/Kuala_Lumpur'], lat: 3.139, lon: 101.6869 },
    SG: { locale: 'en-SG', timezones: ['Asia/Singapore'], lat: 1.3521, lon: 103.8198 },
    PH: { locale: 'en-PH', timezones: ['Asia/Manila'], lat: 14.5995, lon: 120.9842 },
    IN: { locale: 'en-IN', timezones: ['Asia/Kolkata'], lat: 28.6139, lon: 77.209 },
    JP: { locale: 'ja-JP', timezones: ['Asia/Tokyo'], lat: 35.6762, lon: 139.6503 },
    KR: { locale: 'ko-KR', timezones: ['Asia/Seoul'], lat: 37.5665, lon: 126.978 },
    HK: { locale: 'zh-HK', timezones: ['Asia/Hong_Kong'], lat: 22.3193, lon: 114.1694 },
    TW: { locale: 'zh-TW', timezones: ['Asia/Taipei'], lat: 25.033, lon: 121.5654 },
    BR: {
        locale: 'pt-BR',
        timezones: ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza'],
        lat: -23.5505,
        lon: -46.6333
    },
    AR: { locale: 'es-AR', timezones: ['America/Argentina/Buenos_Aires'], lat: -34.6037, lon: -58.3816 },
    MX: { locale: 'es-MX', timezones: ['America/Mexico_City', 'America/Monterrey', 'America/Tijuana'], lat: 19.4326, lon: -99.1332 },
    CL: { locale: 'es-CL', timezones: ['America/Santiago'], lat: -33.4489, lon: -70.6693 },
    CO: { locale: 'es-CO', timezones: ['America/Bogota'], lat: 4.711, lon: -74.0721 },
    ZA: { locale: 'en-ZA', timezones: ['Africa/Johannesburg'], lat: -26.2041, lon: 28.0473 },
    AE: { locale: 'ar-AE', timezones: ['Asia/Dubai'], lat: 25.2048, lon: 55.2708 },
    SA: { locale: 'ar-SA', timezones: ['Asia/Riyadh'], lat: 24.7136, lon: 46.6753 },
    IL: { locale: 'he-IL', timezones: ['Asia/Jerusalem'], lat: 32.0853, lon: 34.7818 },
    EG: { locale: 'ar-EG', timezones: ['Africa/Cairo'], lat: 30.0444, lon: 31.2357 }
}

function seededInt(seed: string, salt: string, mod: number): number {
    const digest = createHash('sha256').update(`${seed}::geo::${salt}`).digest()
    return mod > 0 ? digest.readUInt32BE(0) % mod : 0
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

/**
 * getTimezoneOffset()-compatible offset in minutes (UTC - local) for an IANA zone.
 * Falls back to the host offset if the zone is unknown.
 */
export function timezoneOffsetForZone(timeZone: string, at: Date = new Date()): number {
    try {
        const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
        const map: Record<string, string> = {}
        for (const part of dtf.formatToParts(at)) map[part.type] = part.value
        const asUTC = Date.UTC(
            Number(map.year),
            Number(map.month) - 1,
            Number(map.day),
            Number(map.hour),
            Number(map.minute),
            Number(map.second)
        )
        const localMinusUtcMinutes = Math.round((asUTC - at.getTime()) / 60000)
        return -localMinusUtcMinutes // match Date.prototype.getTimezoneOffset() sign
    } catch {
        return at.getTimezoneOffset()
    }
}

export function isSupportedCountry(country: string | undefined): boolean {
    if (!country) return false
    const key = country.trim().toUpperCase()
    return key.length === 2 && key in COUNTRY_GEO
}

/**
 * Resolves a stable geo profile for a country. `seed` (per-account) picks a
 * timezone for multi-zone countries and jitters the coordinate deterministically,
 * so accounts in the same country don't share an identical location.
 * Returns null for 'auto' / unknown countries — the caller keeps existing behaviour.
 */
export function resolveGeoProfile(country: string | undefined, seed: string): GeoProfile | null {
    if (!country) return null
    const key = country.trim().toUpperCase()
    if (key.length !== 2) return null
    const entry = COUNTRY_GEO[key]
    if (!entry) return null

    const timezoneId = entry.timezones[seededInt(seed, 'tz', entry.timezones.length)] ?? entry.timezones[0]!
    // ±0.08° (~9 km) deterministic jitter around the city centre.
    const latJitter = (seededInt(seed, 'lat', 1600) - 800) / 10000
    const lonJitter = (seededInt(seed, 'lon', 1600) - 800) / 10000

    return {
        country: key,
        locale: entry.locale,
        timezoneId,
        latitude: round(entry.lat + latJitter, 4),
        longitude: round(entry.lon + lonJitter, 4),
        accuracy: 20 + seededInt(seed, 'acc', 80), // 20-99 m
        timezoneOffsetMinutes: timezoneOffsetForZone(timezoneId)
    }
}
