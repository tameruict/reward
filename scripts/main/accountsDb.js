import { getDirname, getProjectRoot, loadEnvFile, ensureAccountsDatabase, resolveAccountsDbPath } from '../utils.js'
import {
    cleanupProxyRecords,
    deleteAccountRecords,
    getAccountStoreStats,
    importAccountBundle,
    listAccountRows,
    setAccountStatus
} from '../accounts/store.js'
import { generateAccountsDbKey } from '../accounts/secrets.js'
import { loadAccountImportFile } from '../accounts/import.js'

const projectRoot = getProjectRoot(getDirname(import.meta.url))
loadEnvFile(projectRoot)

const [command = 'help', ...args] = process.argv.slice(2)

function usage() {
    console.log(`Account database commands:
  npm run accounts -- init
  npm run accounts -- keygen
  npm run accounts:import -- ./accounts.csv
  npm run accounts:import -- ./accounts.txt --restore-deleted
  npm run accounts:import -- ./accounts.txt --no-proxy
  npm run accounts -- list
  npm run accounts -- stats
  npm run accounts -- cleanup-proxies
  npm run accounts -- enable user@example.com
  npm run accounts -- disable user@example.com
  npm run accounts -- delete user@example.com [another@example.com ...]`)
}

try {
    if (command === 'init') {
        const dbPath = resolveAccountsDbPath(projectRoot)
        ensureAccountsDatabase(dbPath)
        console.log(`Account database ready: ${dbPath}`)
    } else if (command === 'keygen') {
        console.log(generateAccountsDbKey())
    } else if (command === 'import') {
        const restoreDeleted = args.includes('--restore-deleted')
        const noProxy = args.includes('--no-proxy')
        const knownOptions = new Set(['--restore-deleted', '--no-proxy'])
        const unknownOptions = args.filter(arg => arg.startsWith('--') && !knownOptions.has(arg))
        if (unknownOptions.length) throw new Error(`Unknown import option(s): ${unknownOptions.join(', ')}`)
        const inputPath = args.find(arg => !arg.startsWith('--'))
        if (!inputPath) throw new Error('Import requires a .csv, .txt, or .json path.')
        const loadedBundle = loadAccountImportFile(inputPath)
        const bundle = noProxy
            ? {
                  ...loadedBundle,
                  proxies: [],
                  autoAssignStoredProxies: false,
                  allowDirectAccounts: true,
                  accounts: loadedBundle.accounts.map(account => ({
                      ...account,
                      proxy: undefined,
                      proxyLabel: undefined,
                      proxy_label: undefined,
                      useProxy: false
                  }))
              }
            : loadedBundle
        if (bundle.sourceFormat === 'pipe') {
            console.log(
                `Converted pipe-delimited input: ${bundle.accounts.length} account row(s), ${bundle.proxies.length} inline proxy record(s).`
            )
        }
        if (noProxy) console.log(`Direct mode enabled: ${bundle.accounts.length} account(s) will run without proxy.`)
        const result = importAccountBundle(projectRoot, bundle, { restoreDeleted })
        console.log(
            `Imported ${result.total} account(s): ${result.inserted} inserted, ${result.updated} updated, ${result.proxies} proxy record(s).`
        )
        if (result.skippedDeleted) {
            console.log(
                `Skipped ${result.skippedDeleted} permanently deleted account(s): ${result.skippedDeletedEmails.join(', ')}`
            )
        }
        if (result.restoredDeleted) {
            console.log(
                `Restored ${result.restoredDeleted} previously deleted account(s): ${result.restoredDeletedEmails.join(', ')}`
            )
        }
        console.log(`Database: ${result.dbPath}`)
        if (result.reconciliation.deletedRecords) {
            console.log(
                `Reconciled ${result.reconciliation.mergedGroups} duplicate proxy group(s); removed ${result.reconciliation.deletedRecords} record(s).`
            )
        }
    } else if (command === 'list') {
        console.table(listAccountRows(projectRoot))
    } else if (command === 'stats') {
        console.table([getAccountStoreStats(projectRoot)])
    } else if (command === 'cleanup-proxies') {
        const result = cleanupProxyRecords(projectRoot)
        console.log(
            `Proxy cleanup complete: ${result.mergedGroups} group(s) merged, ${result.deletedRecords} record(s) removed, ${result.reassignedAccounts} account(s) reassigned.`
        )
        console.log(`Database: ${result.dbPath}`)
    } else if (command === 'enable' || command === 'disable') {
        const email = args[0]
        if (!email) throw new Error(`${command} requires an account email.`)
        const result = setAccountStatus(projectRoot, email, command === 'enable' ? 'ready' : 'disabled')
        console.log(`${result.email}: ${result.status}`)
    } else if (command === 'delete') {
        if (!args.length) throw new Error('Delete requires at least one account email.')
        const result = deleteAccountRecords(projectRoot, args)
        console.log(`Permanently deleted ${result.deleted} account(s): ${result.emails.join(', ')}`)
        console.log(`Database: ${result.dbPath}`)
    } else {
        usage()
        if (command !== 'help') process.exitCode = 1
    }
} catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
}
