import type { Locator, Page } from 'patchright'
import { randomBytes } from 'crypto'

import { URLs } from '../../../constants/urls'
import { QueryCore } from '../../QueryEngine'
import { Workers } from '../../Workers'
import { BonusTracker } from '../SearchBonus'
import type { SearchTracker } from '../../../interface/Search'
import type { MissingSearchPoints } from '../../../interface/Points'
import type { MicrosoftRewardsBot } from '../../../index'

const REFRESH_EVERY = 10
const MAX_QUERY_ATTEMPTS = 5
const MAX_MEASUREMENT_FAILURES = 3
const BING_NAVIGATION_TIMEOUT = 20000
const BING_DOM_READY_TIMEOUT = 8000
const RESULT_READY_TIMEOUT = 8000

const POINTS_MAX_SEARCHES = 100
const POINTS_STAGNANT_LIMIT = 10

const SEARCH_BOX_SELECTORS = ['#sb_form_q', 'textarea[name="q"]', 'input[name="q"]'] as const
const RESULT_LINK_SELECTORS = ['#b_results .b_algo h2 a', '#b_results .b_algo a[href]', 'main .b_algo h2 a'] as const

interface SessionStats {
    totalGained: number
    performed: number
    stagnant: number
}

export class Search extends Workers {
    private searchCount = 0

    public async doSearch(page: Page, isMobile: boolean): Promise<number> {
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)
        this.bot.logger.info(isMobile, 'SEARCH-BING', `Starting Bing searches | currentBalance=${startBalance}`)

        const tracker = new PointsTracker(this.bot, isMobile, page)
        try {
            const stats = await this.runSearchSession(page, isMobile, tracker)

            if (stats.performed >= tracker.maxSearches && !tracker.done()) {
                this.bot.logger.warn(
                    isMobile,
                    tracker.context,
                    `Hit the ${tracker.maxSearches}-search ceiling with points still missing | ${tracker.progress()}`
                )
            }

            this.bot.logger.info(
                isMobile,
                tracker.context,
                `Completed Bing searches | pointsGained=${stats.totalGained} | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${startBalance} | searches=${stats.performed} | ${tracker.progress()}`
            )
            return stats.totalGained
        } finally {
            await this.navigateToBing(page, URLs.bing.origin, isMobile).catch(() => {})
        }
    }

    public async doBonusSearches(page: Page): Promise<number> {
        const isMobile = this.bot.isMobile
        const tracker = new BonusTracker(this.bot, isMobile, page)

        const stats = await this.runSearchSession(page, isMobile, tracker)

        // No active offer (or the feature is off): prepare() already logged why
        if (!tracker.started) return 0

        const done = tracker.done() && !tracker.offerLost
        const reason = done
            ? 'offer complete'
            : tracker.offerLost
              ? 'offer no longer present'
              : stats.performed >= tracker.maxSearches
                ? 'reached maxBonusSearches'
                : stats.stagnant >= tracker.stagnantLimit
                  ? `${tracker.stagnantLimit} idle searches`
                  : 'query pool exhausted'

        this.bot.logger.info(
            isMobile,
            tracker.context,
            `Bonus farming ${done ? 'complete' : 'stopped'} (${reason}) | pointsGained=${stats.totalGained} | currentBalance=${this.bot.userData.currentPoints} | ${tracker.progress()} | searches=${stats.performed}`,
            done || stats.totalGained > 0 ? 'green' : undefined
        )
        return stats.totalGained
    }

    private async runSearchSession(page: Page, isMobile: boolean, tracker: SearchTracker): Promise<SessionStats> {
        const stats: SessionStats = { totalGained: 0, performed: 0, stagnant: 0 }
        let measurementFailures = 0

        try {
            const ready = await tracker.prepare()
            if (!ready) return stats

            const queryCore = new QueryCore(this.bot)
            let queries = await this.generatePool(queryCore)
            if (!queries.length) {
                this.bot.logger.warn(isMobile, tracker.context, 'No queries available, skipping')
                return stats
            }
            this.bot.logger.info(isMobile, tracker.context, `Query pool ready | count=${queries.length}`)

            await this.navigateToBing(page, URLs.bing.origin, isMobile)

            let index = 0

            while (!tracker.done() && stats.performed < tracker.maxSearches && stats.stagnant < tracker.stagnantLimit) {
                // Out of queries: pull a fresh batch, dedupe, and reshuffle
                if (index >= queries.length) {
                    const extra = await this.generatePool(queryCore)
                    queries = this.bot.utils.shuffleArray([...new Set([...queries, ...extra])])
                    if (index >= queries.length) {
                        this.bot.logger.warn(isMobile, tracker.context, 'Query pool exhausted, stopping')
                        break
                    }
                    this.bot.logger.debug(isMobile, tracker.context, `Query pool regenerated | count=${queries.length}`)
                }

                // Query still has to be decoded, RSS entries often have html entities, but to add a whole dependancy for that? Doesn't look natural however
                const query = queries[index++] as string
                await this.bingSearch(page, query, isMobile)
                stats.performed++

                let gained: number
                try {
                    gained = await tracker.measure()
                    measurementFailures = 0
                } catch (error) {
                    measurementFailures++
                    this.bot.logger.warn(
                        isMobile,
                        tracker.context,
                        `Could not refresh search progress | failure=${measurementFailures}/${MAX_MEASUREMENT_FAILURES} | ${error instanceof Error ? error.message : String(error)}`
                    )

                    if (measurementFailures >= MAX_MEASUREMENT_FAILURES) throw error

                    await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
                    continue
                }

                if (gained > 0) {
                    stats.stagnant = 0
                    stats.totalGained += gained
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `pointsGained=${gained} | currentBalance=${this.bot.userData.currentPoints} | query="${query}" | ${tracker.progress()}`,
                        'green'
                    )
                } else {
                    stats.stagnant++
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `no points ${stats.stagnant}/${tracker.stagnantLimit} | query="${query}" | ${tracker.progress()}`
                    )
                }
            }

            return stats
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                tracker.context,
                `Search session error | ${error instanceof Error ? error.message : String(error)}`
            )
            return stats
        }
    }

    private async generatePool(queryCore: QueryCore): Promise<string[]> {
        const pool = await queryCore.queryManager({
            shuffle: true,
            related: true,
            langCode: (this.bot.userData.langCode ?? 'en').toLowerCase(),
            geoLocale: (this.bot.userData.geoLocale ?? 'US').toUpperCase(),
            sourceOrder: this.bot.config.searchSettings.queryEngines
        })
        return [...new Set(pool.map(q => q.trim()).filter(Boolean))]
    }

    private async bingSearch(page: Page, query: string, isMobile: boolean): Promise<void> {
        this.searchCount++

        if (this.searchCount % REFRESH_EVERY === 0) {
            await this.navigateToBing(page, URLs.bing.origin, isMobile)
        }

        let lastError: unknown
        for (let attempt = 1; attempt <= MAX_QUERY_ATTEMPTS; attempt++) {
            try {
                const { selector, searchBox } = await this.ensureSearchBox(page, query, isMobile)

                await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: 'auto' }))
                await page.keyboard.press('Home')
                await searchBox.waitFor({ state: 'visible', timeout: 5000 })

                await this.bot.utils.wait(1000)
                await this.bot.browser.utils.ghostClick(page, selector, { clickCount: 3 })
                await searchBox.fill('')

                await page.keyboard.type(query, { delay: this.bot.utils.randomDelay(45, 90) })
                await page.keyboard.press('Enter')
                await page.waitForLoadState('domcontentloaded', { timeout: BING_DOM_READY_TIMEOUT }).catch(() => {})
                await this.bot.utils.wait(1500)

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.randomScroll(page, isMobile)
                }
                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.clickRandomLink(page, isMobile)
                }

                await this.bot.utils.wait(
                    this.bot.utils.randomDelay(
                        this.bot.config.searchSettings.searchDelay.min,
                        this.bot.config.searchSettings.searchDelay.max
                    )
                )

                return
            } catch (error) {
                lastError = error
                const message = error instanceof Error ? error.message : String(error)
                this.bot.logger.warn(
                    isMobile,
                    'SEARCH-BING',
                    `Search attempt ${attempt}/${MAX_QUERY_ATTEMPTS} failed | query="${query}" | ${message}`
                )

                if (this.bot.http.usesProxy && (/locator\.waitFor/i.test(message) || /#sb_form_q/i.test(message))) {
                    // If the proxy died after browser launch, stop the five-attempt
                    // locator loop immediately instead of waiting on an empty page.
                    await this.bot.http.assertProxyReady(true)
                }
                await this.recoverSearchPage(page, isMobile)
                await this.bot.utils.wait(2000)
            }
        }

        throw new Error(
            `Bing search failed after ${MAX_QUERY_ATTEMPTS} attempts | query="${query}" | ${lastError instanceof Error ? lastError.message : String(lastError)}`
        )
    }

    private async ensureSearchBox(
        page: Page,
        query: string,
        isMobile: boolean
    ): Promise<{ selector: string; searchBox: Locator }> {
        const existing = await this.visibleSearchBox(page)
        if (existing) return existing

        await this.recoverSearchPage(page, isMobile)

        const recovered = await this.visibleSearchBox(page, 5000)
        if (recovered) return recovered

        const cvid = randomBytes(16).toString('hex')
        await this.navigateToBing(page, URLs.bing.search(query, cvid), isMobile)

        const afterDirectSearch = await this.visibleSearchBox(page, 5000)
        if (afterDirectSearch) return afterDirectSearch

        const title = await page.title().catch(() => 'unknown')
        throw new Error(`Bing search box not visible | url=${page.url()} | title="${title}"`)
    }

    private async visibleSearchBox(
        page: Page,
        timeout = 750
    ): Promise<{ selector: string; searchBox: Locator } | null> {
        for (const selector of SEARCH_BOX_SELECTORS) {
            const searchBox = page.locator(selector).first()
            const visible = await searchBox.isVisible({ timeout }).catch(() => false)
            if (visible) return { selector, searchBox }
        }
        return null
    }

    private async recoverSearchPage(page: Page, isMobile: boolean): Promise<void> {
        const before = page.url()
        await this.bot.browser.utils.reloadBadPage(page).catch(() => false)
        await this.bot.browser.utils.tryDismissAllMessages(page)
        if (await this.visibleSearchBox(page).catch(() => null)) return

        await this.navigateToBing(page, URLs.bing.origin, isMobile)

        if (before !== page.url()) {
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `Recovered search page | from=${before} | to=${page.url()}`)
        }
    }

    private async randomScroll(page: Page, isMobile: boolean) {
        try {
            const viewportHeight = await page.evaluate(() => window.innerHeight)
            const totalHeight = await page.evaluate(() => document.body.scrollHeight)
            const scrollPos = Math.floor(Math.random() * Math.max(1, totalHeight - viewportHeight))
            await page.evaluate(pos => window.scrollTo({ left: 0, top: pos, behavior: 'auto' }), scrollPos)
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-RANDOM-SCROLL',
                `Failed during random scroll | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async clickRandomLink(page: Page, isMobile: boolean) {
        try {
            const resultSelector = await this.visibleResultLink(page, RESULT_READY_TIMEOUT)
            if (!resultSelector) {
                this.bot.logger.debug(
                    isMobile,
                    'SEARCH-RANDOM-CLICK',
                    `No visible organic result; skipping click | url=${page.url()}`
                )
                return
            }

            const searchPageUrl = page.url()
            const clicked = await this.bot.browser.utils.ghostClick(page, resultSelector)
            if (!clicked) return

            await this.bot.utils.wait(this.bot.config.searchSettings.searchResultVisitTime)

            if (isMobile) {
                await this.navigateToBing(page, searchPageUrl, isMobile)
            } else {
                const newTab = await this.bot.browser.utils.getLatestTab(page)
                await this.bot.browser.utils.closeTabs(newTab)
            }
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-RANDOM-CLICK',
                `Failed during random click | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async visibleResultLink(page: Page, timeout: number): Promise<string | null> {
        const deadline = Date.now() + timeout

        while (Date.now() < deadline) {
            for (const selector of RESULT_LINK_SELECTORS) {
                const visible = await page
                    .locator(selector)
                    .first()
                    .isVisible({ timeout: Math.min(500, Math.max(1, deadline - Date.now())) })
                    .catch(() => false)
                if (visible) return selector
            }
            await this.bot.utils.wait(250)
        }

        return null
    }

    private async navigateToBing(page: Page, url: string, isMobile: boolean): Promise<void> {
        await page.goto(url, {
            waitUntil: 'commit',
            timeout: BING_NAVIGATION_TIMEOUT
        })

        const domReady = await page
            .waitForLoadState('domcontentloaded', { timeout: BING_DOM_READY_TIMEOUT })
            .then(() => true)
            .catch(() => false)

        if (!domReady) {
            this.bot.logger.debug(
                isMobile,
                'SEARCH-BING',
                `DOMContentLoaded not observed; continuing after committed navigation | url=${page.url()}`
            )
        }

        await this.bot.browser.utils.tryDismissAllMessages(page)
    }
}

class PointsTracker implements SearchTracker {
    public readonly context = 'SEARCH-BING'
    public readonly maxSearches = POINTS_MAX_SEARCHES
    public readonly stagnantLimit = POINTS_STAGNANT_LIMIT

    private missing: MissingSearchPoints = { mobilePoints: 0, desktopPoints: 0, edgePoints: 0, totalPoints: 0 }
    private readonly runOnZeroPoints: boolean

    constructor(
        private bot: MicrosoftRewardsBot,
        private isMobile: boolean,
        private page: Page
    ) {
        this.runOnZeroPoints = this.bot.config.searchSettings.runOnZeroPoints ?? false
    }

    async prepare(): Promise<boolean> {
        this.missing = this.bot.browser.func.missingSearchPoints(
            await this.bot.browser.func.getSearchPoints(this.page),
            this.isMobile
        )
        this.bot.logger.info(
            this.isMobile,
            this.context,
            `Search points remaining | edge=${this.missing.edgePoints} | desktop=${this.missing.desktopPoints} | mobile=${this.missing.mobilePoints}`
        )

        if (this.missing.totalPoints <= 0) {
            if (!this.runOnZeroPoints) {
                this.bot.logger.info(
                    this.isMobile,
                    this.context,
                    'No search points to earn, skipping (runOnZeroPoints is disabled)'
                )
                return false
            }
            this.bot.logger.info(
                this.isMobile,
                this.context,
                'No search points reported, but runOnZeroPoints is enabled, searching anyway'
            )
        }
        return true
    }

    async measure(): Promise<number> {
        const updated = this.bot.browser.func.missingSearchPoints(
            await this.bot.browser.func.getSearchPoints(this.page),
            this.isMobile
        )
        const gained = Math.max(0, this.missing.totalPoints - updated.totalPoints)
        this.missing = updated

        if (gained > 0) {
            this.bot.userData.currentPoints = Number(this.bot.userData.currentPoints ?? 0) + gained
            this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
        }
        return gained
    }

    done(): boolean {
        return !this.runOnZeroPoints && this.missing.totalPoints <= 0
    }

    progress(): string {
        return `remaining=${this.missing.totalPoints}`
    }
}
