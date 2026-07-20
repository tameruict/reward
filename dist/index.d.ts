import { AsyncLocalStorage } from 'node:async_hooks';
import type { BrowserContext, Cookie, Page } from 'patchright';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import BrowserFunc from './browser/BrowserFunc';
import BrowserUtils from './browser/BrowserUtils';
import ReactFunc from './browser/ReactFunc';
import type { PageSnapshot } from './browser/ReactFunc';
import { Logger } from './logging/Logger';
import Utils from './util/Utils';
import { Workers } from './functions/Workers';
import Activities from './functions/Activities';
import type { Account } from './interface/Account';
import HttpClient from './util/Http';
interface ExecutionContext {
    isMobile: boolean;
    account: Account;
}
interface BrowserSession {
    context: BrowserContext;
    fingerprint: BrowserFingerprintWithHeaders;
}
export interface PointCheckResult {
    accountId: string | null;
    email: string;
    points: number;
    lifetimePoints: number | null;
    lifetimePointsRedeemed: number | null;
    country: string | null;
    checkedAt: string;
}
declare const executionContext: AsyncLocalStorage<ExecutionContext>;
export declare function getCurrentContext(): ExecutionContext;
interface UserData {
    userName: string;
    geoLocale: string;
    langCode: string;
    timezoneOffset: string;
    initialPoints: number;
    currentPoints: number;
    gainedPoints: number;
}
export declare class MicrosoftRewardsBot {
    logger: Logger;
    config: import("./interface/Config").Config;
    utils: Utils;
    activities: Activities;
    browser: {
        func: BrowserFunc;
        utils: BrowserUtils;
        react: ReactFunc;
    };
    mainMobilePage: Page;
    mainDesktopPage: Page;
    userData: UserData;
    nextActions: Record<string, string>;
    nextRouterStateTree: string;
    reactSnapshot: PageSnapshot | null;
    accessToken: string;
    cookies: {
        mobile: Cookie[];
        desktop: Cookie[];
    };
    private fingerprintMobile?;
    private fingerprintDesktop?;
    get fingerprint(): BrowserFingerprintWithHeaders;
    private activeWorkers;
    private exitedWorkers;
    private browserFactory;
    private accounts;
    workers: Workers;
    private searchManager;
    private punchcardManager;
    private login;
    http: HttpClient;
    constructor();
    get isMobile(): boolean;
    get currentAccountEmail(): string | null;
    initialize(): Promise<void>;
    private warnExperimental;
    run(): Promise<void>;
    private runMaster;
    private runWorker;
    private runTasks;
    createDesktopSession(account: Account): Promise<BrowserSession>;
    /**
     * Authenticate one account and read its Rewards balance only.
     * This path intentionally does not invoke activities, searches, claims,
     * punch cards, or any other point-earning worker.
     */
    checkAccountPoints(account: Account): Promise<PointCheckResult>;
    private trySavedSessionPointCheck;
    Main(account: Account): Promise<{
        initialPoints: number;
        collectedPoints: number;
    }>;
}
export { executionContext };
//# sourceMappingURL=index.d.ts.map