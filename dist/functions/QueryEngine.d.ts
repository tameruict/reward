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