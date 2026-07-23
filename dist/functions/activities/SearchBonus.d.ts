import type { SearchTracker } from '../../interface/Search';
import type { MicrosoftRewardsBot } from '../../index';
import type { Page } from 'patchright';
export declare class BonusTracker implements SearchTracker {
    private bot;
    private isMobile;
    private page?;
    readonly context = "SEARCH-BONUS";
    readonly maxSearches: number;
    readonly stagnantLimit = 20;
    started: boolean;
    offerLost: boolean;
    private offerId;
    private max;
    private current;
    private balance;
    constructor(bot: MicrosoftRewardsBot, isMobile: boolean, page?: Page | undefined);
    prepare(): Promise<boolean>;
    measure(): Promise<number>;
    done(): boolean;
    progress(): string;
    private findSearchBonusOffer;
    private findOfferById;
    private isBareBingSearchDestination;
}
//# sourceMappingURL=SearchBonus.d.ts.map