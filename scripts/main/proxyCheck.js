import net from 'node:net'
import rebrowser from 'patchright'

import { buildProxyConfig, getDirname, getProjectRoot, loadAccounts } from '../utils.js'
import { parseProxyParts } from '../proxyIdentity.js'

const projectRoot = getProjectRoot(getDirname(import.meta.url))
const accounts = loadAccounts(projectRoot)
const groups = new Map()

for (const account of accounts) {
    if (!account.proxy?.url) continue
    const key = account.proxyId || JSON.stringify(buildProxyConfig(account))
    const existing = groups.get(key)
    if (existing) existing.accountCount++
    else groups.set(key, { account, accountCount: 1 })
}

function safeError(error) {
    const message = error instanceof Error ? error.message : String(error)
    return message.match(/net::ERR_[A-Z_]+/)?.[0] || (message.toLowerCase().includes('timeout') ? 'TIMEOUT' : 'FAILED')
}

function parseEndpoint(proxy) {
    return parseProxyParts(proxy)
}

async function checkTcp(proxy) {
    const { host, port } = parseEndpoint(proxy)
    return await new Promise(resolve => {
        const socket = net.createConnection({ host, port })
        let settled = false
        const finish = status => {
            if (settled) return
            settled = true
            socket.destroy()
            resolve(status)
        }
        socket.setTimeout(8000, () => finish('TIMEOUT'))
        socket.once('connect', () => finish('OPEN'))
        socket.once('error', error => finish(error.code || 'ERROR'))
    })
}

async function checkProxy(group, index) {
    const result = {
        proxy: `proxy-${index + 1}`,
        accounts: group.accountCount,
        tcp: await checkTcp(group.account.proxy),
        ip: 'NOT_RUN',
        rewards: 'NOT_RUN'
    }

    if (result.tcp !== 'OPEN') return result

    let browser
    try {
        browser = await rebrowser.chromium.launch({
            headless: true,
            proxy: buildProxyConfig(group.account),
            args: ['--ignore-certificate-errors', '--ignore-ssl-errors']
        })
        const context = await browser.newContext({ ignoreHTTPSErrors: true })
        const page = await context.newPage()

        try {
            const response = await page.goto('https://api.ipify.org?format=json', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            })
            result.ip = response?.ok() ? 'OK' : `HTTP_${response?.status() ?? 'NO_RESPONSE'}`
        } catch (error) {
            result.ip = safeError(error)
        }

        try {
            const response = await page.goto('https://rewards.bing.com', {
                waitUntil: 'domcontentloaded',
                timeout: 25000
            })
            const hostname = new URL(page.url()).hostname
            result.rewards =
                hostname === 'chromewebdata' ? 'CHROMEWEBDATA_ERROR' : `HTTP_${response?.status() ?? 'NO_RESPONSE'}`
        } catch (error) {
            result.rewards = safeError(error)
        }

        await context.close()
    } catch (error) {
        result.ip = result.ip === 'NOT_RUN' ? safeError(error) : result.ip
        result.rewards = result.rewards === 'NOT_RUN' ? 'BROWSER_FAILED' : result.rewards
    } finally {
        await browser?.close().catch(() => {})
    }

    return result
}

if (!groups.size) {
    console.log('No active configured proxies were found.')
    process.exit(0)
}

const results = await Promise.all([...groups.values()].map(checkProxy))
console.table(results)

const failed = results.filter(
    result => result.tcp !== 'OPEN' || result.ip !== 'OK' || !result.rewards.startsWith('HTTP_')
)
if (failed.length) {
    console.error(
        `${failed.length}/${results.length} proxy checks failed. Replace or correct the failing proxy endpoints.`
    )
    process.exitCode = 1
} else {
    console.log(`All ${results.length} configured proxies are reachable.`)
}
