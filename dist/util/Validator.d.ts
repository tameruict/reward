import { z } from 'zod';
import { Config } from '../interface/Config';
import { Account } from '../interface/Account';
export declare const ConfigSchema: z.ZodObject<{
    sessionPath: z.ZodString;
    headless: z.ZodBoolean;
    clusters: z.ZodNumber;
    errorDiagnostics: z.ZodBoolean;
    ensureStreakProtection: z.ZodBoolean;
    autoClaimPunchcardRewards: z.ZodBoolean;
    skipNonPointTasks: z.ZodDefault<z.ZodBoolean>;
    workers: z.ZodObject<{
        doDailySet: z.ZodBoolean;
        doMorePromotions: z.ZodBoolean;
        doClaimBonusPoints: z.ZodBoolean;
        doPunchCards: z.ZodBoolean;
        doAppPromotions: z.ZodBoolean;
        doDesktopSearch: z.ZodBoolean;
        doMobileSearch: z.ZodBoolean;
        doBonusSearches: z.ZodBoolean;
        doDailyCheckIn: z.ZodBoolean;
        doReadToEarn: z.ZodBoolean;
        doActivateSearchPerk: z.ZodBoolean;
        doVisualSearch: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    activities: z.ZodDefault<z.ZodObject<{
        urlReward: z.ZodDefault<z.ZodBoolean>;
        searchOnBing: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    searchOnBingLocalQueries: z.ZodBoolean;
    globalTimeout: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
    searchSettings: z.ZodObject<{
        scrollRandomResults: z.ZodBoolean;
        clickRandomResults: z.ZodBoolean;
        runOnZeroPoints: z.ZodDefault<z.ZodBoolean>;
        maxBonusSearches: z.ZodDefault<z.ZodNumber>;
        parallelSearching: z.ZodBoolean;
        queryEngines: z.ZodArray<z.ZodUnion<readonly [z.ZodEnum<{
            google: "google";
            wikipedia: "wikipedia";
            wikirandom: "wikirandom";
            hackernews: "hackernews";
            reddit: "reddit";
            local: "local";
        }>, z.ZodString]>>;
        searchResultVisitTime: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        searchDelay: z.ZodObject<{
            min: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
            max: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        }, z.core.$strip>;
        readDelay: z.ZodObject<{
            min: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
            max: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    experimental: z.ZodDefault<z.ZodObject<{
        apiSearch: z.ZodDefault<z.ZodBoolean>;
        apiSearchOnBing: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    debugLogs: z.ZodBoolean;
    proxy: z.ZodObject<{
        queryEngine: z.ZodBoolean;
        verifyExitIp: z.ZodDefault<z.ZodBoolean>;
        onProxyMismatch: z.ZodDefault<z.ZodEnum<{
            warn: "warn";
            off: "off";
            skip: "skip";
        }>>;
    }, z.core.$strip>;
    accountLifecycle: z.ZodDefault<z.ZodObject<{
        autoDisableSuspended: z.ZodDefault<z.ZodBoolean>;
        mode: z.ZodDefault<z.ZodEnum<{
            off: "off";
            disable: "disable";
            delete: "delete";
        }>>;
    }, z.core.$strip>>;
    consoleLogFilter: z.ZodObject<{
        enabled: z.ZodBoolean;
        mode: z.ZodEnum<{
            whitelist: "whitelist";
            blacklist: "blacklist";
        }>;
        levels: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            error: "error";
            info: "info";
            warn: "warn";
            debug: "debug";
        }>>>;
        keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
        regexPatterns: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    webhook: z.ZodObject<{
        discord: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodBoolean;
            url: z.ZodString;
        }, z.core.$strip>>;
        ntfy: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            url: z.ZodString;
            topic: z.ZodOptional<z.ZodString>;
            token: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
            priority: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>, z.ZodLiteral<4>, z.ZodLiteral<5>]>>;
        }, z.core.$strip>>;
        telegram: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            botToken: z.ZodString;
            chatId: z.ZodString;
        }, z.core.$strip>>;
        webhookLogFilter: z.ZodObject<{
            enabled: z.ZodBoolean;
            mode: z.ZodEnum<{
                whitelist: "whitelist";
                blacklist: "blacklist";
            }>;
            levels: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                error: "error";
                info: "info";
                warn: "warn";
                debug: "debug";
            }>>>;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
            regexPatterns: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const AccountSchema: z.ZodObject<{
    accountId: z.ZodOptional<z.ZodString>;
    proxyId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    useProxy: z.ZodOptional<z.ZodBoolean>;
    status: z.ZodOptional<z.ZodString>;
    slot: z.ZodOptional<z.ZodNumber>;
    email: z.ZodString;
    password: z.ZodString;
    totpSecret: z.ZodOptional<z.ZodString>;
    recoveryEmail: z.ZodString;
    geoLocale: z.ZodString;
    langCode: z.ZodString;
    proxy: z.ZodObject<{
        proxyHttp: z.ZodBoolean;
        url: z.ZodString;
        port: z.ZodNumber;
        password: z.ZodString;
        username: z.ZodString;
        expectedEgressIp: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    saveFingerprint: z.ZodObject<{
        mobile: z.ZodBoolean;
        desktop: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare function validateConfig(data: unknown): Config;
export declare function validateAccounts(data: unknown): Account[];
export declare function checkNodeVersion(): void;
//# sourceMappingURL=Validator.d.ts.map