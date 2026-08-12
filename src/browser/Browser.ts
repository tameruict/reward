import rebrowser, { BrowserContext } from 'patchright'
import { newInjectedContext } from 'fingerprint-injector'
import { BrowserFingerprintWithHeaders, FingerprintGenerator } from 'fingerprint-generator'
import net from 'node:net'

import type { MicrosoftRewardsBot } from '../index'
import { loadSession, saveFingerprint } from '../util/SessionStore'
import { parseProxyConfig } from '../util/ProxyConfig'
import { UserAgentManager } from './UserAgent'
import { resolveGeoProfile, type GeoProfile } from './GeoProfile'

import type { Account, AccountProxy } from '../interface/Account'

/* Test Stuff
https://abrahamjuliot.github.io/creepjs/
https://botcheck.luminati.io/
https://fv.pro/
https://pixelscan.net/
https://www.browserscan.net/
*/

interface BrowserCreationResult {
    context: BrowserContext
    fingerprint: BrowserFingerprintWithHeaders
}

class Browser {
    private readonly bot: MicrosoftRewardsBot
    private static readonly BROWSER_ARGS = [
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-web-authentication-ui',
        '--disable-external-intent-requests',
        '--disable-blink-features=AutomationControlled,Attestation',
        '--disable-features=WebAuthentication,PasswordManagerOnboarding,PasswordManager,EnablePasswordsAccountStorage,Passkeys,WebAuthenticationProxy,U2F',
        '--disable-save-password-bubble',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-component-update',
        // WebRTC IP-leak protection at the network layer. `disable_non_proxied_udp`
        // forces ICE to use only the proxied path, so STUN/ICE never gathers the
        // machine's real local/public IP — while the WebRTC API stays present and
        // native (deleting RTCPeerConnection is itself a detectable bot tell).
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--enforce-webrtc-ip-permission-check'
    ] as const

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async createBrowser(account: Account): Promise<BrowserCreationResult> {
        const headless = this.bot.config.headless

        const hasProxy = Boolean(account.proxy.url) && Number(account.proxy.port) > 0
        if (account.useProxy !== false && !hasProxy) {
            throw new Error(
                `Refusing to launch browser for ${account.email}: a valid account proxy is required and direct traffic is disabled`
            )
        }

        let browser: rebrowser.Browser
        try {
            if (hasProxy) {
                await this.assertProxyReachable(account.proxy)
            }

            const parsedProxy = hasProxy ? parseProxyConfig(account.proxy) : null

            // Chromium silently IGNORES SOCKS proxy credentials — an authenticated
            // SOCKS proxy would connect WITHOUT auth (leaking the real IP or failing),
            // even though the Impit health gate accepts SOCKS auth. Refuse rather than
            // launch into that mismatch.
            const isSocks = parsedProxy?.protocol === 'socks4' || parsedProxy?.protocol === 'socks5'
            if (isSocks && parsedProxy?.username && parsedProxy.password) {
                throw new Error(
                    `Refusing to launch browser for ${account.email}: Chromium cannot use authenticated ${parsedProxy.protocol} proxies (it ignores SOCKS credentials). Use an http(s) proxy for authenticated proxies, or an IP-whitelisted SOCKS proxy without username/password.`
                )
            }

            const proxyConfig = parsedProxy
                ? {
                      server: parsedProxy.server,
                      ...(parsedProxy.username &&
                          parsedProxy.password && {
                              username: parsedProxy.username,
                              password: parsedProxy.password
                          })
                  }
                : undefined

            const sandboxArgs = process.platform === 'win32' ? [] : ['--no-sandbox', '--disable-setuid-sandbox']

            const certArgs = hasProxy
                ? ['--ignore-certificate-errors', '--ignore-certificate-errors-spki-list', '--ignore-ssl-errors']
                : []

            this.bot.logger.info(
                this.bot.isMobile,
                'BROWSER',
                `Launching bundled patched Chromium (Edge UA) | headless: ${headless} | platform: ${process.platform} | proxy: ${hasProxy ? 'yes (TLS errors ignored)' : 'no (TLS validated)'}`
            )

            browser = await rebrowser.chromium.launch({
                headless,
                ...(proxyConfig && { proxy: proxyConfig }),
                args: [...Browser.BROWSER_ARGS, ...sandboxArgs, ...certArgs]
            })
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.bot.logger.error(this.bot.isMobile, 'BROWSER', `Browser launch failed: ${errorMessage}`)
            throw error
        }

        try {
            const session = loadSession(this.bot.config.sessionPath, account.email, this.bot.isMobile)

            const shouldUseFingerprint = this.bot.isMobile
                ? account.saveFingerprint.mobile
                : account.saveFingerprint.desktop

            // Align timezone/locale/geolocation with the account's country (which must
            // match the proxy exit country). Derived offline, stable per account.
            const geo = this.resolveGeo(account)

            const fingerprint =
                (shouldUseFingerprint && session?.fingerprint) ||
                (await this.generateFingerprint(this.bot.isMobile, geo?.locale))

            const screen = fingerprint.fingerprint.screen

            //@ts-expect-error It doesn't like the browser instance from different packages
            const injected = await newInjectedContext(browser, {
                fingerprint,
                newContextOptions: {
                    // Grant geolocation up-front so it can be aligned (and, for 'auto'
                    // accounts, updated after the dashboard reveals the country).
                    permissions: geo ? ['geolocation'] : [],
                    ignoreHTTPSErrors: hasProxy,
                    ...(geo
                        ? {
                              locale: geo.locale,
                              timezoneId: geo.timezoneId,
                              geolocation: {
                                  latitude: geo.latitude,
                                  longitude: geo.longitude,
                                  accuracy: geo.accuracy
                              }
                          }
                        : {}),
                    // Restore cookies
                    ...(session?.storageState ? { storageState: session.storageState } : {}),
                    ...(this.bot.isMobile
                        ? {
                              isMobile: true,
                              hasTouch: true,
                              deviceScaleFactor: screen.devicePixelRatio,
                              viewport: { width: screen.width, height: screen.height },
                              screen: { width: screen.width, height: screen.height }
                          }
                        : {})
                }
            })
            const context = injected as unknown as BrowserContext

            await context.addInitScript(() => {
                try {
                    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false })
                } catch {}

                const rejectWebAuthn = () => Promise.reject(new DOMException('WebAuthn disabled', 'NotAllowedError'))
                try {
                    Object.defineProperty(navigator, 'credentials', {
                        configurable: true,
                        get: () => ({
                            create: rejectWebAuthn,
                            get: rejectWebAuthn,
                            preventSilentAccess: () => Promise.resolve()
                        })
                    })
                } catch {}

                try {
                    if (window.PublicKeyCredential) {
                        window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () =>
                            Promise.resolve(false)
                    }
                } catch {}

                // NOTE: WebRTC real-IP leaks are prevented at the network layer via
                // the --force-webrtc-ip-handling-policy=disable_non_proxied_udp launch
                // flag (see BROWSER_ARGS). The RTCPeerConnection API is deliberately
                // left intact so the browser still looks like a normal Chromium.
            })

            context.on('page', p => {
                p.on('crash', () =>
                    this.bot.logger.error(this.bot.isMobile, 'BROWSER', `Renderer crashed | ${p.url()}`)
                )
                p.on('domcontentloaded', () => {
                    void this.bot.browser.utils.checkSuspendedAccount(p, account.email)
                })
            })
            context.on('close', () => this.bot.logger.warn(this.bot.isMobile, 'BROWSER', 'Browser context closed'))

            context.setDefaultTimeout(this.bot.utils.stringToNumber(this.bot.config?.globalTimeout ?? 30000))

            if (shouldUseFingerprint) {
                saveFingerprint(this.bot.config.sessionPath, account.email, this.bot.isMobile, fingerprint)
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'BROWSER',
                `Created context | User-Agent: "${fingerprint.fingerprint.navigator.userAgent}"`
            )
            if (geo) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'BROWSER-GEO',
                    `Aligned to ${geo.country} | tz=${geo.timezoneId} (offset ${geo.timezoneOffsetMinutes}m) | locale=${geo.locale} | geo=${geo.latitude},${geo.longitude}`
                )
            } else if (account.geoLocale?.toLowerCase() === 'auto') {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'BROWSER-GEO',
                    'geoLocale=auto: JS timezone/locale not emulated pre-login. Set an explicit 2-letter country per account (matching the proxy) for full alignment.'
                )
            }
            this.bot.logger.debug(this.bot.isMobile, 'BROWSER-FINGERPRINT', JSON.stringify(fingerprint))

            return { context, fingerprint }
        } catch (error) {
            await browser.close().catch(() => {})
            throw error
        }
    }

    private async assertProxyReachable(proxy: AccountProxy): Promise<void> {
        const { host, port } = parseProxyConfig(proxy)

        await new Promise<void>((resolve, reject) => {
            const socket = net.createConnection({ host, port })
            let settled = false

            const finish = (error?: Error) => {
                if (settled) return
                settled = true
                socket.destroy()
                if (error) reject(error)
                else resolve()
            }

            socket.setTimeout(8000, () =>
                finish(new Error(`Proxy endpoint is unreachable: connection timed out after 8000ms`))
            )
            socket.once('connect', () => finish())
            socket.once('error', error => {
                const errorCode = (error as NodeJS.ErrnoException).code
                finish(new Error(`Proxy endpoint is unreachable: ${errorCode || error.message}`))
            })
        })
    }

    private resolveGeo(account: Account): GeoProfile | null {
        const seed = account.accountId?.trim() || account.email?.trim().toLowerCase() || 'default'
        const country = account.geoLocale && account.geoLocale.toLowerCase() !== 'auto' ? account.geoLocale : undefined
        return resolveGeoProfile(country, seed)
    }

    async generateFingerprint(isMobile: boolean, locale?: string): Promise<BrowserFingerprintWithHeaders> {
        const hostOs: 'windows' | 'macos' | 'linux' =
            process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows'

        const fingerPrintData = new FingerprintGenerator().getFingerprint({
            devices: isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: isMobile ? ['android'] : [hostOs],
            browsers: [{ name: 'edge' }],
            // Align Accept-Language / navigator.languages with the proxy country.
            ...(locale ? { locales: [locale, locale.split('-')[0] ?? locale] } : {})
        })

        const userAgentManager = new UserAgentManager(this.bot)
        return await userAgentManager.updateFingerprintUserAgent(fingerPrintData, isMobile)
    }
}

export default Browser
