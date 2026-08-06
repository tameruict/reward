import type { QueryEngineEntry } from '../interface/Config';
import type { MicrosoftRewardsBot } from '../index';
interface QueryManagerOptions {
    shuffle?: boolean;
    sourceOrder?: QueryEngineEntry[];
    related?: boolean;
    langCode?: string;
    geoLocale?: string;
}
export declare class QueryCore {
    private bot;
    constructor(bot: MicrosoftRewardsBot);
    /**
     * Routes query-engine HTTP calls per config.proxy.queryEngine:
     * - true (default): through the account proxy, so trend/suggestion traffic
     *   shares the account's exit IP (coherent network fingerprint).
     * - false: through the direct host transport, saving proxy bandwidth.
     */
    private queryRequest;
    queryManager(options?: QueryManagerOptions): Promise<string[]>;
    private buildRelatedClusters;
    private normalizeAndDedupe;
    getGoogleTrends(geoLocale: string): Promise<string[]>;
    private extractJsonFromResponse;
    getBingSuggestions(query?: string, langCode?: string): Promise<string[]>;
    getBingRelatedTerms(query: string): Promise<string[]>;
    getWikipediaTrending(langCode?: string): Promise<string[]>;
    getRedditTopics(subreddit?: string): Promise<string[]>;
    getHackerNewsTopics(): Promise<string[]>;
    getWikipediaRandom(langCode?: string): Promise<string[]>;
    getRssTopics(selectors: string[]): Promise<string[]>;
    private resolveRssUrls;
    fetchRssTitles(url: string): Promise<string[]>;
    private parseRssTitles;
    getLocalQueryList(): string[];
}
export {};
//# sourceMappingURL=QueryEngine.d.ts.map