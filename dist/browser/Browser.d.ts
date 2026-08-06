import { BrowserContext } from 'patchright';
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import type { MicrosoftRewardsBot } from '../index';
import type { Account } from '../interface/Account';
interface BrowserCreationResult {
    context: BrowserContext;
    fingerprint: BrowserFingerprintWithHeaders;
}
declare class Browser {
    private readonly bot;
    private static readonly BROWSER_ARGS;
    constructor(bot: MicrosoftRewardsBot);
    createBrowser(account: Account): Promise<BrowserCreationResult>;
    private assertProxyReachable;
    private resolveGeo;
    generateFingerprint(isMobile: boolean, locale?: string): Promise<BrowserFingerprintWithHeaders>;
}
export default Browser;
//# sourceMappingURL=Browser.d.ts.map