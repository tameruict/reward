import { getDirname, getProjectRoot, loadEnvFile, ensureAccountsDatabase, resolveAccountsDbPath } from '../utils.js'
import {
    cleanupProxyRecords,
    getAccountStoreStats,
    importAccountBundle,
    listAccountRows,
    setAccountStatus
} from '../accountStore.js'
import { generateAccountsDbKey } from '../accountSecrets.js'
import { loadAccountImportFile } from '../accountImport.js'

const projectRoot = getProjectRoot(getDirname(import.meta.url))
loadEnvFile(projectRoot)

const [command = 'help', ...args] = process.argv.slice(2)

function usage() {
    console.log(`Account database commands:
  npm run accounts -- init
  npm run accounts -- keygen
  npm run accounts:import -- ./accounts.csv
  npm run accounts -- list
  npm run accounts -- stats
  npm run accounts -- cleanup-proxies
  npm run accounts -- enable user@example.com
  npm run accounts -- disable user@example.com`)
}

try {
    if (command === 'init') {
        const dbPath = resolveAccountsDbPath(projectRoot)
        ensureAccountsDatabase(dbPath)
        console.log(`Account database ready: ${dbPath}`)
    } else if (command === 'keygen') {
        console.log(generateAccountsDbKey())
    } else if (command === 'import') {
        const inputPath = args[0]
        if (!inputPath) throw new Error('Import requires a .csv, .txt, or .json path.')
        const bundle = loadAccountImportFile(inputPath)
        const result = importAccountBundle(projectRoot, bundle)
        console.log(
            `Imported ${result.total} account(s): ${result.inserted} inserted, ${result.updated} updated, ${result.proxies} proxy record(s).`
        )
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
    } else {
        usage()
        if (command !== 'help') process.exitCode = 1
    }
} catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
}
