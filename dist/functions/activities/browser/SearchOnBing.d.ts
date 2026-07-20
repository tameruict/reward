import type { Page } from 'patchright';
import { Workers } from '../../Workers';
import type { BasePromotion } from '../../../interface/DashboardData';
export declare class SearchOnBing extends Workers {
    private gainedPoints;
    private success;
    private oldBalance;
    doSearchOnBing(promotion: BasePromotion, page: Page): Promise<void>;
    private activateSearchTask;
    private searchBing;
    private ensureSearchReady;
    private typeSearch;
    private findOffer;
    private getSearchQueries;
    private fallbackQueries;
    private extractSearchTerm;
}
//# sourceMappingURL=SearchOnBing.d.ts.map