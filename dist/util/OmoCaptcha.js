"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OmoCaptchaClient = exports.OmoCaptchaError = void 0;
const DEFAULT_BASE_URL = 'https://api.omocaptcha.com';
const DEFAULT_MAX_WAIT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 20_000;
const TRANSIENT_ERROR_CODES = new Set([
    'ERROR_TASK_IS_MAINTENANCE',
    'ERROR_SERVICE_UNAVAILABLE',
    'ERROR_REDIS_UNAVAILABLE'
]);
class OmoCaptchaError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'OmoCaptchaError';
    }
}
exports.OmoCaptchaError = OmoCaptchaError;
class OmoCaptchaClient {
    apiKey;
    baseUrl;
    maxWaitMs;
    fetchImpl;
    httpClient;
    sleep;
    constructor(options) {
        const apiKey = options.apiKey.trim();
        if (apiKey.length < 10 || apiKey.length > 80) {
            throw new OmoCaptchaError('OMOCaptcha API key must contain between 10 and 80 characters');
        }
        this.apiKey = apiKey;
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
        this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.httpClient = options.httpClient;
        this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    }
    static fromEnvironment(httpClient) {
        const apiKey = process.env.OMOCAPTCHA_API_KEY?.trim() || process.env.OMO_CAPTCHA_API_KEY?.trim();
        if (!apiKey)
            return null;
        const configuredWait = Number(process.env.OMOCAPTCHA_MAX_WAIT_MS);
        const maxWaitMs = Number.isFinite(configuredWait) && configuredWait > 0 ? configuredWait : undefined;
        return new OmoCaptchaClient({
            apiKey,
            baseUrl: process.env.OMOCAPTCHA_API_URL?.trim() || undefined,
            maxWaitMs,
            httpClient
        });
    }
    async solveFuncaptchaImage(imageBase64, question) {
        const normalizedImage = imageBase64.replace(/^data:image\/[^;]+;base64,/i, '').trim();
        if (!normalizedImage)
            throw new OmoCaptchaError('FunCaptcha image is empty');
        if (!question.trim())
            throw new OmoCaptchaError('FunCaptcha question is empty');
        const taskId = await this.createTask({
            type: 'FuncaptchaImageTask',
            imageBase64: normalizedImage,
            other: question.trim()
        });
        const solution = await this.waitForResult(taskId);
        const index = solution.index;
        if (typeof index !== 'number' || !Number.isInteger(index) || index < 1) {
            throw new OmoCaptchaError(`OMOCaptcha returned an invalid FunCaptcha index: ${String(index)}`);
        }
        return index;
    }
    async createTask(task) {
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const body = await this.post('/v2/createTask', { clientKey: this.apiKey, task });
                this.throwForBusinessError(body);
                if (!body.taskId)
                    throw new OmoCaptchaError('OMOCaptcha createTask response did not include taskId');
                return body.taskId;
            }
            catch (error) {
                lastError = error;
                const retryable = !(error instanceof OmoCaptchaError) || (error.code !== undefined && TRANSIENT_ERROR_CODES.has(error.code));
                if (!retryable || attempt === 2)
                    throw error;
                await this.sleep(1_000 * 2 ** attempt);
            }
        }
        throw lastError;
    }
    async waitForResult(taskId) {
        const startedAt = Date.now();
        let delayMs = 2_000;
        while (Date.now() - startedAt < this.maxWaitMs) {
            await this.sleep(delayMs);
            let body;
            try {
                body = await this.post('/v2/getTaskResult', {
                    clientKey: this.apiKey,
                    taskId
                });
            }
            catch (error) {
                // Business errors are terminal. Network and HTTP 5xx failures may recover on the next poll.
                if (error instanceof OmoCaptchaError)
                    throw error;
                delayMs = Math.min(Math.round(delayMs * 1.5), 10_000);
                continue;
            }
            this.throwForBusinessError(body);
            if (body.status === 'ready') {
                if (!body.solution)
                    throw new OmoCaptchaError('OMOCaptcha result is ready but solution is missing');
                return body.solution;
            }
            if (body.status === 'fail') {
                throw new OmoCaptchaError('OMOCaptcha solver failed to solve the task', 'ERROR_JOB_STATUS');
            }
            if (body.status !== 'processing') {
                throw new OmoCaptchaError(`OMOCaptcha returned an unknown task status: ${String(body.status)}`);
            }
            delayMs = Math.min(Math.round(delayMs * 1.5), 10_000);
        }
        throw new OmoCaptchaError(`OMOCaptcha task timed out after ${this.maxWaitMs}ms`);
    }
    throwForBusinessError(body) {
        if (body.errorId === 0)
            return;
        const code = body.errorCode || 'UNKNOWN_ERROR';
        const description = body.errorDescription || 'OMOCaptcha request failed';
        throw new OmoCaptchaError(`${description} (${code})`, code);
    }
    async post(path, payload) {
        if (this.httpClient) {
            try {
                const response = await this.httpClient.request({
                    url: `${this.baseUrl}${path}`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    data: payload,
                    timeout: REQUEST_TIMEOUT_MS
                });
                if (typeof response.data !== 'object' || response.data === null) {
                    throw new OmoCaptchaError('OMOCaptcha returned a malformed JSON response');
                }
                return response.data;
            }
            catch (error) {
                if (error instanceof OmoCaptchaError)
                    throw error;
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`OMOCaptcha request failed: ${message}`, { cause: error });
            }
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`OMOCaptcha HTTP ${response.status}`);
            }
            const body = await response.json();
            if (typeof body !== 'object' || body === null) {
                throw new OmoCaptchaError('OMOCaptcha returned a malformed JSON response');
            }
            return body;
        }
        catch (error) {
            if (error instanceof OmoCaptchaError)
                throw error;
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`OMOCaptcha request failed: ${message}`, { cause: error });
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.OmoCaptchaClient = OmoCaptchaClient;
//# sourceMappingURL=OmoCaptcha.js.map