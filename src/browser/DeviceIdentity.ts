import { createHash } from 'node:crypto'

import type { Account } from '../interface/Account'

/**
 * A stable, per-account Android device identity.
 *
 * The same identity drives BOTH the browser (Edge Android) user-agent and every
 * Rewards app/platform API call (Bing Sapphire Android), so one account always
 * looks like one real phone — and two accounts look like two different phones.
 *
 * It is derived deterministically from the account (accountId, or email as a
 * fallback), so it stays identical across runs and machines even if the saved
 * session/fingerprint is cleared.
 */
export interface MobileDeviceIdentity {
    /** e.g. 'SM-S928B' — used in sec-ch-ua-model and the app user-agent */
    model: string
    /** Android major version, e.g. 14 */
    androidVersion: number
    /** Bing Sapphire Android app build (same for every account — it's the app, not the device) */
    appVersion: string
    /** Rewards platform channel that matches the Android app */
    channel: string
    /** X-Rewards-AppId value, e.g. 'SAAndroid/34.2.0.3241102' */
    appId: string
}

// Canonical Android model pool. Kept here (not in UserAgent.ts) so the browser
// UA and the app UA describe the same phone from a single source of truth.
export const MOBILE_MODELS = [
    // Samsung Galaxy S series
    'SM-S928B', // Galaxy S24 Ultra
    'SM-S926B', // Galaxy S24+
    'SM-S921B', // Galaxy S24
    'SM-S918B', // Galaxy S23 Ultra
    'SM-S916B', // Galaxy S23+
    'SM-S911B', // Galaxy S23
    // Samsung Galaxy A series
    'SM-A556B', // Galaxy A55 5G
    'SM-A546B', // Galaxy A54 5G
    'SM-A356B', // Galaxy A35 5G
    'SM-A346B', // Galaxy A34 5G
    'SM-A256B', // Galaxy A25 5G
    'SM-A156B', // Galaxy A15 5G
    // Samsung Galaxy Z series
    'SM-F956B', // Galaxy Z Fold6
    'SM-F946B', // Galaxy Z Fold5
    'SM-F741B', // Galaxy Z Flip6
    'SM-F731B', // Galaxy Z Flip5
    // Google Pixel
    'Pixel 9 Pro XL',
    'Pixel 9 Pro',
    'Pixel 9',
    'Pixel 8 Pro',
    'Pixel 8',
    'Pixel 8a',
    'Pixel 7 Pro',
    'Pixel 7',
    // OnePlus
    'CPH2581', // OnePlus 12
    'CPH2449', // OnePlus 11
    // Motorola
    'moto g84 5G',
    'moto g54 5G'
] as const

const MIN_ANDROID_VERSION = 13
const MAX_ANDROID_VERSION = 15

// Current Microsoft Rewards / Bing (Sapphire) Android app build, in the real
// `major.minor.build` shape the platform accepts (cf. the previously-working iOS
// value '33.4.440603001'). Update occasionally so the fleet tracks the shipping
// app version. Intentionally shared across accounts — real users run the same app.
export const BING_SAPPHIRE_APP_VERSION = '34.2.470801002'
export const REWARDS_APP_CHANNEL = 'SAAndroid'

/** Deterministic unsigned int in [0, mod) from a seed + salt. */
function seededIndex(seed: string, salt: string, mod: number): number {
    const digest = createHash('sha256').update(`${seed}::${salt}`).digest()
    return digest.readUInt32BE(0) % mod
}

/** Stable identity for one account. */
export function deriveMobileDeviceIdentity(account: Pick<Account, 'accountId' | 'email'>): MobileDeviceIdentity {
    const seed = (account.accountId?.trim() || account.email?.trim().toLowerCase() || 'default-device')
    const model = MOBILE_MODELS[seededIndex(seed, 'model', MOBILE_MODELS.length)] ?? 'Pixel 8'
    const androidVersion =
        MIN_ANDROID_VERSION + seededIndex(seed, 'android', MAX_ANDROID_VERSION - MIN_ANDROID_VERSION + 1)

    return {
        model,
        androidVersion,
        appVersion: BING_SAPPHIRE_APP_VERSION,
        channel: REWARDS_APP_CHANNEL,
        appId: `${REWARDS_APP_CHANNEL}/${BING_SAPPHIRE_APP_VERSION}`
    }
}

/**
 * Builds the Bing Sapphire (Android) app user-agent for this device, aligned to
 * the same Chromium version the browser session reports.
 */
export function buildAppUserAgent(device: MobileDeviceIdentity, chromeReducedVersion: string): string {
    const chrome = chromeReducedVersion || '131.0.0.0'
    return (
        `Mozilla/5.0 (Linux; Android ${device.androidVersion}; ${device.model}) ` +
        `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Mobile Safari/537.36 ` +
        `BingSapphire/${device.appVersion}`
    )
}

/** Extracts the `Chrome/x.y.z.w` version from any Chromium-based UA (fallback safe). */
export function extractChromeVersion(userAgent: string | undefined): string {
    const match = userAgent?.match(/Chrome\/([\d.]+)/)
    return match?.[1] ?? '131.0.0.0'
}

/**
 * The single, consistent Rewards app/platform header set for one account.
 * Every app call (dashboard, earnable, read-to-earn, check-in, promotions)
 * must use this so the platform sees one coherent client contract.
 */
export function buildAppHeaders(params: {
    accessToken: string
    geoLocale: string
    langCode: string
    device: MobileDeviceIdentity
    appUserAgent: string
    extra?: Record<string, string>
}): Record<string, string> {
    return {
        Authorization: `Bearer ${params.accessToken}`,
        'User-Agent': params.appUserAgent,
        Accept: '*/*',
        'X-Rewards-AppId': params.device.appId,
        'X-Rewards-PartnerId': 'startapp',
        'X-Rewards-Country': params.geoLocale,
        'X-Rewards-Language': params.langCode || 'en',
        'X-Rewards-Flights': 'rwgobig',
        'X-Rewards-IsMobile': 'true',
        ...(params.extra ?? {})
    }
}
