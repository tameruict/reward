import type { Account } from '../interface/Account';
export interface ProxyLane {
    routeKey: string;
    accounts: Account[];
}
/**
 * Returns the network-route identity used to serialize accounts.
 * Password is intentionally excluded so rotating credentials does not create
 * a second lane for the same proxy endpoint.
 */
export declare function accountRouteKey(account: Account): string;
export declare function groupAccountsByProxy(accounts: Account[]): ProxyLane[];
/**
 * Builds process chunks without ever splitting one proxy route across workers.
 * maxWorkers=0 means automatic concurrency: one worker per distinct route.
 */
export declare function buildProxyAwareChunks(accounts: Account[], maxWorkers: number): Account[][];
//# sourceMappingURL=ProxyScheduler.d.ts.map