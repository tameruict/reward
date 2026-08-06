"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryCore = void 0;
const Http_1 = require("../util/Http");
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const fast_xml_parser_1 = require("fast-xml-parser");
const urls_1 = require("../constants/urls");
const rssFeeds_1 = require("../constants/rssFeeds");
const GOOGLE_TRENDS_RPC_ID = 'i0OFE';
const RELATED_EXPANSION_LIMIT = 50;
function toArray(value) {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
}
function readTitle(title) {
    if (typeof title === 'string')
        return title;
    if (typeof title === 'number')
        return String(title);
    if (title && typeof title === 'object' && '#text' in title) {
        const text = title['#text'];
        return typeof text === 'string' ? text : typeof text === 'number' ? String(text) : '';
    }
    return '';
}
function stripHtml(text) {
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}
class QueryCore {
    bot;
    constructor(bot) {
        this.bot = bot;
    }
    /**
     * Routes query-engine HTTP calls per config.proxy.queryEngine:
     * - true (default): through the account proxy, so trend/suggestion traffic
     *   shares the account's exit IP (coherent network fingerprint).
     * - false: through the direct host transport, saving proxy bandwidth.
     */
    queryRequest(config) {
        return this.bot.config.proxy?.queryEngine === false
            ? (0, Http_1.httpRequest)(config)
            : this.bot.http.request(config);
    }
    async queryManager(options = {}) {
        const { shuffle = false, sourceOrder = ['google', 'wikipedia', 'wikirandom', 'hackernews', 'reddit', 'local'], related = true, langCode = 'en', geoLocale = 'US' } = options;
        try {
            const sourceHandlers = {
                google: () => this.getGoogleTrends(geoLocale.toUpperCase()).catch(() => []),
                wikipedia: () => this.getWikipediaTrending(langCode).catch(() => []),
                wikirandom: () => this.getWikipediaRandom(langCode).catch(() => []),
                hackernews: () => this.getHackerNewsTopics().catch(() => []),
                reddit: () => this.getRedditTopics().catch(() => []),
                local: () => this.getLocalQueryList()
            };
            const isRss = (s) => s === 'rss' || s.startsWith('rss.');
            const coreSources = sourceOrder.filter(s => !isRss(s));
            const rssSelectors = sourceOrder.filter(isRss);
            const topicLists = [];
            for (const source of coreSources) {
                const handler = sourceHandlers[source];
                if (!handler)
                    continue;
                const topics = await Promise.resolve(handler());
                this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `Source "${source}" returned ${topics.length}`);
                if (topics.length)
                    topicLists.push(topics);
            }
            if (rssSelectors.length) {
                const rssTopics = await this.getRssTopics(rssSelectors).catch(() => []);
                this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `Source "rss" returned ${rssTopics.length} (${rssSelectors.length} selector(s))`);
                if (rssTopics.length)
                    topicLists.push(rssTopics);
            }
            const baseTopics = this.normalizeAndDedupe(topicLists.flat());
            if (!baseTopics.length) {
                this.bot.logger.warn(this.bot.isMobile, 'QUERY-MANAGER', 'No topics returned by any source');
                return [];
            }
            const clusters = related ? await this.buildRelatedClusters(baseTopics, langCode) : baseTopics.map(t => [t]);
            this.bot.utils.shuffleArray(clusters);
            let finalQueries = clusters.flat();
            if (shuffle)
                this.bot.utils.shuffleArray(finalQueries);
            finalQueries = this.normalizeAndDedupe(finalQueries);
            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `Built query pool | base=${baseTopics.length} | final=${finalQueries.length} | related=${related}`);
            return finalQueries;
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'QUERY-MANAGER', `Failed building query pool | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async buildRelatedClusters(baseTopics, langCode) {
        const clusters = [];
        const head = baseTopics.slice(0, RELATED_EXPANSION_LIMIT);
        const tail = baseTopics.slice(RELATED_EXPANSION_LIMIT);
        for (const topic of head) {
            const suggestions = (await this.getBingSuggestions(topic, langCode).catch(() => [])).slice(0, 6);
            const related = (await this.getBingRelatedTerms(topic).catch(() => [])).slice(0, 3);
            clusters.push(this.normalizeAndDedupe([topic, ...suggestions, ...related]));
        }
        for (const topic of tail) {
            clusters.push([topic]);
        }
        return clusters;
    }
    normalizeAndDedupe(queries) {
        const seen = new Set();
        const out = [];
        for (const q of queries) {
            const trimmed = q?.trim();
            if (!trimmed)
                continue;
            const norm = trimmed.replace(/\s+/g, ' ').toLowerCase();
            if (seen.has(norm))
                continue;
            seen.add(norm);
            out.push(trimmed);
        }
        return out;
    }
    async getGoogleTrends(geoLocale) {
        const queryTerms = [];
        try {
            const request = {
                url: urls_1.URLs.queryEngine.googleTrends,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                data: `f.req=[[[${GOOGLE_TRENDS_RPC_ID},"[null, null, \\"${geoLocale.toUpperCase()}\\", 0, null, 48]"]]]`
            };
            const response = await this.queryRequest(request);
            const trendsData = this.extractJsonFromResponse(response.data);
            if (!trendsData) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', 'No trends data parsed from response');
                return [];
            }
            const mapped = trendsData.map(q => [q[0], q[9].slice(1)]);
            if (mapped.length < 90 && geoLocale !== 'US') {
                return this.getGoogleTrends('US');
            }
            for (const [topic, related] of mapped) {
                queryTerms.push({ topic: topic, related: related });
            }
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', `Request failed | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
        return queryTerms.flatMap(x => [x.topic, ...x.related]);
    }
    extractJsonFromResponse(text) {
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('['))
                continue;
            try {
                return JSON.parse(JSON.parse(trimmed)[0][2])[1];
            }
            catch { }
        }
        return null;
    }
    async getBingSuggestions(query = '', langCode = 'en') {
        try {
            const request = {
                url: urls_1.URLs.queryEngine.bingSuggestions(query, langCode),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            };
            const response = await this.queryRequest(request);
            return response.data.suggestionGroups?.[0]?.searchSuggestions?.map((x) => x.query) ?? [];
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-BING-SUGGESTIONS', `Request failed | query="${query}" | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async getBingRelatedTerms(query) {
        try {
            const request = {
                url: urls_1.URLs.queryEngine.bingRelated(query),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            };
            const response = await this.queryRequest(request);
            const related = response.data?.[1];
            return Array.isArray(related) ? related : [];
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-BING-RELATED', `Request failed | query="${query}" | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async getWikipediaTrending(langCode = 'en') {
        try {
            const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const request = {
                url: urls_1.URLs.queryEngine.wikipediaTop(langCode, year, month, day),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            };
            const response = await this.queryRequest(request);
            const articles = response.data.items?.[0]?.articles ?? [];
            return articles.slice(0, 50).map(a => a.article.replace(/_/g, ' '));
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-WIKIPEDIA-TRENDING', `Request failed | lang=${langCode} | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async getRedditTopics(subreddit = 'popular') {
        const safe = subreddit.replace(/[^a-zA-Z0-9_+]/g, '');
        try {
            const request = {
                url: urls_1.URLs.queryEngine.reddit(safe),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            };
            const response = await this.queryRequest(request);
            const posts = response.data.data?.children ?? [];
            return posts.filter(p => !p.data.over_18).map(p => p.data.title);
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-REDDIT', `Request failed | subreddit=${safe} | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async getHackerNewsTopics() {
        try {
            const request = {
                url: urls_1.URLs.queryEngine.hackerNews,
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            };
            const response = await this.queryRequest(request);
            const hits = response.data?.hits ?? [];
            return hits.map(h => (h.title ?? '').replace(/^(?:Show|Ask)\s+HN:\s*/i, '').trim()).filter(Boolean);
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-HACKERNEWS', `Request failed | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async getWikipediaRandom(langCode = 'en') {
        const lang = (langCode || 'en').split('-')[0] || 'en';
        try {
            const request = {
                url: urls_1.URLs.queryEngine.wikipediaRandom(lang),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            };
            const response = await this.queryRequest(request);
            const pages = response.data?.query?.random ?? [];
            return pages.map(p => p.title.trim()).filter(Boolean);
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-WIKIPEDIA-RANDOM', `Request failed | lang=${lang} | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    async getRssTopics(selectors) {
        const urls = this.resolveRssUrls(selectors);
        if (!urls.length)
            return [];
        const lists = await Promise.all(urls.map(url => this.fetchRssTitles(url).catch(() => [])));
        return lists.flat();
    }
    resolveRssUrls(selectors) {
        const urls = new Set();
        for (const selector of selectors) {
            const [, site, endpoint] = selector.split('.');
            if (!site) {
                for (const feeds of Object.values(rssFeeds_1.RSS_FEEDS)) {
                    for (const url of Object.values(feeds))
                        urls.add(url);
                }
                continue;
            }
            const feeds = rssFeeds_1.RSS_FEEDS[site];
            if (!feeds) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-RSS', `Unknown RSS site "${site}" in "${selector}"`);
                continue;
            }
            if (!endpoint) {
                for (const url of Object.values(feeds))
                    urls.add(url);
                continue;
            }
            const url = feeds[endpoint];
            if (url)
                urls.add(url);
            else
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-RSS', `Unknown RSS feed "${site}.${endpoint}"`);
        }
        return [...urls];
    }
    async fetchRssTitles(url) {
        try {
            const request = {
                url,
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            };
            const response = await this.queryRequest(request);
            const xml = typeof response.data === 'string' ? response.data : String(response.data ?? '');
            return this.parseRssTitles(xml);
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-RSS', `Feed failed | ${url} | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    parseRssTitles(xml) {
        if (!xml)
            return [];
        let doc;
        try {
            doc = new fast_xml_parser_1.XMLParser({ ignoreAttributes: true, htmlEntities: true, parseTagValue: false }).parse(xml);
        }
        catch {
            return [];
        }
        const entries = [
            ...toArray(doc?.rss?.channel?.item),
            ...toArray(doc?.['rdf:RDF']?.item),
            ...toArray(doc?.feed?.entry)
        ];
        return entries.map(entry => stripHtml(readTitle(entry?.title)).trim()).filter(Boolean);
    }
    getLocalQueryList() {
        try {
            const file = path_1.default.join(__dirname, './search-queries.json');
            const queries = JSON.parse(fs.readFileSync(file, 'utf8'));
            return Array.isArray(queries) ? queries : [];
        }
        catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-LOCAL-QUERY-LIST', `Failed reading search-queries.json | ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
}
exports.QueryCore = QueryCore;
//# sourceMappingURL=QueryEngine.js.map