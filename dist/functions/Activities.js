"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// App
const DailyCheckIn_1 = require("./activities/app/DailyCheckIn");
const ReadToEarn_1 = require("./activities/app/ReadToEarn");
const AppReward_1 = require("./activities/app/AppReward");
// API
const UrlReward_1 = require("./activities/api/UrlReward");
const ClaimBonusPoints_1 = require("./activities/api/ClaimBonusPoints");
const EnsureStreakProtection_1 = require("./activities/api/EnsureStreakProtection");
const ClaimReward_1 = require("./activities/api/ClaimReward");
const ActivateSearchPerk_1 = require("./activities/api/ActivateSearchPerk");
const VisualSearch_1 = require("./activities/api/VisualSearch");
// Browser
const Search_1 = require("./activities/browser/Search");
const SearchOnBing_1 = require("./activities/browser/SearchOnBing");
// Experimental
const Search_2 = require("./activities/api/Search");
const SearchOnBing_2 = require("./activities/api/SearchOnBing");
class Activities {
    bot;
    constructor(bot) {
        this.bot = bot;
    }
    // Search activities
    doSearch = async (page, isMobile) => {
        if (this.bot.config.experimental.apiSearch) {
            return await new Search_2.Search(this.bot).doSearch(isMobile);
        }
        return await new Search_1.Search(this.bot).doSearch(page, isMobile);
    };
    doBonusSearches = async (page) => {
        if (this.bot.config.experimental.apiSearch) {
            return await new Search_2.Search(this.bot).doBonusSearches();
        }
        return await new Search_1.Search(this.bot).doBonusSearches(page);
    };
    doSearchOnBing = async (promotion, page) => {
        if (this.bot.config.experimental.apiSearchOnBing) {
            await new SearchOnBing_2.SearchOnBing(this.bot).doSearchOnBing(promotion);
            return;
        }
        await new SearchOnBing_1.SearchOnBing(this.bot).doSearchOnBing(promotion, page);
    };
    // API
    doUrlReward = async (promotion) => {
        const urlReward = new UrlReward_1.UrlReward(this.bot);
        await urlReward.doUrlReward(promotion);
    };
    doClaimBonusPoints = async () => {
        const claimBonusPoints = new ClaimBonusPoints_1.ClaimBonusPoints(this.bot);
        await claimBonusPoints.claimBonusPoints();
    };
    doEnsureStreakProtection = async () => {
        const ensureStreakProtection = new EnsureStreakProtection_1.EnsureStreakProtection(this.bot);
        await ensureStreakProtection.ensureStreakProtection();
    };
    doClaimReward = async (child, parentId) => {
        const claimReward = new ClaimReward_1.ClaimReward(this.bot);
        await claimReward.claimReward(child, parentId);
    };
    doActivateSearchPerk = async (data) => {
        const activateSearchPerk = new ActivateSearchPerk_1.ActivateSearchPerk(this.bot);
        await activateSearchPerk.activate(data);
    };
    doVisualSearch = async () => {
        const visualSearch = new VisualSearch_1.VisualSearch(this.bot);
        return await visualSearch.doVisualSearch();
    };
    // App
    doAppReward = async (promotion) => {
        const urlReward = new AppReward_1.AppReward(this.bot);
        await urlReward.doAppReward(promotion);
    };
    doReadToEarn = async () => {
        const readToEarn = new ReadToEarn_1.ReadToEarn(this.bot);
        await readToEarn.doReadToEarn();
    };
    doDailyCheckIn = async () => {
        const dailyCheckIn = new DailyCheckIn_1.DailyCheckIn(this.bot);
        await dailyCheckIn.doDailyCheckIn();
    };
}
exports.default = Activities;
//# sourceMappingURL=Activities.js.map