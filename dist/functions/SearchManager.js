"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchManager = void 0;
const index_1 = require("../index");
const urls_1 = require("../constants/urls");
class SearchManager {
    bot;
    constructor(bot) {
        this.bot = bot;
    }
    async getSearchPoints() {
        const counters = await this.bot.browser.func.getSearchPoints();
        const mobileMissing = this.bot.browser.func.missingSearchPoints(counters, true).totalPoints;
        const desktopMissing = this.bot.browser.func.missingSearchPoints(counters, false).totalPoints;
        const doMobile = this.bot.config.workers.doMobileSearch && mobileMissing > 0;
        const doDesktop = this.bot.config.workers.doDesktopSearch && desktopMissing > 0;
        this.bot.logger.info('main', 'SEARCH-MANAGER', `Mobile: ${!this.bot.config.workers.doMobileSearch
            ? 'skip (disabled)'
            : mobileMissing <= 0
                ? 'skip (no points)'
                : `run (missing ${mobileMissing})`} | Desktop: ${!this.bot.config.workers.doDesktopSearch
            ? 'skip (disabled)'
            : desktopMissing <= 0
                ? 'skip (no points)'
                : `run (missing ${desktopMissing})`}`);
        return { doMobile, doDesktop, mobileMissing, desktopMissing };
    }
    searchMobile(account) {
        return index_1.executionContext.run({ isMobile: true, account }, async () => {
            try {
                return await this.bot.activities.doSearch(this.bot.mainMobilePage, true);
            }
            catch (error) {
                this.bot.logger.error('main', 'SEARCH-MANAGER', `Mobile search failed | ${error instanceof Error ? error.message : String(error)}`);
                return 0;
            }
        });
    }
    searchDesktop(account) {
        return index_1.executionContext.run({ isMobile: false, account }, async () => {
            try {
                return await this.bot.activities.doSearch(this.bot.mainDesktopPage, false);
            }
            catch (error) {
                this.bot.logger.error('main', 'SEARCH-MANAGER', `Desktop search failed | ${error instanceof Error ? error.message : String(error)}`);
                return 0;
            }
        });
    }
    async bonusMobile(account) {
        this.bot.logger.info('main', 'SEARCH-MANAGER', 'Starting bonus search farming');
        const gained = await index_1.executionContext.run({ isMobile: true, account }, async () => {
            try {
                return await this.bot.activities.doBonusSearches(this.bot.mainMobilePage);
            }
            catch (error) {
                this.bot.logger.error('main', 'SEARCH-MANAGER', `Bonus search failed | ${error instanceof Error ? error.message : String(error)}`);
                return 0;
            }
            finally {
                if (!this.bot.mainMobilePage.isClosed()) {
                    await this.bot.mainMobilePage.goto(urls_1.URLs.bing.origin).catch(() => { });
                }
            }
        });
        this.bot.logger.info('main', 'SEARCH-MANAGER', `Bonus search summary | pointsGained=${gained} | currentBalance=${this.bot.userData.currentPoints}`);
        return gained;
    }
}
exports.SearchManager = SearchManager;
//# sourceMappingURL=SearchManager.js.map