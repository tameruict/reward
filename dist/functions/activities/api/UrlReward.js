"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrlReward = void 0;
const urls_1 = require("../../../constants/urls");
const Workers_1 = require("../../Workers");
class UrlReward extends Workers_1.Workers {
    async doUrlReward(promotion) {
        const offerId = promotion.offerId;
        const actionId = this.bot.nextActions.reportActivity;
        if (!actionId) {
            this.bot.logger.warn(this.bot.isMobile, 'URL-REWARD', `Skipping ${offerId}: "reportActivity" not discovered in bundle`);
            return;
        }
        // RSC responses are streamed and may omit an offer that is present in
        // /userinfo. Refetch before falling back to the API promotion payload.
        const live = typeof this.bot.browser.func.ensureOffer === 'function'
            ? await this.bot.browser.func.ensureOffer(offerId)
            : this.bot.reactSnapshot?.offers.find(o => o.offerId === offerId) ?? null;
        if (live?.isCompleted || live?.isLocked) {
            this.bot.logger.warn(this.bot.isMobile, 'URL-REWARD', `Skipping ${offerId}: live offer is completed or locked`);
            return;
        }
        // The /earn RSC payload is streamed and can contain only a subset of
        // the promotions returned by /userinfo. The API promotion still has a
        // valid hash, so a missing snapshot entry must not discard the task.
        const hash = live?.hash ?? promotion.hash ?? null;
        if (!hash) {
            this.bot.logger.warn(this.bot.isMobile, 'URL-REWARD', `Skipping ${offerId}: no reportable offer hash`);
            return;
        }
        const points = Math.max(Number(live?.points ?? 0), Number(promotion.pointProgressMax ?? 0));
        const promotionSubtype = live?.promotionSubtype ?? promotion.promotionSubtype ?? null;
        const title = live?.title ?? promotion.title ?? '';
        const isPromotional = live?.isPromotional ?? String(promotion.attributes?.promotional ?? '').toLowerCase() === 'true';
        if (this.bot.config.skipNonPointTasks && this.isNonCrediting(points, promotionSubtype, title)) {
            this.bot.logger.info(this.bot.isMobile, 'URL-REWARD', `Skipping ${offerId}: awards no points (points=${points}${promotionSubtype ? ` subtype=${promotionSubtype}` : ''}) - likely a free trial/non-crediting offer. Set skipNonPointTasks=false to attempt anyway.`);
            return;
        }
        const oldBalance = this.bot.userData.currentPoints;
        const expectedPoints = points;
        const activityType = Number(promotion.activityType ?? 11);
        this.bot.logger.info(this.bot.isMobile, 'URL-REWARD', `Starting UrlReward | offerId=${offerId} | geo=${this.bot.userData.geoLocale} | currentBalance=${oldBalance}`);
        const body = [
            hash,
            activityType,
            {
                offerid: offerId,
                isPromotional: isPromotional ? true : '$undefined',
                timezoneOffset: this.bot.userData.timezoneOffset
            }
        ];
        try {
            const routerStateTree = this.bot.browser.react?.routerStateTree?.('dashboard') ?? this.bot.nextRouterStateTree ?? '';
            let result = await this.bot.browser.func.reportServerAction(actionId, body, {
                url: urls_1.URLs.rewards.dashboard,
                referer: urls_1.URLs.rewards.dashboard,
                routerStateTree
            });
            // A stale RSC action can return a valid HTTP response without an
            // acknowledgement. Refresh the offer snapshot and retry once so a
            // transient streamed-page mismatch does not lose the task.
            if (!result.acknowledged) {
                if (typeof this.bot.browser.func.refreshEarnSnapshot === 'function') {
                    await this.bot.browser.func.refreshEarnSnapshot();
                }
                const refreshedHash = this.bot.reactSnapshot?.offers.find(o => o.offerId === offerId)?.hash;
                if (refreshedHash)
                    body[0] = refreshedHash;
                result = await this.bot.browser.func.reportServerAction(actionId, body, {
                    url: urls_1.URLs.rewards.dashboard,
                    referer: urls_1.URLs.rewards.dashboard,
                    routerStateTree
                });
            }
            const { status, acknowledged } = result;
            const newBalance = await this.bot.browser.func.getCurrentPoints();
            const gainedPoints = newBalance - oldBalance;
            this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD', `Response | offerId=${offerId} | status=${status} | acknowledged=${acknowledged} | pointsGained=${gainedPoints} | currentBalance=${newBalance}`);
            if (gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance;
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints;
                const shortfall = expectedPoints > 0 && gainedPoints < expectedPoints;
                this.bot.logger.info(this.bot.isMobile, 'URL-REWARD', `Completed UrlReward | offerId=${offerId} | pointsGained=${gainedPoints} | currentBalance=${newBalance}${shortfall ? ' | WARNING: credited less than advertised' : ''}`, 'green');
            }
            else if (acknowledged && expectedPoints === 0) {
                this.bot.logger.info(this.bot.isMobile, 'URL-REWARD', `Completed UrlReward (no points by design) | offerId=${offerId} | acknowledged=true | pointsGained=0 | currentBalance=${newBalance}`, 'green');
            }
            else {
                this.bot.logger.warn(this.bot.isMobile, 'URL-REWARD', `UrlReward credited no points | offerId=${offerId} | acknowledged=${acknowledged} | expected=${expectedPoints} | pointsGained=0 | currentBalance=${newBalance}`);
            }
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000));
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'URL-REWARD', `Error in doUrlReward | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    isNonCrediting(points, subtype, title) {
        if (points > 0)
            return false;
        const haystack = `${subtype ?? ''} ${title ?? ''}`.toLowerCase();
        // Make proper language independant
        return /free trial|trial|subscription|sign up|sign-up|signup/.test(haystack);
    }
}
exports.UrlReward = UrlReward;
//# sourceMappingURL=UrlReward.js.map