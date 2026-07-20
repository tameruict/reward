import { MicrosoftRewardsBot } from '../index';
import type { Account } from '../interface/Account';
interface SearchPlan {
    doMobile: boolean;
    doDesktop: boolean;
    mobileMissing: number;
    desktopMissing: number;
}
export declare class SearchManager {
    private bot;
    constructor(bot: MicrosoftRewardsBot);
    getSearchPoints(): Promise<SearchPlan>;
    searchMobile(account: Account): Promise<number>;
    searchDesktop(account: Account): Promise<number>;
    bonusMobile(account: Account): Promise<number>;
}
export {};
//# sourceMappingURL=SearchManager.d.ts.map