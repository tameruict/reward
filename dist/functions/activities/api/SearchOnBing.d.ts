import { Workers } from '../../Workers';
import type { BasePromotion } from '../../../interface/DashboardData';
export declare class SearchOnBing extends Workers {
    private gainedPoints;
    private success;
    private oldBalance;
    doSearchOnBing(promotion: BasePromotion): Promise<void>;
    private activateSearchTask;
    private searchBing;
    private findOffer;
    private buildCategoryGroup;
    private getSearchQueries;
    private fallbackQueries;
    private extractSearchTerm;
}
//# sourceMappingURL=SearchOnBing.d.ts.map