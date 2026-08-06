import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'
import chalk from 'chalk'
import { decryptAccountSecret } from './accountSecrets.js'
import { parseProxyParts } from './proxyIdentity.js'

const DEFAULT_ACCOUNTS_DB_PATH = path.join('data', 'accounts.db')

export function getDirname(importMetaUrl) {
    const __filename = fileURLToPath(importMetaUrl)
    return path.dirname(__filename)
}

export function getProjectRoot(currentDir) {
    let dir = currentDir
    while (dir !== path.parse(dir).root) {
        const packagePath = path.join(dir, 'package.json')
        if (fs.existsSync(packagePath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
                if (pkg.name === 'microsoft-rewards-script') return dir
            } catch {}

            if (fs.existsSync(path.join(dir, 'src')) && fs.existsSync(path.join(dir, 'package-lock.json'))) {
                return dir
            }
        }
        dir = path.dirname(dir)
    }
    throw new Error('Could not find project root (package.json not found)')
}

export function log(level, ...args) {
    const line = `[${new Date().toISOString()}] [${level}]`
    const paintArgs = color => args.map(arg => (typeof arg === 'string' ? color(arg) : arg))
    if (level === 'ERROR') return console.error(chalk.red(line), ...paintArgs(chalk.red))
    if (level === 'WARN') return console.warn(chalk.yellow(line), ...paintArgs(chalk.yellow))
    if (level === 'SUCCESS') return console.log(chalk.green(line), ...paintArgs(chalk.green))
    console.log(chalk.cyan(line), ...paintArgs(chalk.cyan))
}

export function parseArgs(argv = process.argv.slice(2)) {
    const args = {}

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]

        if (arg.startsWith('-')) {
            const key = arg.substring(1)

            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                args[key] = argv[i + 1]
                i++
            } else {
                args[key] = true
            }
        }
    }

    return args
}

export function validateEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        log('ERROR', `Invalid or missing -email argument: ${JSON.stringify(email)}`)
        log('ERROR', 'Usage: node script.js -email you@example.com')
        process.exit(1)
    }

    return email
}

export function loadJsonFile(possiblePaths, required = true) {
    for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8')
                return { data: JSON.parse(content), path: filePath }
            } catch (error) {
                log('ERROR', `Failed to parse JSON file: ${filePath}`)
                log('ERROR', `Parse error: ${error.message}`)
                if (required) process.exit(1)
                return null
            }
        }
    }

    if (required) {
        log('ERROR', 'Required file not found. Searched in:')
        possiblePaths.forEach(p => log('ERROR', `  - ${p}`))
        process.exit(1)
    }

    return null
}

export function loadConfig(projectRoot) {
    const possiblePaths = [
        path.resolve(process.cwd(), 'config.json'),
        path.join(projectRoot, 'config.json'),
        path.join(projectRoot, 'dist', 'config.json'),
        path.join(projectRoot, 'src', 'config.json')
    ]

    const result = loadJsonFile(possiblePaths, true)

    const missingFields = []
    if (!result.data.sessionPath) missingFields.push('sessionPath')

    if (missingFields.length > 0) {
        log('ERROR', 'Invalid config.json - missing required fields:')
        missingFields.forEach(field => log('ERROR', `  - ${field}`))
        log('ERROR', `Config file: ${result.path}`)
        process.exit(1)
    }

    return result
}

export function loadEnvFile(projectRoot) {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.join(projectRoot, '.env'),
        path.join(projectRoot, 'dist', '.env'),
        path.join(projectRoot, 'src', '.env')
    ]

    const envFile = candidates.find(p => fs.existsSync(p))
    if (!envFile) return

    const raw = fs.readFileSync(envFile, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        const eq = trimmed.indexOf('=')
        if (eq === -1) continue

        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }

        if (process.env[key] === undefined) {
            process.env[key] = value
        }
    }
}

function envStr(key) {
    const v = process.env[key]
    if (v === undefined) return undefined
    const trimmed = v.trim()
    return trimmed.length ? trimmed : undefined
}

function envBool(key, fallback) {
    const v = envStr(key)
    if (v === undefined) return fallback
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

const deprecationWarned = new Set()
function envBoolWithLegacy(primary, legacy, fallback) {
    if (envStr(primary) !== undefined) return envBool(primary, fallback)
    if (envStr(legacy) !== undefined) {
        if (!deprecationWarned.has(legacy)) {
            deprecationWarned.add(legacy)
            log('WARN', `${legacy} is deprecated; rename it to ${primary}.`)
        }
        return envBool(legacy, fallback)
    }
    return fallback
}

function envInt(key, fallback) {
    const v = envStr(key)
    if (v === undefined) return fallback
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : fallback
}

export function loadAccountsFromEnv(projectRoot) {
    loadEnvFile(projectRoot)

    const accounts = []
    for (let i = 1; ; i++) {
        const idx = String(i)
        const email = envStr(`ACCOUNT_${idx}_EMAIL`)

        if (!email) break

        accounts.push({
            email,
            password: envStr(`ACCOUNT_${idx}_PASSWORD`) ?? '',
            totpSecret: envStr(`ACCOUNT_${idx}_TOTP_SECRET`),
            recoveryEmail: envStr(`ACCOUNT_${idx}_RECOVERY_EMAIL`) ?? '',
            geoLocale: envStr(`ACCOUNT_${idx}_GEO_LOCALE`) ?? 'auto',
            langCode: envStr(`ACCOUNT_${idx}_LANG_CODE`) ?? 'en',
            useProxy: envBool(`ACCOUNT_${idx}_USE_PROXY`, true),
            proxy: {
                proxyHttp: envBoolWithLegacy(`ACCOUNT_${idx}_PROXY_HTTP`, `ACCOUNT_${idx}_PROXY_AXIOS`, false),
                url: envStr(`ACCOUNT_${idx}_PROXY_URL`) ?? '',
                port: envInt(`ACCOUNT_${idx}_PROXY_PORT`, 0),
                username: envStr(`ACCOUNT_${idx}_PROXY_USERNAME`) ?? '',
                password: envStr(`ACCOUNT_${idx}_PROXY_PASSWORD`) ?? ''
            },
            saveFingerprint: {
                mobile: envBool(`ACCOUNT_${idx}_SAVE_FINGERPRINT_MOBILE`, true),
                desktop: envBool(`ACCOUNT_${idx}_SAVE_FINGERPRINT_DESKTOP`, true)
            }
        })
    }

    return accounts
}

export function resolveAccountsDbPath(projectRoot) {
    const configured = process.env.ACCOUNTS_DB_PATH?.trim()
    const dbPath = configured || DEFAULT_ACCOUNTS_DB_PATH
    return path.isAbsolute(dbPath) ? dbPath : path.join(projectRoot, dbPath)
}

export function ensureAccountsDatabase(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new DatabaseSync(dbPath)

    try {
        db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;

            CREATE TABLE IF NOT EXISTS proxies (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                proxy_http INTEGER NOT NULL DEFAULT 0,
                url TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 0,
                username TEXT NOT NULL DEFAULT '',
                password TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                max_concurrency INTEGER NOT NULL DEFAULT 1,
                account_capacity INTEGER NOT NULL DEFAULT 1,
                identity_key TEXT,
                egress_ip TEXT,
                cooldown_seconds INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                totp_secret TEXT,
                recovery_email TEXT NOT NULL DEFAULT '',
                geo_locale TEXT NOT NULL DEFAULT 'auto',
                lang_code TEXT NOT NULL DEFAULT 'en',
                proxy_id TEXT REFERENCES proxies(id) ON UPDATE CASCADE ON DELETE SET NULL,
                use_proxy INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'ready',
                slot INTEGER,
                save_fingerprint_mobile INTEGER NOT NULL DEFAULT 1,
                save_fingerprint_desktop INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS deleted_accounts (
                email TEXT PRIMARY KEY COLLATE NOCASE,
                deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_accounts_proxy_id ON accounts(proxy_id);
            CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
            CREATE INDEX IF NOT EXISTS idx_accounts_slot ON accounts(slot);
            CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
        `)

        const proxyColumns = new Set(
            db
                .prepare('PRAGMA table_info(proxies)')
                .all()
                .map(row => row.name)
        )
        if (!proxyColumns.has('account_capacity')) {
            db.exec('ALTER TABLE proxies ADD COLUMN account_capacity INTEGER NOT NULL DEFAULT 1')
        }
        if (!proxyColumns.has('identity_key')) {
            db.exec('ALTER TABLE proxies ADD COLUMN identity_key TEXT')
        }
        if (!proxyColumns.has('egress_ip')) {
            db.exec('ALTER TABLE proxies ADD COLUMN egress_ip TEXT')
        }
        const accountColumns = new Set(
            db
                .prepare('PRAGMA table_info(accounts)')
                .all()
                .map(row => row.name)
        )
        if (!accountColumns.has('use_proxy')) {
            db.exec('ALTER TABLE accounts ADD COLUMN use_proxy INTEGER NOT NULL DEFAULT 1')
        }
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_proxies_identity_key ON proxies(identity_key)')
    } finally {
        db.close()
    }
}

export function loadAccountsFromDatabase(projectRoot) {
    const dbPath = resolveAccountsDbPath(projectRoot)
    if (!fs.existsSync(dbPath)) return null

    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        const rows = db
            .prepare(
                `
                SELECT
                    a.id AS account_id,
                    a.email,
                    a.password,
                    a.totp_secret,
                    a.recovery_email,
                    a.geo_locale,
                    a.lang_code,
                    a.proxy_id,
                    a.use_proxy,
                    a.status AS account_status,
                    a.slot,
                    a.save_fingerprint_mobile,
                    a.save_fingerprint_desktop,
                    p.proxy_http,
                    p.url AS proxy_url,
                    p.port AS proxy_port,
                    p.username AS proxy_username,
                    p.password AS proxy_password
                FROM accounts a
                LEFT JOIN proxies p ON p.id = a.proxy_id
                WHERE a.status IN ('ready', 'active')
                  AND (a.proxy_id IS NULL OR p.status = 'active')
                ORDER BY COALESCE(a.slot, 2147483647), a.email
                `
            )
            .all()

        return rows.map(row => ({
            accountId: row.account_id,
            proxyId: row.proxy_id,
            useProxy: Boolean(row.use_proxy),
            status: row.account_status,
            slot: row.slot ?? undefined,
            email: row.email,
            password: decryptAccountSecret(row.password, `password for ${row.email}`),
            totpSecret: row.totp_secret
                ? decryptAccountSecret(row.totp_secret, `TOTP secret for ${row.email}`)
                : undefined,
            recoveryEmail: row.recovery_email ?? '',
            geoLocale: row.geo_locale ?? 'auto',
            langCode: row.lang_code ?? 'en',
            proxy: {
                proxyHttp: Boolean(row.proxy_http),
                url: row.proxy_url ?? '',
                port: row.proxy_port ?? 0,
                username: row.proxy_username ?? '',
                password: decryptAccountSecret(row.proxy_password, `proxy password for ${row.email}`)
            },
            saveFingerprint: {
                mobile: Boolean(row.save_fingerprint_mobile),
                desktop: Boolean(row.save_fingerprint_desktop)
            }
        }))
    } finally {
        db.close()
    }
}

export function loadAccounts(projectRoot) {
    loadEnvFile(projectRoot)

    const source = process.env.ACCOUNTS_SOURCE?.trim().toLowerCase() || 'database'
    if (!['auto', 'database', 'env'].includes(source)) {
        throw new Error('ACCOUNTS_SOURCE must be one of: auto, database, env')
    }

    if (source !== 'env') {
        const databaseAccounts = loadAccountsFromDatabase(projectRoot)
        if (databaseAccounts?.length) return databaseAccounts
        if (source === 'database') {
            throw new Error('No active accounts found in database.')
        }
    }

    return loadAccountsFromEnv(projectRoot)
}

export function findAccountByEmail(accounts, email) {
    if (!email || typeof email !== 'string') return null
    return (
        accounts.find(a => a?.email && typeof a.email === 'string' && a.email.toLowerCase() === email.toLowerCase()) ||
        null
    )
}

export function getUserAgent(fingerprint) {
    if (!fingerprint) return null
    return (
        fingerprint?.fingerprint?.navigator?.userAgent ??
        fingerprint?.fingerprint?.userAgent ??
        fingerprint?.userAgent ??
        null
    )
}

export function buildProxyConfig(account) {
    if (!account?.proxy?.url || !account.proxy.port) {
        const parsed = parseProxyParts(account?.proxy)
        if (!parsed.host || !parsed.port) return null
    }

    const parsed = parseProxyParts(account.proxy)
    if (!parsed.host || !Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) return null

    const proxy = {
        server: `${parsed.protocol}://${parsed.host}:${parsed.port}`
    }

    if (parsed.username && parsed.password) {
        proxy.username = parsed.username
        proxy.password = parsed.password
    }

    return proxy
}

export function setupCleanupHandlers(cleanupFn) {
    const cleanup = async () => {
        try {
            await cleanupFn()
        } catch (error) {
            log('ERROR', 'Cleanup failed:', error.message)
        }
        process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
}

export function getSessionDbPath(projectRoot, sessionPath) {
    const candidates = [
        path.resolve(process.cwd(), sessionPath, 'sessions.db'),
        path.join(projectRoot, sessionPath, 'sessions.db'),
        path.join(projectRoot, 'dist', sessionPath, 'sessions.db'),
        path.join(projectRoot, 'src', sessionPath, 'sessions.db')
    ]

    const found = candidates.find(p => fs.existsSync(p))
    return { dbPath: found ?? candidates[0], exists: Boolean(found), candidates }
}

export function openSessionDb(dbPath, { readonly = false } = {}) {
    return new DatabaseSync(dbPath, { readOnly: readonly })
}

export function closeSessionDb(db) {
    try {
        db.close()
    } catch {}
}

export function loadSessionRow(db, email, platform) {
    const row = db
        .prepare('SELECT storage_state, fingerprint, updated_at FROM sessions WHERE email = ? AND platform = ?')
        .get(email, platform)

    if (!row) return null

    return {
        storageState: row.storage_state ? JSON.parse(row.storage_state) : null,
        fingerprint: row.fingerprint ? JSON.parse(row.fingerprint) : null,
        updatedAt: row.updated_at
    }
}

export function listSessionRows(db) {
    return db.prepare('SELECT email, platform, updated_at FROM sessions ORDER BY email, platform').all()
}

export function clearSessionRows(db, email) {
    const info = email
        ? db.prepare('DELETE FROM sessions WHERE LOWER(email) = LOWER(?)').run(email)
        : db.prepare('DELETE FROM sessions').run()

    try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {}

    return Number(info.changes ?? 0)
}
