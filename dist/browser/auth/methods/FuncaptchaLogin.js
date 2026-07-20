"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuncaptchaLogin = void 0;
const OmoCaptcha_1 = require("../../../util/OmoCaptcha");
const ARKOSE_URL_PATTERN = /arkoselabs|funcaptcha/i;
const COMPLETE_PATTERN = /verification (?:complete|successful)|you(?:'ve| have) completed|successfully verified/i;
const START_PATTERN = /start (?:puzzle|challenge)|begin|verify/i;
const SUBMIT_PATTERN = /submit|done|verify|next/i;
class FuncaptchaLogin {
    bot;
    constructor(bot) {
        this.bot = bot;
    }
    async isPresent(page) {
        const visibleHostFrame = await page
            .locator('iframe[src*="arkoselabs" i], iframe[src*="funcaptcha" i], iframe[title*="verification challenge" i], iframe[data-e2e="enforcement-frame"], iframe#enforcementFrame')
            .filter({ visible: true })
            .count()
            .catch(() => 0);
        if (visibleHostFrame > 0)
            return true;
        for (const frame of page.frames()) {
            if (frame.isDetached() || !ARKOSE_URL_PATTERN.test(frame.url()))
                continue;
            if (await this.frameHasVisibleContent(frame))
                return true;
        }
        return false;
    }
    async solve(page) {
        // Account loading reads the project .env after Login is constructed, so resolve the key lazily here.
        const client = OmoCaptcha_1.OmoCaptchaClient.fromEnvironment(this.bot.http);
        if (!client) {
            throw new Error('FunCaptcha detected but OMOCaptcha is not configured. Add OMOCAPTCHA_API_KEY to .env and restart.');
        }
        this.bot.logger.info(this.bot.isMobile, 'CAPTCHA', 'Microsoft FunCaptcha detected; starting OMOCaptcha solver');
        for (let round = 1; round <= 10; round++) {
            if (await this.isComplete(page)) {
                this.bot.logger.info(this.bot.isMobile, 'CAPTCHA', 'FunCaptcha verification completed');
                return;
            }
            await this.clickStartButton(page);
            const snapshot = await this.waitForPuzzle(page, 15_000);
            if (!snapshot) {
                if (!(await this.isPresent(page)) || (await this.isComplete(page))) {
                    this.bot.logger.info(this.bot.isMobile, 'CAPTCHA', 'FunCaptcha challenge closed successfully');
                    return;
                }
                throw new Error('FunCaptcha is visible, but its original puzzle image or question could not be read');
            }
            this.bot.logger.info(this.bot.isMobile, 'CAPTCHA', `Solving FunCaptcha round ${round}`);
            const answerIndex = await client.solveFuncaptchaImage(snapshot.imageBase64, snapshot.question);
            this.bot.logger.debug(this.bot.isMobile, 'CAPTCHA', `OMOCaptcha returned image index ${answerIndex}; moving carousel ${answerIndex - 1} time(s)`);
            await this.applyAnswer(snapshot.frame, answerIndex);
            await this.bot.utils.wait(1_500);
            if (await this.isComplete(page)) {
                this.bot.logger.info(this.bot.isMobile, 'CAPTCHA', 'FunCaptcha verification completed');
                return;
            }
            if (!(await this.isPresent(page))) {
                this.bot.logger.info(this.bot.isMobile, 'CAPTCHA', 'FunCaptcha challenge closed successfully');
                return;
            }
        }
        throw new Error('FunCaptcha exceeded the maximum of 10 puzzle rounds');
    }
    async waitForPuzzle(page, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const challengeFrames = [];
            for (const frame of [...page.frames()].reverse()) {
                if (frame.isDetached() || !(await this.frameHasVisibleContent(frame)))
                    continue;
                if (ARKOSE_URL_PATTERN.test(frame.url()) || (await this.frameLooksLikeChallenge(frame))) {
                    challengeFrames.push(frame);
                }
            }
            let sharedQuestion = null;
            for (const frame of challengeFrames) {
                sharedQuestion = await this.readQuestion(frame);
                if (sharedQuestion)
                    break;
            }
            for (const frame of challengeFrames) {
                const imageBase64 = await this.readOriginalImage(frame);
                if (!imageBase64)
                    continue;
                // Arkose occasionally renders instructions in a parent frame and the image in game-core-frame.
                const question = (await this.readQuestion(frame)) ?? sharedQuestion;
                if (question)
                    return { frame, imageBase64, question };
            }
            if (await this.isComplete(page))
                return null;
            await this.bot.utils.wait(500);
        }
        return null;
    }
    async readQuestion(frame) {
        return frame
            .evaluate(() => {
            const visible = (element) => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            };
            const selectors = [
                '[data-e2e="challenge-instructions"]',
                '#game_children_text',
                '.challenge-instructions',
                '[aria-live="polite"] h2',
                '[role="heading"]',
                'h2',
                'h1'
            ];
            const texts = selectors
                .flatMap(selector => Array.from(document.querySelectorAll(selector)))
                .filter(visible)
                .map(element => (element.textContent ?? '').replace(/\s+/g, ' ').trim())
                .filter(text => text.length >= 8 && text.length <= 600);
            const likelyQuestion = texts.find(text => /use|pick|select|choose|rotate|image|arrow|match|find/i.test(text));
            return likelyQuestion ?? texts[0] ?? null;
        })
            .catch(() => null);
    }
    async readOriginalImage(frame) {
        return frame
            .evaluate(async () => {
            const isVisible = (element) => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return (rect.width >= 80 &&
                    rect.height >= 80 &&
                    style.visibility !== 'hidden' &&
                    style.display !== 'none');
            };
            const toBase64 = async (url) => {
                if (url.startsWith('data:image/'))
                    return url.split(',', 2)[1] ?? null;
                if (!url)
                    return null;
                try {
                    const response = await fetch(url);
                    if (!response.ok)
                        return null;
                    const blob = await response.blob();
                    return await new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const value = typeof reader.result === 'string' ? reader.result : '';
                            resolve(value.split(',', 2)[1] ?? null);
                        };
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    });
                }
                catch {
                    return null;
                }
            };
            const images = Array.from(document.images)
                .filter(isVisible)
                .sort((left, right) => {
                const leftRect = left.getBoundingClientRect();
                const rightRect = right.getBoundingClientRect();
                return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
            });
            for (const image of images) {
                const base64 = await toBase64(image.currentSrc || image.src);
                if (base64)
                    return base64;
            }
            const canvases = Array.from(document.querySelectorAll('canvas'))
                .filter(isVisible)
                .sort((left, right) => right.width * right.height - left.width * left.height);
            for (const canvas of canvases) {
                try {
                    const dataUrl = canvas.toDataURL('image/png');
                    const base64 = dataUrl.split(',', 2)[1];
                    if (base64)
                        return base64;
                }
                catch {
                    // A cross-origin canvas cannot be exported. Try the next candidate.
                }
            }
            const backgroundElements = Array.from(document.querySelectorAll('div'))
                .filter(isVisible)
                .map(element => {
                const rect = element.getBoundingClientRect();
                return { element, area: rect.width * rect.height };
            })
                .sort((left, right) => right.area - left.area);
            for (const { element } of backgroundElements) {
                const background = getComputedStyle(element).backgroundImage;
                const match = background.match(/^url\(["']?(.*?)["']?\)$/i);
                if (!match?.[1])
                    continue;
                const base64 = await toBase64(match[1]);
                if (base64)
                    return base64;
            }
            return null;
        })
            .catch(() => null);
    }
    async applyAnswer(frame, answerIndex) {
        for (let click = 1; click < answerIndex; click++) {
            const rightArrow = await this.findRightArrow(frame);
            if (!rightArrow)
                throw new Error('FunCaptcha right-arrow button was not found');
            await rightArrow.click();
            await this.bot.utils.wait(250);
        }
        const submit = await this.findButtonInHierarchy(frame, [
            '[data-e2e="submit-button"]',
            'button[aria-label*="submit" i]',
            'button[aria-label*="done" i]',
            'button[aria-label*="verify" i]',
            'button[type="submit"]'
        ], SUBMIT_PATTERN);
        if (!submit)
            throw new Error('FunCaptcha submit button was not found');
        await submit.click();
    }
    async findRightArrow(frame) {
        const selectors = [
            '[data-e2e="right-arrow"]',
            'button[aria-label*="right" i]',
            'button[title*="right" i]',
            'button.right-arrow',
            '#right-arrow'
        ];
        const exact = await this.findButtonInHierarchy(frame, selectors, /right|next/i);
        if (exact)
            return exact;
        for (const candidateFrame of this.frameHierarchy(frame)) {
            const visibleButtons = [];
            const buttons = candidateFrame.locator('button');
            for (let index = 0; index < (await buttons.count()); index++) {
                const locator = buttons.nth(index);
                if (!(await locator.isVisible().catch(() => false)))
                    continue;
                const box = await locator.boundingBox().catch(() => null);
                if (box && box.width <= 120 && box.height <= 120) {
                    visibleButtons.push({ locator, x: box.x, y: box.y });
                }
            }
            if (visibleButtons.length >= 2) {
                visibleButtons.sort((left, right) => right.x - left.x || left.y - right.y);
                return visibleButtons[0]?.locator ?? null;
            }
        }
        return null;
    }
    async clickStartButton(page) {
        for (const frame of [...page.frames()].reverse()) {
            if (frame.isDetached() || !ARKOSE_URL_PATTERN.test(frame.url()))
                continue;
            const startButton = await this.findButton(frame, ['[data-e2e="start-button"]', 'button[aria-label*="start" i]'], START_PATTERN);
            if (startButton) {
                await startButton.click();
                await this.bot.utils.wait(500);
                return;
            }
        }
    }
    async findButton(frame, selectors, namePattern) {
        for (const selector of selectors) {
            const matches = frame.locator(selector);
            for (let index = 0; index < (await matches.count()); index++) {
                const candidate = matches.nth(index);
                if (await candidate.isVisible().catch(() => false))
                    return candidate;
            }
        }
        const buttons = frame.getByRole('button');
        for (let index = 0; index < (await buttons.count()); index++) {
            const candidate = buttons.nth(index);
            if (!(await candidate.isVisible().catch(() => false)))
                continue;
            const name = await candidate.getAttribute('aria-label').catch(() => null);
            const text = await candidate.innerText().catch(() => '');
            if (namePattern.test(`${name ?? ''} ${text}`))
                return candidate;
        }
        return null;
    }
    async findButtonInHierarchy(frame, selectors, namePattern) {
        for (const candidateFrame of this.frameHierarchy(frame)) {
            const button = await this.findButton(candidateFrame, selectors, namePattern);
            if (button)
                return button;
        }
        return null;
    }
    frameHierarchy(frame) {
        const frames = [];
        let current = frame;
        while (current) {
            frames.push(current);
            current = current.parentFrame();
        }
        return frames;
    }
    async isComplete(page) {
        for (const frame of page.frames()) {
            if (frame.isDetached() || !ARKOSE_URL_PATTERN.test(frame.url()))
                continue;
            const text = await frame.locator('body').innerText({ timeout: 500 }).catch(() => '');
            if (COMPLETE_PATTERN.test(text))
                return true;
        }
        return false;
    }
    async frameHasVisibleContent(frame) {
        try {
            const frameElement = await frame.frameElement();
            if (!(await frameElement.isVisible()))
                return false;
            return await frame
                .locator('body')
                .evaluate(body => {
                const rect = body.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            })
                .catch(() => false);
        }
        catch {
            return false;
        }
    }
    async frameLooksLikeChallenge(frame) {
        const text = await frame.locator('body').innerText({ timeout: 300 }).catch(() => '');
        return /verification|puzzle|captcha|use the arrows|pick the image/i.test(text);
    }
}
exports.FuncaptchaLogin = FuncaptchaLogin;
//# sourceMappingURL=FuncaptchaLogin.js.map