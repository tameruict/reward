"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const urls_1 = require("../constants/urls");
const ghost_cursor_playwright_port_1 = require("ghost-cursor-playwright-port");
class BrowserUtils {
    bot;
    suspendedAccountNotified = new Set();
    rewardsOrigin = new URL(urls_1.REWARDS_BASE_URL).origin;
    suspendedAccountPatterns = [
        /\b(?:your\s+)?microsoft\s+rewards\s+account\s+(?:has\s+been|is)\s+suspended\b/i,
        /\bwe(?:'ve|\s+have)\s+suspended\s+(?:your\s+)?microsoft\s+rewards\s+account\b/i,
        /\byou(?:'re|\s+are)\s+suspended\s+from\s+(?:the\s+)?microsoft\s+rewards(?:\s+program)?\b/i,
        /\byour\s+access\s+to\s+(?:the\s+)?microsoft\s+rewards(?:\s+program)?\s+(?:has\s+been|is)\s+suspended\b/i,
        /\byou\s+can\s+no\s+longer\s+participate\s+in\s+(?:the\s+)?microsoft\s+rewards(?:\s+program)?\b/i
    ];
    constructor(bot) {
        this.bot = bot;
    }
    /**
     * Detects the Rewards suspension page and emits a notification once per account.
     * The page can still be hosted on rewards.bing.com, so URL-only checks are not enough.
     */
    async checkSuspendedAccount(page, accountEmail) {
        if (page.isClosed())
            return false;
        try {
            if (new URL(page.url()).origin !== this.rewardsOrigin)
                return false;
        }
        catch {
            return false;
        }
        const [title, bodyText] = await Promise.all([
            page.title().catch(() => ''),
            page
                .locator('body')
                .innerText({ timeout: 1000 })
                .catch(() => '')
        ]);
        const pageText = `${title} ${bodyText}`.replace(/\s+/g, ' ').trim();
        const hasSuspensionSignal = this.suspendedAccountPatterns.some(pattern => pattern.test(pageText));
        if (!hasSuspensionSignal)
            return false;
        const email = accountEmail ?? this.bot.currentAccountEmail ?? 'unknown account';
        if (!this.suspendedAccountNotified.has(email)) {
            this.suspendedAccountNotified.add(email);
            this.bot.logger.error(this.bot.isMobile, 'ACCOUNT-UNUSABLE', `Account cannot be used: ${email} | Microsoft Rewards account has been suspended`);
        }
        return true;
    }
    async tryDismissAllMessages(page) {
        try {
            const buttons = [
                { selector: '#acceptButton', label: 'AcceptButton' },
                { selector: '#wcpConsentBannerCtrl > * > button:first-child', label: 'Bing Cookies Accept' },
                { selector: '.ext-secondary.ext-button', label: '"Skip for now" Button' },
                { selector: '#iLandingViewAction', label: 'iLandingViewAction' },
                { selector: '#iShowSkip', label: 'iShowSkip' },
                { selector: '#iNext', label: 'iNext' },
                { selector: '#iLooksGood', label: 'iLooksGood' },
                { selector: '#idSIButton9', label: 'idSIButton9' },
                { selector: '.ms-Button.ms-Button--primary', label: 'Primary Button' },
                { selector: '.c-glyph.glyph-cancel', label: 'Mobile Welcome Button' },
                { selector: '.maybe-later', label: 'Mobile Rewards App Banner' },
                { selector: '#bnp_btn_accept', label: 'Bing Cookie Banner' },
                { selector: '#reward_pivot_earn', label: 'Reward Coupon Accept' }
            ];
            const checkVisible = await Promise.allSettled(buttons.map(async (b) => ({
                ...b,
                isVisible: await page
                    .locator(b.selector)
                    .isVisible()
                    .catch(() => false)
            })));
            const visibleButtons = checkVisible
                .filter(r => r.status === 'fulfilled' && r.value.isVisible)
                .map(r => (r.status === 'fulfilled' ? r.value : null))
                .filter(Boolean);
            if (visibleButtons.length > 0) {
                await Promise.allSettled(visibleButtons.map(async (b) => {
                    if (b) {
                        const clicked = await this.ghostClick(page, b.selector);
                        if (clicked) {
                            this.bot.logger.debug(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', `Dismissed: ${b.label}`);
                        }
                    }
                }));
                await this.bot.utils.wait(300);
            }
            // Overlay
            const overlay = await page.$('#bnp_overlay_wrapper');
            if (overlay) {
                const rejected = await this.ghostClick(page, '#bnp_btn_reject, button[aria-label*="Reject" i]');
                if (rejected) {
                    this.bot.logger.debug(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Bing Overlay Reject');
                }
                else {
                    const accepted = await this.ghostClick(page, '#bnp_btn_accept');
                    if (accepted) {
                        this.bot.logger.debug(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Bing Overlay Accept');
                    }
                }
                await this.bot.utils.wait(250);
            }
        }
        catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', `Handler error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getLatestTab(page) {
        try {
            const browser = page.context();
            const pages = browser.pages();
            const newTab = pages[pages.length - 1];
            if (!newTab) {
                const error = new Error('No tabs could be found!');
                this.bot.logger.error(this.bot.isMobile, 'GET-NEW-TAB', error.message);
                throw error;
            }
            return newTab;
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'GET-NEW-TAB', `Unable to get latest tab: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async reloadBadPage(page) {
        try {
            const html = await page.content().catch(() => '');
            const isBadPage = /<body[^>]*\bclass=["'][^"']*\bneterror\b/i.test(html);
            if (isBadPage) {
                this.bot.logger.info(this.bot.isMobile, 'RELOAD-BAD-PAGE', 'Bad page detected, reloading!');
                try {
                    await page.reload({ waitUntil: 'load' });
                }
                catch {
                    await page.reload().catch(() => { });
                }
                return true;
            }
            else {
                return false;
            }
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'RELOAD-BAD-PAGE', `Reload check failed: ${error instanceof Error ? error.message : String(error)}`);
            return true;
        }
    }
    async closeTabs(page, config = { minTabs: 1, maxTabs: 1 }) {
        try {
            const browser = page.context();
            const tabs = browser.pages();
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-CLOSE-TABS', `Found ${tabs.length} tab(s) open (min: ${config.minTabs}, max: ${config.maxTabs})`);
            // Check if valid
            if (config.minTabs < 1 || config.maxTabs < config.minTabs) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-CLOSE-TABS', 'Invalid config, using defaults');
                config = { minTabs: 1, maxTabs: 1 };
            }
            // Close if more than max config
            if (tabs.length > config.maxTabs) {
                const tabsToClose = tabs.slice(config.maxTabs);
                const closeResults = await Promise.allSettled(tabsToClose.map(tab => tab.close()));
                const closedCount = closeResults.filter(r => r.status === 'fulfilled').length;
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-CLOSE-TABS', `Closed ${closedCount}/${tabsToClose.length} excess tab(s) to reach max of ${config.maxTabs}`);
                // Open more tabs
            }
            else if (tabs.length < config.minTabs) {
                const tabsNeeded = config.minTabs - tabs.length;
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-CLOSE-TABS', `Opening ${tabsNeeded} tab(s) to reach min of ${config.minTabs}`);
                const newTabPromises = Array.from({ length: tabsNeeded }, async () => {
                    try {
                        const newPage = await browser.newPage();
                        await newPage.goto(urls_1.REWARDS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
                        return newPage;
                    }
                    catch (error) {
                        this.bot.logger.warn(this.bot.isMobile, 'SEARCH-CLOSE-TABS', `Failed to create new tab: ${error instanceof Error ? error.message : String(error)}`);
                        return null;
                    }
                });
                await Promise.allSettled(newTabPromises);
            }
            const latestTab = await this.getLatestTab(page);
            return latestTab;
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'SEARCH-CLOSE-TABS', `Error: ${error instanceof Error ? error.message : String(error)}`);
            return page;
        }
    }
    async ghostClick(page, selector, options) {
        try {
            this.bot.logger.debug(this.bot.isMobile, 'GHOST-CLICK', `Trying to click selector: ${selector}, options: ${JSON.stringify(options)}`);
            // Wait for selector to exist before clicking
            await page.waitForSelector(selector, { timeout: 1000 }).catch(() => { });
            // ghost-cursor expects its own Playwright Page type from a different
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cursor = (0, ghost_cursor_playwright_port_1.createCursor)(page);
            await cursor.click(selector, options);
            return true;
        }
        catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'GHOST-CLICK', `Failed for ${selector}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    async disableFido(page) {
        const routePattern = '**/GetCredentialType.srf*';
        await page.route(routePattern, route => {
            try {
                const request = route.request();
                const postData = request.postData();
                const body = postData ? JSON.parse(postData) : {};
                body.isFidoSupported = false;
                this.bot.logger.debug(this.bot.isMobile, 'DISABLE-FIDO', `Modified request body: isFidoSupported set to ${body.isFidoSupported}`);
                route.continue({
                    postData: JSON.stringify(body),
                    headers: {
                        ...request.headers(),
                        'Content-Type': 'application/json'
                    }
                });
            }
            catch (error) {
                this.bot.logger.debug(this.bot.isMobile, 'DISABLE-FIDO', `An error occurred: ${error instanceof Error ? error.message : String(error)}`);
                route.continue();
            }
        });
    }
}
exports.default = BrowserUtils;
//# sourceMappingURL=BrowserUtils.js.map