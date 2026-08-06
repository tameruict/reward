import { AsyncLocalStorage } from 'node:async_hooks';
import type { BrowserContext, Cookie, Page } from 'patchright';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import BrowserFunc from './browser/BrowserFunc';
import BrowserUtils from './browser/BrowserUtils';
import ReactFunc from './browser/ReactFunc';
import type { PageSnapshot } from './browser/ReactFunc';
import { Logger } from './logging/Logger';
import Utils from './util/Utils';
import { type MobileDeviceIdentity } from './browser/DeviceIdentity';
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
    mobileDevice: MobileDeviceIdentity;
    appUserAgent: string;
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
    /**
     * Verifies the proxy's REAL exit identity by tracing through it, then compares
     * the observed exit IP/country against the account's expectations. Catches
     * transparent, rotating, or wrong-country proxies before the account runs.
     * Behaviour on mismatch is governed by config.proxy.onProxyMismatch.
     */
    private verifyProxyIdentity;
    /**
     * The Rewards API `timezoneOffset` (sent in many activity payloads) must
     * reflect the account's country, not the host clock. Falls back to the host
     * offset when the country is unknown ('auto' before login / unsupported).
     */
    private accountTimezoneOffset;
    /**
     * Reacts to an account Microsoft reports as unusable (suspended/banned).
     * Depending on config.accountLifecycle it persists a 'disabled' status (or
     * hard-deletes the row) so the dead account is not re-attacked next run.
     * An 'error' level log doubles as the webhook alert.
     */
    private handleUnusableAccount;
    createDesktopSession(account: Account): Promise<BrowserSession>;
    /**
     * Authenticate one account and read its Rewards balance only.
     * This path intentionally does not invoke activities, searches, claims,
     * punch cards, or any other point-earning worker.
     */
    checkAccountPoints(account: Account): Promise<PointCheckResult>;
    Main(account: Account): Promise<{
        initialPoints: number;
        collectedPoints: number;
    }>;
}
export { executionContext };
//# sourceMappingURL=index.d.ts.map