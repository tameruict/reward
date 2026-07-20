import type { MicrosoftRewardsBot } from '../index';
export interface ParsedOffer {
    offerId: string;
    hash: string | null;
    title: string;
    description: string;
    points: number;
    promotionSubtype: string | null;
    destination: string;
    isCompleted: boolean;
    isPromotional: boolean;
    isLocked: boolean;
    unlockCriteria: string | null;
    date: string | null;
    activityType: number | null;
    reportable: boolean;
}
export interface QuestChild {
    offerId: string;
    hash: string | null;
    points: number;
    isCompleted: boolean;
    isLocked: boolean;
    isDisabled: boolean;
    reportable: boolean;
}
export interface ParentQuest {
    offerId: string;
    title: string;
    pointProgressMax: number;
    complete: boolean;
}
export interface StreakState {
    partner: string;
    activitiesCompleted: number;
    activitiesTotal: number;
    completedDays: number;
    currentDay: number;
    totalDays: number;
    isCurrentDayCompleted: boolean;
    isEnabled: boolean;
    dailyPoints: number[];
}
export interface StreakProtectionState {
    isProtectionOn: boolean;
    remainingDays: number | null;
    streakCounter: number | null;
}
export interface AccountState {
    level: number | null;
    pointsProgress: number | null;
    pointsRemaining: number | null;
    lifetimeEarn: number | null;
    availablePoints: number | null;
}
export interface PageSnapshot {
    offers: ParsedOffer[];
    reportable: ParsedOffer[];
    streaks: StreakState[];
    streakProtection: StreakProtectionState | null;
    account: AccountState;
}
export default class ReactFunc {
    private bot;
    constructor(bot: MicrosoftRewardsBot);
    snapshotPage(html: string): PageSnapshot;
    getReportableOffers(html: string): ParsedOffer[];
    getStreakProtection(html: string): StreakProtectionState | null;
    buildId(html: string): string | null;
    private concatFlightChunks;
    private extractObjects;
    private parseOffers;
    private parseStreaks;
    private parseStreakProtection;
    private parseAccountData;
    routerStateTree(segment: string): string;
    questRouterStateTree(questId: string): string;
    extractActionIds(jsText: string): {
        byName: Record<string, string>;
        all: string[];
    };
    snapshotQuestPage(html: string): QuestChild[];
    private parseQuestOffers;
    snapshotQuestList(...htmls: string[]): ParentQuest[];
    private isParentQuestId;
    private todayStamp;
    private normaliseDate;
}
//# sourceMappingURL=ReactFunc.d.ts.map