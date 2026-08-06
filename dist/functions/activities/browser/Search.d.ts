import type { Page } from 'patchright';
import { Workers } from '../../Workers';
export declare class Search extends Workers {
    private searchCount;
    doSearch(page: Page, isMobile: boolean): Promise<number>;
    doBonusSearches(page: Page): Promise<number>;
    private runSearchSession;
    private generatePool;
    private bingSearch;
    private ensureSearchBox;
    private visibleSearchBox;
    private recoverSearchPage;
    private randomScroll;
    private clickRandomLink;
    private visibleResultLink;
    /**
     * Picks which organic result to open, biased strongly toward the top ranks
     * (humans rarely click far down), instead of always clicking the first one.
     * Falls back to the base selector when a specific rank isn't resolvable.
     */
    private pickWeightedResult;
    private navigateToBing;
}
//# sourceMappingURL=Search.d.ts.map