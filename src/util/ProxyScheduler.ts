import type { Account } from '../interface/Account'
import { accountProxyRouteKey } from './ProxyConfig'

export interface ProxyLane {
    routeKey: string
    accounts: Account[]
}

/**
 * Returns the network-route identity used to serialize accounts.
 * Password is intentionally excluded so rotating credentials does not create
 * a second lane for the same proxy endpoint.
 */
export function accountRouteKey(account: Account): string {
    const proxy = account.proxy
    if (!proxy?.url.trim()) return 'direct:default'
    return accountProxyRouteKey(proxy)
}

export function groupAccountsByProxy(accounts: Account[]): ProxyLane[] {
    const lanes = new Map<string, Account[]>()

    for (const account of accounts) {
        const routeKey = accountRouteKey(account)
        const laneAccounts = lanes.get(routeKey)
        if (laneAccounts) {
            laneAccounts.push(account)
        } else {
            lanes.set(routeKey, [account])
        }
    }

    return Array.from(lanes, ([routeKey, laneAccounts]) => ({ routeKey, accounts: laneAccounts }))
}

/**
 * Builds process chunks without ever splitting one proxy route across workers.
 * maxWorkers=0 means automatic concurrency: one worker per distinct route.
 */
export function buildProxyAwareChunks(accounts: Account[], maxWorkers: number): Account[][] {
    const proxyLanes = groupAccountsByProxy(accounts)
    if (!proxyLanes.length) return []

    const workerCount = maxWorkers > 0 ? Math.min(maxWorkers, proxyLanes.length) : proxyLanes.length
    const chunks: Account[][] = Array.from({ length: workerCount }, () => [])

    // Put larger proxy groups first, then assign each whole group to the least
    // loaded worker. This keeps routes isolated while balancing account counts.
    const lanesBySize = proxyLanes
        .map((lane, order) => ({ ...lane, order }))
        .sort((a, b) => b.accounts.length - a.accounts.length || a.order - b.order)

    for (const lane of lanesBySize) {
        let targetIndex = 0
        for (let index = 1; index < chunks.length; index++) {
            if (chunks[index]!.length < chunks[targetIndex]!.length) targetIndex = index
        }
        chunks[targetIndex]!.push(...lane.accounts)
    }

    return chunks.filter(chunk => chunk.length > 0)
}
