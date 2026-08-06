"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REWARDS_APP_CHANNEL = exports.BING_SAPPHIRE_APP_VERSION = exports.MOBILE_MODELS = void 0;
exports.deriveMobileDeviceIdentity = deriveMobileDeviceIdentity;
exports.buildAppUserAgent = buildAppUserAgent;
exports.extractChromeVersion = extractChromeVersion;
exports.buildAppHeaders = buildAppHeaders;
const node_crypto_1 = require("node:crypto");
// Canonical Android model pool. Kept here (not in UserAgent.ts) so the browser
// UA and the app UA describe the same phone from a single source of truth.
exports.MOBILE_MODELS = [
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
];
const MIN_ANDROID_VERSION = 13;
const MAX_ANDROID_VERSION = 15;
// Current Microsoft Rewards / Bing (Sapphire) Android app build, in the real
// `major.minor.build` shape the platform accepts (cf. the previously-working iOS
// value '33.4.440603001'). Update occasionally so the fleet tracks the shipping
// app version. Intentionally shared across accounts — real users run the same app.
exports.BING_SAPPHIRE_APP_VERSION = '34.2.470801002';
exports.REWARDS_APP_CHANNEL = 'SAAndroid';
/** Deterministic unsigned int in [0, mod) from a seed + salt. */
function seededIndex(seed, salt, mod) {
    const digest = (0, node_crypto_1.createHash)('sha256').update(`${seed}::${salt}`).digest();
    return digest.readUInt32BE(0) % mod;
}
/** Stable identity for one account. */
function deriveMobileDeviceIdentity(account) {
    const seed = (account.accountId?.trim() || account.email?.trim().toLowerCase() || 'default-device');
    const model = exports.MOBILE_MODELS[seededIndex(seed, 'model', exports.MOBILE_MODELS.length)] ?? 'Pixel 8';
    const androidVersion = MIN_ANDROID_VERSION + seededIndex(seed, 'android', MAX_ANDROID_VERSION - MIN_ANDROID_VERSION + 1);
    return {
        model,
        androidVersion,
        appVersion: exports.BING_SAPPHIRE_APP_VERSION,
        channel: exports.REWARDS_APP_CHANNEL,
        appId: `${exports.REWARDS_APP_CHANNEL}/${exports.BING_SAPPHIRE_APP_VERSION}`
    };
}
/**
 * Builds the Bing Sapphire (Android) app user-agent for this device, aligned to
 * the same Chromium version the browser session reports.
 */
function buildAppUserAgent(device, chromeReducedVersion) {
    const chrome = chromeReducedVersion || '131.0.0.0';
    return (`Mozilla/5.0 (Linux; Android ${device.androidVersion}; ${device.model}) ` +
        `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Mobile Safari/537.36 ` +
        `BingSapphire/${device.appVersion}`);
}
/** Extracts the `Chrome/x.y.z.w` version from any Chromium-based UA (fallback safe). */
function extractChromeVersion(userAgent) {
    const match = userAgent?.match(/Chrome\/([\d.]+)/);
    return match?.[1] ?? '131.0.0.0';
}
/**
 * The single, consistent Rewards app/platform header set for one account.
 * Every app call (dashboard, earnable, read-to-earn, check-in, promotions)
 * must use this so the platform sees one coherent client contract.
 */
function buildAppHeaders(params) {
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
    };
}
//# sourceMappingURL=DeviceIdentity.js.map