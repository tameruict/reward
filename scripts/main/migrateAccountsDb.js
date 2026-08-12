import { getDirname, getProjectRoot, loadEnvFile, loadAccountsFromEnv, log } from '../utils.js'
import { importAccountBundle } from '../accounts/store.js'

const __dirname = getDirname(import.meta.url)
const projectRoot = getProjectRoot(__dirname)

loadEnvFile(projectRoot)

function proxyKey(proxy) {
    if (!proxy?.url || !proxy.port) return null
    return JSON.stringify({
        proxyHttp: Boolean(proxy.proxyHttp),
        url: proxy.url,
        port: Number(proxy.port),
        username: proxy.username ?? '',
        password: proxy.password ?? ''
    })
}

const accounts = loadAccountsFromEnv(projectRoot)
if (!accounts.length) {
    log('WARN', 'No ACCOUNT_N_* rows found in .env. Nothing was migrated.')
    process.exit(0)
}

const proxies = []
const labelsByKey = new Map()
for (const account of accounts) {
    const key = proxyKey(account.proxy)
    if (!key || labelsByKey.has(key)) continue
    const label = `proxy-${String(labelsByKey.size + 1).padStart(3, '0')}`
    labelsByKey.set(key, label)
    proxies.push({ label, ...account.proxy, accountCapacity: 1 })
}

const result = importAccountBundle(projectRoot, {
    proxies,
    accounts: accounts.map(account => ({
        ...account,
        proxy: undefined,
        proxyLabel: labelsByKey.get(proxyKey(account.proxy))
    }))
})

log('SUCCESS', `Migrated ${result.total} account(s) and ${result.proxies} proxy record(s).`)
log('INFO', `Database: ${result.dbPath}`)
log('INFO', 'Accounts are now loaded from the database by default.')
