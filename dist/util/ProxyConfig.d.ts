import type { AccountProxy } from '../interface/Account';
export interface ParsedProxyConfig {
    protocol: string;
    host: string;
    port: number;
    username: string;
    password: string;
    server: string;
    routeServer: string;
}
export declare function parseProxyConfig(proxy: AccountProxy): ParsedProxyConfig;
export declare function formatProxyUrl(proxy: AccountProxy): string;
export declare function accountProxyRouteKey(proxy: AccountProxy): string;
//# sourceMappingURL=ProxyConfig.d.ts.map