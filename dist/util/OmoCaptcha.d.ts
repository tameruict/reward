import type HttpClient from './Http';
interface OmoCaptchaClientOptions {
    apiKey: string;
    baseUrl?: string;
    maxWaitMs?: number;
    fetchImpl?: typeof fetch;
    httpClient?: HttpClient;
    sleep?: (milliseconds: number) => Promise<void>;
}
export declare class OmoCaptchaError extends Error {
    readonly code?: string | undefined;
    constructor(message: string, code?: string | undefined);
}
export declare class OmoCaptchaClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly maxWaitMs;
    private readonly fetchImpl;
    private readonly httpClient?;
    private readonly sleep;
    constructor(options: OmoCaptchaClientOptions);
    static fromEnvironment(httpClient?: HttpClient): OmoCaptchaClient | null;
    solveFuncaptchaImage(imageBase64: string, question: string): Promise<number>;
    private createTask;
    private waitForResult;
    private throwForBusinessError;
    private post;
}
export {};
//# sourceMappingURL=OmoCaptcha.d.ts.map