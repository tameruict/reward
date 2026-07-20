import type { AccountProxy } from '../interface/Account';
export declare class ProxyUnavailableError extends Error {
    constructor(reason: string, cause?: unknown);
}
export interface HttpRequestConfig {
    url?: string;
    method?: string;
    headers?: Record<string, unknown>;
    params?: Record<string, string> | URLSearchParams;
    data?: unknown;
    timeout?: number;
    responseType?: 'json' | 'text';
}
export interface HttpResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string | string[]>;
    config: HttpRequestConfig;
}
declare class HttpClient {
    private instance;
    private account;
    private readonly proxyUrl?;
    private readonly proxyKey?;
    private lastProxyHealthcheck;
    readonly usesProxy: boolean;
    constructor(account: AccountProxy);
    assertProxyReady(force?: boolean): Promise<void>;
    request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
    private createInstance;
    private buildProxyKey;
    private throwIfProxyCircuitOpen;
    private markProxyUnavailable;
}
export declare function httpRequest<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
export default HttpClient;
//# sourceMappingURL=Http.d.ts.map