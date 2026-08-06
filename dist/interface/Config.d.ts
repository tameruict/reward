export interface Config {
    sessionPath: string;
    headless: boolean;
    clusters: number;
    errorDiagnostics: boolean;
    ensureStreakProtection: boolean;
    autoClaimPunchcardRewards: boolean;
    skipNonPointTasks: boolean;
    workers: ConfigWorkers;
    activities: ConfigActivities;
    searchOnBingLocalQueries: boolean;
    globalTimeout: number | string;
    searchSettings: ConfigSearchSettings;
    experimental: ConfigExperimental;
    debugLogs: boolean;
    proxy: ConfigProxy;
    accountLifecycle: ConfigAccountLifecycle;
    consoleLogFilter: LogFilter;
    webhook: ConfigWebhook;
}
/**
 * Controls what happens to an account record when Microsoft reports it can no
 * longer be used (suspended / banned). See src/util/AccountLifecycle.ts.
 */
export interface ConfigAccountLifecycle {
    /** When true, a suspended/banned account is removed from future runs. */
    autoDisableSuspended: boolean;
    /**
     * - 'off'     : detect + notify only, never touch the DB.
     * - 'disable' : set status='disabled' (reversible, excluded from runs). Default.
     * - 'delete'  : hard-delete the row and block re-import (irreversible).
     */
    mode: 'off' | 'disable' | 'delete';
}
export type QueryEngine = 'google' | 'wikipedia' | 'wikirandom' | 'hackernews' | 'reddit' | 'local';
export type RssFeedSelector = 'rss' | `rss.${string}`;
export type QueryEngineEntry = QueryEngine | RssFeedSelector;
export interface ConfigSearchSettings {
    scrollRandomResults: boolean;
    clickRandomResults: boolean;
    runOnZeroPoints: boolean;
    maxBonusSearches: number;
    parallelSearching: boolean;
    queryEngines: QueryEngineEntry[];
    searchResultVisitTime: number | string;
    searchDelay: ConfigDelay;
    readDelay: ConfigDelay;
}
export interface ConfigDelay {
    min: number | string;
    max: number | string;
}
export interface ConfigExperimental {
    apiSearch: boolean;
    apiSearchOnBing: boolean;
}
export interface ConfigProxy {
    queryEngine: boolean;
    /** Verify the proxy's real exit IP/country before running the account. Default true. */
    verifyExitIp?: boolean;
    /**
     * What to do when the observed exit IP/country disagrees with expectations:
     * - 'warn' (default): log + webhook alert, still run.
     * - 'skip': refuse to run the account this run.
     * - 'off': don't act on a mismatch (still logs the observed exit).
     */
    onProxyMismatch?: 'warn' | 'skip' | 'off';
}
export interface ConfigWorkers {
    doDailySet: boolean;
    doMorePromotions: boolean;
    doClaimBonusPoints: boolean;
    doPunchCards: boolean;
    doAppPromotions: boolean;
    doDesktopSearch: boolean;
    doMobileSearch: boolean;
    doBonusSearches: boolean;
    doDailyCheckIn: boolean;
    doReadToEarn: boolean;
    doActivateSearchPerk: boolean;
    doVisualSearch: boolean;
}
export interface ConfigActivities {
    urlReward: boolean;
    searchOnBing: boolean;
}
export interface ConfigWebhook {
    discord?: WebhookDiscordConfig;
    ntfy?: WebhookNtfyConfig;
    telegram?: WebhookTelegramConfig;
    webhookLogFilter: LogFilter;
}
export interface LogFilter {
    enabled: boolean;
    mode: 'whitelist' | 'blacklist';
    levels?: Array<'debug' | 'info' | 'warn' | 'error'>;
    keywords?: string[];
    regexPatterns?: string[];
}
export interface WebhookDiscordConfig {
    enabled: boolean;
    url: string;
}
export interface WebhookNtfyConfig {
    enabled?: boolean;
    url: string;
    topic?: string;
    token?: string;
    title?: string;
    tags?: string[];
    priority?: 1 | 2 | 3 | 4 | 5;
}
export interface WebhookTelegramConfig {
    enabled?: boolean;
    botToken: string;
    chatId: string | number;
}
//# sourceMappingURL=Config.d.ts.map