import type { Page } from 'patchright';
import type { MicrosoftRewardsBot } from '../../../index';
export declare class FuncaptchaLogin {
    private readonly bot;
    constructor(bot: MicrosoftRewardsBot);
    isPresent(page: Page): Promise<boolean>;
    solve(page: Page): Promise<void>;
    private waitForPuzzle;
    private readQuestion;
    private readOriginalImage;
    private applyAnswer;
    private findRightArrow;
    private clickStartButton;
    private findButton;
    private findButtonInHierarchy;
    private frameHierarchy;
    private isComplete;
    private frameHasVisibleContent;
    private frameLooksLikeChallenge;
}
//# sourceMappingURL=FuncaptchaLogin.d.ts.map