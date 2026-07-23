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
    private navigateToBing;
}
//# sourceMappingURL=Search.d.ts.map