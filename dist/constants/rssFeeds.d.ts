/**
 * Selected in config via a dotted path in `searchSettings.queryEngines`:
 *   - "rss"                  -> every feed below
 *   - "rss.bbc"              -> every BBC feed
 *   - "rss.bbc.world"        -> just BBC world
 *
 * Add your own by dropping a new "site.endpoint": "url" entry here
 *
 */
export declare const RSS_FEEDS: Record<string, Record<string, string>>;
//# sourceMappingURL=rssFeeds.d.ts.map