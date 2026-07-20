"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PunchcardManager = void 0;
class PunchcardManager {
    bot;
    constructor(bot) {
        this.bot = bot;
    }
    async runMobile(data) {
        try {
            await this.bot.workers.doPunchCards(data, this.bot.mainMobilePage);
        }
        catch (error) {
            this.bot.logger.error('main', 'PUNCHCARD-MANAGER', `Mobile punchcards failed | ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async runDesktop() {
        let data = null;
        try {
            data = await this.bot.browser.func.getDashboardData(this.bot.cookies.desktop);
        }
        catch (error) {
            this.bot.logger.warn('main', 'PUNCHCARD-MANAGER', `Desktop punchcard data unavailable (non-fatal) | ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!this.bot.config.workers.doPunchCards || !data)
            return;
        try {
            await this.bot.workers.doPunchCards(data, this.bot.mainDesktopPage);
        }
        catch (error) {
            this.bot.logger.error('main', 'PUNCHCARD-MANAGER', `Desktop punchcards failed | ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.PunchcardManager = PunchcardManager;
//# sourceMappingURL=PunchcardManager.js.map