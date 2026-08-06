import type { Account } from '../interface/Account';
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
    model: string;
    /** Android major version, e.g. 14 */
    androidVersion: number;
    /** Bing Sapphire Android app build (same for every account — it's the app, not the device) */
    appVersion: string;
    /** Rewards platform channel that matches the Android app */
    channel: string;
    /** X-Rewards-AppId value, e.g. 'SAAndroid/34.2.0.3241102' */
    appId: string;
}
export declare const MOBILE_MODELS: readonly ["SM-S928B", "SM-S926B", "SM-S921B", "SM-S918B", "SM-S916B", "SM-S911B", "SM-A556B", "SM-A546B", "SM-A356B", "SM-A346B", "SM-A256B", "SM-A156B", "SM-F956B", "SM-F946B", "SM-F741B", "SM-F731B", "Pixel 9 Pro XL", "Pixel 9 Pro", "Pixel 9", "Pixel 8 Pro", "Pixel 8", "Pixel 8a", "Pixel 7 Pro", "Pixel 7", "CPH2581", "CPH2449", "moto g84 5G", "moto g54 5G"];
export declare const BING_SAPPHIRE_APP_VERSION = "34.2.470801002";
export declare const REWARDS_APP_CHANNEL = "SAAndroid";
/** Stable identity for one account. */
export declare function deriveMobileDeviceIdentity(account: Pick<Account, 'accountId' | 'email'>): MobileDeviceIdentity;
/**
 * Builds the Bing Sapphire (Android) app user-agent for this device, aligned to
 * the same Chromium version the browser session reports.
 */
export declare function buildAppUserAgent(device: MobileDeviceIdentity, chromeReducedVersion: string): string;
/** Extracts the `Chrome/x.y.z.w` version from any Chromium-based UA (fallback safe). */
export declare function extractChromeVersion(userAgent: string | undefined): string;
/**
 * The single, consistent Rewards app/platform header set for one account.
 * Every app call (dashboard, earnable, read-to-earn, check-in, promotions)
 * must use this so the platform sees one coherent client contract.
 */
export declare function buildAppHeaders(params: {
    accessToken: string;
    geoLocale: string;
    langCode: string;
    device: MobileDeviceIdentity;
    appUserAgent: string;
    extra?: Record<string, string>;
}): Record<string, string>;
//# sourceMappingURL=DeviceIdentity.d.ts.map