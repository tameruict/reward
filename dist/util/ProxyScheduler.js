"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountRouteKey = accountRouteKey;
exports.groupAccountsByProxy = groupAccountsByProxy;
exports.buildProxyAwareChunks = buildProxyAwareChunks;
const ProxyConfig_1 = require("./ProxyConfig");
/**
 * Returns the network-route identity used to serialize accounts.
 * Password is intentionally excluded so rotating credentials does not create
 * a second lane for the same proxy endpoint.
 */
function accountRouteKey(account) {
    const proxy = account.proxy;
    if (!proxy?.url.trim())
        return 'direct:default';
    return (0, ProxyConfig_1.accountProxyRouteKey)(proxy);
}
function groupAccountsByProxy(accounts) {
    const lanes = new Map();
    for (const account of accounts) {
        const routeKey = accountRouteKey(account);
        const laneAccounts = lanes.get(routeKey);
        if (laneAccounts) {
            laneAccounts.push(account);
        }
        else {
            lanes.set(routeKey, [account]);
        }
    }
    return Array.from(lanes, ([routeKey, laneAccounts]) => ({ routeKey, accounts: laneAccounts }));
}
/**
 * Builds process chunks without ever splitting one proxy route across workers.
 * maxWorkers=0 means automatic concurrency: one worker per distinct route.
 */
function buildProxyAwareChunks(accounts, maxWorkers) {
    const proxyLanes = groupAccountsByProxy(accounts);
    if (!proxyLanes.length)
        return [];
    const workerCount = maxWorkers > 0 ? Math.min(maxWorkers, proxyLanes.length) : proxyLanes.length;
    const chunks = Array.from({ length: workerCount }, () => []);
    // Put larger proxy groups first, then assign each whole group to the least
    // loaded worker. This keeps routes isolated while balancing account counts.
    const lanesBySize = proxyLanes
        .map((lane, order) => ({ ...lane, order }))
        .sort((a, b) => b.accounts.length - a.accounts.length || a.order - b.order);
    for (const lane of lanesBySize) {
        let targetIndex = 0;
        for (let index = 1; index < chunks.length; index++) {
            if (chunks[index].length < chunks[targetIndex].length)
                targetIndex = index;
        }
        chunks[targetIndex].push(...lane.accounts);
    }
    return chunks.filter(chunk => chunk.length > 0);
}
//# sourceMappingURL=ProxyScheduler.js.map