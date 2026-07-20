import { type Page } from 'patchright';
import { ClickOptions } from 'ghost-cursor-playwright-port';
import type { MicrosoftRewardsBot } from '../index';
export default class BrowserUtils {
    private bot;
    private readonly suspendedAccountNotified;
    private readonly rewardsOrigin;
    private readonly suspendedAccountPatterns;
    constructor(bot: MicrosoftRewardsBot);
    /**
     * Detects the Rewards suspension page and emits a notification once per account.
     * The page can still be hosted on rewards.bing.com, so URL-only checks are not enough.
     */
    checkSuspendedAccount(page: Page, accountEmail?: string): Promise<boolean>;
    tryDismissAllMessages(page: Page): Promise<void>;
    getLatestTab(page: Page): Promise<Page>;
    reloadBadPage(page: Page): Promise<boolean>;
    closeTabs(page: Page, config?: {
        minTabs: number;
        maxTabs: number;
    }): Promise<Page>;
    ghostClick(page: Page, selector: string, options?: ClickOptions): Promise<boolean>;
    disableFido(page: Page): Promise<void>;
}
//# sourceMappingURL=BrowserUtils.d.ts.map