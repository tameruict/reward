import type { Page } from 'patchright';
import type { MicrosoftRewardsBot } from '../index';
import type { DashboardData } from '../interface/DashboardData';
import type { AppDashboardData } from '../interface/AppDashBoardData';
export declare function normaliseActivityType(raw: unknown): string;
export declare class Workers {
    bot: MicrosoftRewardsBot;
    constructor(bot: MicrosoftRewardsBot);
    doDailySet(data: DashboardData): Promise<void>;
    doMorePromotions(data: DashboardData): Promise<void>;
    doAppPromotions(data: AppDashboardData | null): Promise<void>;
    doPunchCards(data: DashboardData, page: Page): Promise<void>;
    doClaimBonusPoints(): Promise<void>;
    private solvePunchCard;
    private reportQuestChild;
    private solveActivities;
    private isSearchQuotaChild;
    private isClaimChild;
}
//# sourceMappingURL=Workers.d.ts.map