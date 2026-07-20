import { Workers } from '../../Workers';
import type { DashboardData } from '../../../interface/DashboardData';
export declare class VisualSearch extends Workers {
    doVisualSearch(data: DashboardData): Promise<number>;
    private findStreak;
    private logStreakState;
    private activate;
    private resolveDashboard;
    private resolveActivationMetadata;
    private findDashboardPromotion;
    private dashboardPromotionActivityType;
    private dashboardPromotionIsPromotional;
    private parseActivityType;
    private asRecord;
    private findActivationOffer;
    private performDailySearch;
    private acquireFreshVisualSearch;
    private dayRegistered;
}
//# sourceMappingURL=VisualSearch.d.ts.map