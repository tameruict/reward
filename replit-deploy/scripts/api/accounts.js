import {
    getDirname,
    getProjectRoot,
    loadAccounts as loadConfiguredAccounts,
    loadAccountsFromDatabase
} from '../utils.js'

const projectRoot = getProjectRoot(getDirname(import.meta.url))

function envStrFrom(sourceEnv, key) {
    const v = sourceEnv[key]
    if (v === undefined) return undefined
    const t = String(v).trim()
    return t.length ? t : undefined
}

function loadAccountsFromEnvObject(sourceEnv) {
    const accounts = []
    const indexes = [
        ...new Set(
            Object.keys(sourceEnv)
                .map(key => /^ACCOUNT_(\d+)_EMAIL$/.exec(key)?.[1])
                .filter(Boolean)
                .map(Number)
        )
    ].sort((a, b) => a - b)

    for (const i of indexes) {
        const email = envStrFrom(sourceEnv, `ACCOUNT_${i}_EMAIL`)
        if (!email) continue

        accounts.push({
            slot: i,
            email,
            password: envStrFrom(sourceEnv, `ACCOUNT_${i}_PASSWORD`) ?? '',
            totpSecret: envStrFrom(sourceEnv, `ACCOUNT_${i}_TOTP_SECRET`),
            recoveryEmail: envStrFrom(sourceEnv, `ACCOUNT_${i}_RECOVERY_EMAIL`) ?? '',
            geoLocale: envStrFrom(sourceEnv, `ACCOUNT_${i}_GEO_LOCALE`) ?? 'auto',
            langCode: envStrFrom(sourceEnv, `ACCOUNT_${i}_LANG_CODE`) ?? 'en',
            useProxy: !['0', 'false', 'no', 'off'].includes(
                (envStrFrom(sourceEnv, `ACCOUNT_${i}_USE_PROXY`) ?? 'true').toLowerCase()
            ),
            proxy: {
                proxyHttp: ['1', 'true', 'yes', 'on'].includes(
                    (
                        envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_HTTP`) ??
                        envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_AXIOS`) ??
                        'false'
                    ).toLowerCase()
                ),
                url: envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_URL`) ?? '',
                port: Number(envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_PORT`) ?? 0),
                username: envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_USERNAME`) ?? '',
                password: envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_PASSWORD`) ?? ''
            },
            saveFingerprint: {
                mobile: ['1', 'true', 'yes', 'on'].includes(
                    (envStrFrom(sourceEnv, `ACCOUNT_${i}_SAVE_FINGERPRINT_MOBILE`) ?? 'true').toLowerCase()
                ),
                desktop: ['1', 'true', 'yes', 'on'].includes(
                    (envStrFrom(sourceEnv, `ACCOUNT_${i}_SAVE_FINGERPRINT_DESKTOP`) ?? 'true').toLowerCase()
                )
            }
        })
    }

    return accounts
}

function loadConfiguredAccountList(sourceEnv) {
    if (sourceEnv !== process.env) return loadAccountsFromEnvObject(sourceEnv)

    // The Account Manager stores credentials in the VPS database. Prefer it
    // for dashboard-triggered runs even when an older VPS .env still says
    // ACCOUNTS_SOURCE=env. Fall back to the legacy env source only when no
    // database accounts exist.
    const databaseAccounts = loadAccountsFromDatabase(projectRoot)
    if (databaseAccounts?.length) return databaseAccounts
    return loadConfiguredAccounts(projectRoot)
}

function resolveAccountIndex(account, fallback) {
    return Number.isSafeInteger(account.slot) && account.slot > 0 ? account.slot : fallback
}

function accountToEnv(account, targetIndex) {
    const prefix = `ACCOUNT_${targetIndex}_`
    const env = {
        [`${prefix}EMAIL`]: account.email,
        [`${prefix}PASSWORD`]: account.password,
        [`${prefix}RECOVERY_EMAIL`]: account.recoveryEmail ?? '',
        [`${prefix}GEO_LOCALE`]: account.geoLocale ?? 'auto',
        [`${prefix}LANG_CODE`]: account.langCode ?? 'en',
        [`${prefix}USE_PROXY`]: account.useProxy === false ? 'false' : 'true',
        [`${prefix}SAVE_FINGERPRINT_MOBILE`]: account.saveFingerprint?.mobile ? 'true' : 'false',
        [`${prefix}SAVE_FINGERPRINT_DESKTOP`]: account.saveFingerprint?.desktop ? 'true' : 'false'
    }

    if (account.totpSecret) env[`${prefix}TOTP_SECRET`] = account.totpSecret
    if (account.proxy?.url) {
        env[`${prefix}PROXY_HTTP`] = account.proxy.proxyHttp ? 'true' : 'false'
        env[`${prefix}PROXY_URL`] = account.proxy.url
        env[`${prefix}PROXY_PORT`] = String(account.proxy.port ?? 0)
        env[`${prefix}PROXY_USERNAME`] = account.proxy.username ?? ''
        env[`${prefix}PROXY_PASSWORD`] = account.proxy.password ?? ''
    }

    return env
}

/**
 * Builds the complete account environment for a normal run.
 *
 * The dashboard account list is database-backed, while the bot still accepts
 * accounts through ACCOUNT_N_* variables. Keep that translation inside the
 * VPS API so decrypted credentials never cross the API boundary.
 */
export function buildAllAccountsEnv(sourceEnv = process.env) {
    const databaseAccounts = loadAccountsFromDatabase(projectRoot)
    const accounts = databaseAccounts?.length ? databaseAccounts : loadConfiguredAccountList(sourceEnv)
    if (!accounts.length) {
        const err = new Error('No active accounts found in the VPS account database.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const env = { ACCOUNTS_SOURCE: 'env' }
    for (const key of Object.keys(sourceEnv)) {
        if (/^ACCOUNT_\d+_/.test(key)) env[key] = ''
    }

    const normalized = accounts.map((account, position) => ({
        ...account,
        index: resolveAccountIndex(account, position + 1)
    }))
    normalized.forEach((account, position) => Object.assign(env, accountToEnv(account, position + 1)))

    return {
        env,
        includedAccounts: normalized.map(({ index, email }) => ({ index, email }))
    }
}

/**
 * Returns the configured accounts without exposing passwords, recovery
 * addresses, TOTP secrets, or proxy credentials. This API is intended for the
 * local dashboard, so account email addresses are returned in full.
 */
export function loadAccounts(sourceEnv = process.env) {
    return loadConfiguredAccountList(sourceEnv).map((account, position) => {
        const proxyUrl = account.proxy?.url
        const index = resolveAccountIndex(account, position + 1)
        return {
            index,
            email: account.email,
            emailKey: account.email, // internal history join key; removed before returning the response
            geoLocale: account.geoLocale ?? 'auto',
            langCode: account.langCode ?? 'en',
            useProxy: account.useProxy !== false,
            hasRecoveryEmail: Boolean(account.recoveryEmail),
            hasTotp: Boolean(account.totpSecret),
            proxy: proxyUrl
                ? {
                      url: proxyUrl,
                      port: account.proxy?.port ?? null,
                      hasCredentials: Boolean(account.proxy?.username)
                  }
                : null
        }
    })
}

/**
 * Returns the same safe account shape used by the dashboard-backed database
 * rows, but also works when Replit keeps accounts only in Secrets.  Secrets
 * are read inside the API process and only non-sensitive metadata leaves it.
 */
export function listConfiguredAccountRows(sourceEnv = process.env) {
    return loadConfiguredAccountList(sourceEnv).map((account, position) => {
        const index = resolveAccountIndex(account, position + 1)
        const proxy = account.proxy?.url
            ? {
                  id: account.proxyId ?? `env-proxy-${index}`,
                  label: account.proxyLabel ?? `ACCOUNT_${index} proxy`,
                  status: 'active',
                  url: account.proxy.url,
                  port: Number(account.proxy.port ?? 0),
                  hasCredentials: Boolean(account.proxy.username || account.proxy.password),
                  accountCapacity: 1,
                  egressIp: null,
                  cooldownSeconds: 0
              }
            : null

        return {
            id: account.accountId ?? `env-account-${index}`,
            index,
            email: account.email,
            emailKey: account.email,
            status: account.status ?? 'ready',
            useProxy: account.useProxy !== false,
            hasRecoveryEmail: Boolean(account.recoveryEmail),
            hasTotp: Boolean(account.totpSecret),
            geoLocale: account.geoLocale ?? 'auto',
            langCode: account.langCode ?? 'en',
            proxy
        }
    })
}

// Kept as a compatibility alias for code that imported the old function name.
export const loadAccountsMasked = loadAccounts

/**
 * Builds a child-process-only environment override that runs exactly one
 * configured account. The selected slot is remapped to ACCOUNT_1_* because the
 * bot reads account slots sequentially and stops at the first missing email.
 * No secret values leave the API process.
 */
export function buildSingleAccountEnv(accountIndex, sourceEnv = process.env) {
    const index = Number(accountIndex)
    if (!Number.isSafeInteger(index) || index < 1) {
        const err = new Error('`accountIndex` must be a positive integer.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const accounts = loadConfiguredAccountList(sourceEnv)
    const account = accounts.find((item, position) => resolveAccountIndex(item, position + 1) === index)
    if (!account) {
        const err = new Error(`ACCOUNT_${index} is not configured.`)
        err.code = 'BAD_REQUEST'
        throw err
    }

    const env = {}
    env.ACCOUNTS_SOURCE = 'env'

    // Blank every configured account variable in the child environment first.
    // Empty strings are treated as unset by the bot's env parser.
    for (const key of Object.keys(sourceEnv)) {
        if (/^ACCOUNT_\d+_/.test(key)) env[key] = ''
    }

    Object.assign(env, accountToEnv(account, 1))

    return {
        env,
        account: { index, email: account.email }
    }
}

export function buildSingleAccountEnvById(accountId, sourceEnv = process.env) {
    const id = String(accountId ?? '').trim()
    if (!id) {
        const err = new Error('`accountId` is required.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const accounts = loadConfiguredAccountList(sourceEnv)
    const account = accounts.find(item => item.accountId === id)
    if (!account) {
        const err = new Error(`Account is not active or does not exist: ${id}.`)
        err.code = 'BAD_REQUEST'
        throw err
    }

    const env = { ACCOUNTS_SOURCE: 'env' }
    for (const key of Object.keys(sourceEnv)) {
        if (/^ACCOUNT_\d+_/.test(key)) env[key] = ''
    }
    Object.assign(env, accountToEnv(account, 1))

    return {
        env,
        account: { id, index: resolveAccountIndex(account, 1), email: account.email }
    }
}

/**
 * Builds a dense child-process account environment with selected configured
 * slots excluded. Remaining slots are remapped to ACCOUNT_1..N so gaps never
 * make the bot stop discovering accounts early.
 */
export function buildExcludedAccountsEnv(excludedAccountIndexes, sourceEnv = process.env) {
    if (!Array.isArray(excludedAccountIndexes)) {
        const err = new Error('`excludedAccountIndexes` must be an array of positive integers.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const excluded = [...new Set(excludedAccountIndexes.map(Number))]
    if (excluded.some(index => !Number.isSafeInteger(index) || index < 1)) {
        const err = new Error('`excludedAccountIndexes` must contain only positive integers.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const accounts = loadConfiguredAccountList(sourceEnv).map((account, position) => ({
        ...account,
        index: resolveAccountIndex(account, position + 1)
    }))
    const knownIndexes = new Set(accounts.map(account => account.index))
    const unknown = excluded.filter(index => !knownIndexes.has(index))
    if (unknown.length) {
        const err = new Error(
            `Unknown account slot${unknown.length === 1 ? '' : 's'}: ${unknown.map(index => `ACCOUNT_${index}`).join(', ')}.`
        )
        err.code = 'BAD_REQUEST'
        throw err
    }

    const excludedSet = new Set(excluded)
    const included = accounts.filter(account => !excludedSet.has(account.index))
    if (!included.length) {
        const err = new Error('A scheduled run cannot exclude every configured account.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const env = {}
    env.ACCOUNTS_SOURCE = 'env'
    for (const key of Object.keys(sourceEnv)) {
        if (/^ACCOUNT_\d+_/.test(key)) env[key] = ''
    }

    included.forEach((account, position) => Object.assign(env, accountToEnv(account, position + 1)))

    return {
        env,
        excludedAccounts: accounts
            .filter(account => excludedSet.has(account.index))
            .map(({ index, email }) => ({ index, email })),
        includedAccounts: included.map(({ index, email }) => ({ index, email }))
    }
}

export function mergeAccountStats(accounts, runs) {
    // Index history results by email.
    const byEmail = new Map()
    for (const run of runs) {
        const when = run.endedAt || run.startedAt || null
        for (const acc of run.accounts || []) {
            if (!byEmail.has(acc.email)) byEmail.set(acc.email, [])
            byEmail.get(acc.email).push({ ...acc, when })
        }
    }

    return accounts.map(a => {
        const results = byEmail.get(a.emailKey) || [] // already most-recent-first
        const last = results[0] || null
        const streakProtection = results.find(result => result.streakProtection != null)?.streakProtection ?? null

        let totalCollected = 0
        for (const r of results) totalCollected += r.collected || 0

        // Consecutive successes from the most recent run backwards.
        let successStreak = 0
        for (const r of results) {
            if (r.success === true) successStreak++
            else break
        }

        const { emailKey, ...safe } = a
        void emailKey
        return {
            ...safe,
            runs: results.length,
            totalCollected,
            successStreak,
            lastRunAt: last?.when ?? null,
            lastCollected: last?.collected ?? null,
            lastSuccess: last ? last.success : null,
            lastError: last?.error ?? null,
            streakProtection
        }
    })
}
