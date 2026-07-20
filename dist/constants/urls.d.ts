export declare const URLs: {
    readonly github: {
        readonly searchOnBingQueries: "https://raw.githubusercontent.com/TheNetsky/Microsoft-Rewards-Script/refs/heads/v4/src/functions/bing-search-activity-queries.json";
    };
    readonly rewards: {
        readonly origin: "https://rewards.bing.com";
        readonly referer: "https://rewards.bing.com/";
        readonly userInfoApi: "https://rewards.bing.com/api/getuserinfo";
        readonly earn: "https://rewards.bing.com/earn";
        readonly earnStreaks: "https://rewards.bing.com/earn?section=streaks";
        readonly dashboard: "https://rewards.bing.com/dashboard";
        readonly createUser: "https://rewards.bing.com/createuser?idru=%2F&userScenarioId=anonsignin";
        readonly quest: (parentOfferId: string) => string;
        readonly path: (path: string) => string;
    };
    readonly platform: {
        readonly origin: "https://prod.rewardsplatform.microsoft.com";
        readonly me: (channel: string) => string;
        readonly activities: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities";
    };
    readonly auth: {
        readonly bingSignIn: "https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F";
        readonly loginLive: "https://login.live.com/";
        readonly oauthAuthorize: "https://login.live.com/oauth20_authorize.srf";
        readonly oauthRedirect: "https://login.live.com/oauth20_desktop.srf";
        readonly oauthToken: "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
    };
    readonly bing: {
        readonly origin: "https://www.bing.com";
        readonly search: (query: string, cvid: string) => string;
    };
    readonly edge: {
        readonly products: "https://edgeupdates.microsoft.com/api/products";
    };
    readonly queryEngine: {
        readonly googleTrends: "https://trends.google.com/_/TrendsUi/data/batchexecute";
        readonly bingSuggestions: (query: string, langCode: string) => string;
        readonly bingRelated: (query: string) => string;
        readonly wikipediaTop: (langCode: string, year: number, month: string, day: string) => string;
        readonly wikipediaRandom: (langCode: string) => string;
        readonly hackerNews: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50";
        readonly reddit: (subreddit: string) => string;
    };
    readonly userAgent: {
        readonly chromeVersions: "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json";
    };
};
export declare const REWARDS_BASE_URL: "https://rewards.bing.com";
//# sourceMappingURL=urls.d.ts.map