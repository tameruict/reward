import { MicrosoftRewardsBot } from '../index';
import type { DashboardData } from '../interface/DashboardData';
export declare class PunchcardManager {
    private bot;
    constructor(bot: MicrosoftRewardsBot);
    runMobile(data: DashboardData): Promise<void>;
    runDesktop(): Promise<void>;
}
//# sourceMappingURL=PunchcardManager.d.ts.map