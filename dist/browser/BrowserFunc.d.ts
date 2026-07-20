import type { BrowserContext, Cookie, Page } from 'patchright';
import type { MicrosoftRewardsBot } from '../index';
import type { Counters, DashboardData } from './../interface/DashboardData';
import type { AppEarnablePoints, BrowserEarnablePoints, MissingSearchPoints } from '../interface/Points';
import type { AppDashboardData } from '../interface/AppDashBoardData';
export declare class RewardsAuthenticationRequiredError extends Error {
    readonly destination: string;
    constructor(finalUrl: string);
}
export default class BrowserFunc {
    private bot;
    private bingJars;
    constructor(bot: MicrosoftRewardsBot);
    getDashboardData(cookies?: Cookie[]): Promise<DashboardData>;
    getAppDashboardData(): Promise<AppDashboardData>;
    getSearchPoints(): Promise<Counters>;
    missingSearchPoints(counters: Counters, isMobile: boolean): MissingSearchPoints;
    getBrowserEarnablePoints(): Promise<BrowserEarnablePoints>;
    getAppEarnablePoints(): Promise<AppEarnablePoints>;
    getCurrentPoints(): Promise<number>;
    bootstrap(page: Page): Promise<void>;
    private loadRewardsDashboardPage;
    private resolveActionIds;
    private fetchJsChunks;
    private extractDynamicChunkPaths;
    closeBrowser(browser: BrowserContext, email: string, persistSession?: boolean): Promise<void>;
    buildCookieHeader(cookies: Cookie[], allowedDomains?: string[]): string;
    reportServerAction(actionId: string, body: unknown[], opts?: {
        url?: string;
        referer?: string;
        routerStateTree?: string;
    }): Promise<{
        status: number;
        acknowledged: boolean;
    }>;
    reportSearchActivity(query: string, opts?: {
        cvid?: string;
        cg?: string;
    }): Promise<{
        ig: string | null;
        balance: number | null;
        previousBalance: number | null;
        gained: number | null;
        searchPointsEarned: number | null;
        searchPointsLimit: number | null;
    }>;
    reportVisualSearchActivity(visual: {
        bcid: string;
        query: string;
        serpUrl: string;
    }): Promise<{
        ig: string | null;
        balance: number | null;
        previousBalance: number | null;
        gained: number | null;
        searchPointsEarned: number | null;
        searchPointsLimit: number | null;
    }>;
    acquireVisualSearch(imageUrl?: string): Promise<{
        bcid: string;
        query: string;
        serpUrl: string;
    } | null>;
    resetHttpJars(): void;
    private getBingJar;
    private mergeSetCookies;
    private jarToHeader;
    private parseReportResponse;
    private buildMultipart;
    private parseKblobRedirect;
}
//# sourceMappingURL=BrowserFunc.d.ts.map