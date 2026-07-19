import crypto from 'node:crypto'
import net from 'node:net'
import { DatabaseSync } from 'node:sqlite'

import { ensureAccountsDatabase, resolveAccountsDbPath } from './utils.js'
import { encryptAccountSecret } from './accountSecrets.js'
import { formatProxyUrl, parseProxyParts, proxyIdentityKey } from './proxyIdentity.js'

const ACCOUNT_STATUSES = new Set(['ready', 'active', 'disabled', 'error', 'cooldown'])
const PROXY_STATUSES = new Set(['active', 'disabled', 'error', 'cooldown'])

function fail(message) {
    const error = new Error(message)
    error.code = 'BAD_REQUEST'
    throw error
}

function text(value, fallback = '') {
    return value == null ? fallback : String(value).trim()
}

function positiveInt(value, fallback, field) {
    if (value == null || value === '') return fallback
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`${field} must be a positive integer.`)
    return parsed
}

function boolInt(value) {
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) ? 1 : 0
    return value ? 1 : 0
}

function stableId(prefix, value) {
    return `${prefix}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`
}

function normalizeProxy(raw, fallbackLabel) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Each proxy must be a JSON object.')

    const label = text(raw.label, fallbackLabel)
    const parsedProxy = parseProxyParts(raw)
    const url = text(formatProxyUrl(parsedProxy))
    const port = positiveInt(parsedProxy.port, 0, `Proxy ${label || '(unlabelled)'} port`)
    if (!label) fail('Every proxy requires a unique label.')
    if (!parsedProxy.host) fail(`Proxy ${label} requires url.`)
    if (!port) fail(`Proxy ${label} requires port.`)

    const status = text(raw.status, 'active').toLowerCase()
    if (!PROXY_STATUSES.has(status)) fail(`Proxy ${label} has invalid status: ${status}.`)

    const accountCapacity = positiveInt(
        raw.accountCapacity ?? raw.account_capacity,
        1,
        `Proxy ${label} accountCapacity`
    )

    const username = text(parsedProxy.username)
    const egressIp = text(raw.egressIp ?? raw.egress_ip)
    if (egressIp && !net.isIP(egressIp)) fail(`Proxy ${label} has invalid egressIp: ${egressIp}.`)
    return {
        id: stableId('proxy', label.toLowerCase()),
        identityKey: proxyIdentityKey({ url, port, username }),
        label,
        proxyHttp: boolInt(raw.proxyHttp),
        url,
        port,
        username,
        password: encryptAccountSecret(text(parsedProxy.password)),
        status,
        maxConcurrency: 1,
        accountCapacity,
        egressIp: egressIp.toLowerCase(),
        cooldownSeconds: Math.max(0, Number(raw.cooldownSeconds ?? raw.cooldown_seconds ?? 0) || 0)
    }
}

function normalizeBundle(input) {
    const bundle = Array.isArray(input) ? { accounts: input } : input
    if (!bundle || typeof bundle !== 'object') fail('Import file must contain an object or an account array.')
    if (!Array.isArray(bundle.accounts) || !bundle.accounts.length)
        fail('Import file must contain a non-empty accounts array.')
    if (bundle.proxies != null && !Array.isArray(bundle.proxies)) fail('proxies must be an array.')
    return { proxies: bundle.proxies ?? [], accounts: bundle.accounts }
}

function tableExists(db, name) {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function assertNoActiveJobs(db) {
    if (!tableExists(db, 'account_jobs')) return
    const active = Number(
        db.prepare("SELECT COUNT(*) AS value FROM account_jobs WHERE status IN ('pending', 'queued', 'running')").get()
            .value
    )
    if (active) fail(`Cannot reconcile proxies while ${active} account job(s) are active.`)
}

function reconcileStoredProxies(db) {
    const rows = db
        .prepare(
            `
            SELECT p.*, COUNT(a.id) AS account_count,
                   SUM(CASE WHEN a.status <> 'disabled' THEN 1 ELSE 0 END) AS enabled_account_count
            FROM proxies p
            LEFT JOIN accounts a ON a.proxy_id = p.id
            GROUP BY p.id
        `
        )
        .all()
        .map(row => ({ ...row, canonical_identity: proxyIdentityKey(row) }))

    const groups = new Map()
    for (const row of rows) {
        if (!groups.has(row.canonical_identity)) groups.set(row.canonical_identity, [])
        groups.get(row.canonical_identity).push(row)
    }

    const duplicateGroups = [...groups.values()].filter(group => group.length > 1)
    if (duplicateGroups.length) assertNoActiveJobs(db)

    let mergedGroups = 0
    let deletedRecords = 0
    let reassignedAccounts = 0
    for (const group of groups.values()) {
        group.sort(
            (a, b) =>
                Number(b.account_count) - Number(a.account_count) ||
                Number(b.proxy_http) - Number(a.proxy_http) ||
                Number(b.status === 'active') - Number(a.status === 'active') ||
                String(b.updated_at).localeCompare(String(a.updated_at))
        )
        const survivor = group[0]
        for (const duplicate of group.slice(1)) {
            const moved = db
                .prepare('UPDATE accounts SET proxy_id = ? WHERE proxy_id = ?')
                .run(survivor.id, duplicate.id)
            reassignedAccounts += Number(moved.changes || 0)
            if (tableExists(db, 'account_jobs')) {
                db.prepare('UPDATE account_jobs SET proxy_id = ? WHERE proxy_id = ?').run(survivor.id, duplicate.id)
            }
            db.prepare('DELETE FROM proxies WHERE id = ?').run(duplicate.id)
            deletedRecords += 1
        }
        if (group.length > 1) mergedGroups += 1
        db.prepare('UPDATE proxies SET identity_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
            survivor.canonical_identity,
            survivor.id
        )
    }

    return { mergedGroups, deletedRecords, reassignedAccounts }
}

export function cleanupProxyRecords(projectRoot) {
    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath)
    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')
        const result = reconcileStoredProxies(db)
        db.exec('COMMIT')
        return { dbPath, ...result }
    } catch (error) {
        try {
            db.exec('ROLLBACK')
        } catch {}
        throw error
    } finally {
        db.close()
    }
}

export function importAccountBundle(projectRoot, input) {
    const normalizedBundle = normalizeBundle(input)
    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath)

    const deletedEmails = new Set(
        db
            .prepare('SELECT LOWER(email) AS email FROM deleted_accounts')
            .all()
            .map(row => row.email)
    )
    const skippedDeletedEmails = normalizedBundle.accounts
        .map(account => text(account?.email).toLowerCase())
        .filter(email => deletedEmails.has(email))
    const bundle = {
        ...normalizedBundle,
        accounts: normalizedBundle.accounts.filter(account => !deletedEmails.has(text(account?.email).toLowerCase()))
    }

    const proxiesByLabel = new Map()
    const proxyLabelsByIdentity = new Map()
    for (const raw of bundle.proxies) {
        const proxy = normalizeProxy(raw)
        const key = proxy.label.toLowerCase()
        if (proxiesByLabel.has(key)) fail(`Duplicate proxy label in import: ${proxy.label}.`)
        const identityOwner = proxyLabelsByIdentity.get(proxy.identityKey)
        if (identityOwner) fail(`Proxy labels ${identityOwner} and ${proxy.label} resolve to the same endpoint.`)
        proxiesByLabel.set(key, proxy)
        proxyLabelsByIdentity.set(proxy.identityKey, proxy.label)
    }

    for (const rawAccount of bundle.accounts) {
        if (rawAccount?.proxy && !rawAccount.proxyLabel && !rawAccount.proxy_label) {
            const inline = normalizeProxy(rawAccount.proxy, `proxy-${proxiesByLabel.size + 1}`)
            const key = inline.label.toLowerCase()
            const existing = proxiesByLabel.get(key)
            if (existing && existing.identityKey !== inline.identityKey) {
                fail(`Proxy label ${inline.label} is used for different endpoints.`)
            }
            const identityOwner = proxyLabelsByIdentity.get(inline.identityKey)
            if (identityOwner && identityOwner.toLowerCase() !== key) {
                fail(`Proxy labels ${identityOwner} and ${inline.label} resolve to the same endpoint.`)
            }
            proxiesByLabel.set(key, inline)
            proxyLabelsByIdentity.set(inline.identityKey, inline.label)
            rawAccount.proxyLabel = inline.label
        }
    }

    const accountEmails = new Set()
    let inserted = 0
    let updated = 0

    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')
        const reconciliation = reconcileStoredProxies(db)

        const upsertProxy = db.prepare(`
            INSERT INTO proxies (
                id, label, proxy_http, url, port, username, password, status,
                max_concurrency, account_capacity, identity_key, egress_ip, cooldown_seconds, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                label = excluded.label,
                proxy_http = excluded.proxy_http,
                url = excluded.url,
                port = excluded.port,
                username = excluded.username,
                password = excluded.password,
                status = excluded.status,
                max_concurrency = 1,
                account_capacity = excluded.account_capacity,
                identity_key = excluded.identity_key,
                egress_ip = excluded.egress_ip,
                cooldown_seconds = excluded.cooldown_seconds,
                updated_at = CURRENT_TIMESTAMP
        `)
        const findProxyByLabel = db.prepare('SELECT id FROM proxies WHERE LOWER(label) = LOWER(?)')
        const findProxyByIdentity = db.prepare('SELECT id FROM proxies WHERE identity_key = ?')

        for (const proxy of proxiesByLabel.values()) {
            const current = findProxyByIdentity.get(proxy.identityKey) ?? findProxyByLabel.get(proxy.label)
            if (current && current.id !== proxy.id) proxy.id = current.id
            upsertProxy.run(
                proxy.id,
                proxy.label,
                proxy.proxyHttp,
                proxy.url,
                proxy.port,
                proxy.username,
                proxy.password,
                proxy.status,
                proxy.accountCapacity,
                proxy.identityKey,
                proxy.egressIp,
                proxy.cooldownSeconds
            )
        }

        let nextSlot = Number(db.prepare('SELECT COALESCE(MAX(slot), 0) AS value FROM accounts').get().value)
        const findAccount = db.prepare('SELECT id, password, slot FROM accounts WHERE LOWER(email) = LOWER(?)')
        const upsertAccount = db.prepare(`
            INSERT INTO accounts (
                id, email, password, totp_secret, recovery_email, geo_locale, lang_code,
                proxy_id, status, slot, save_fingerprint_mobile, save_fingerprint_desktop, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(email) DO UPDATE SET
                password = excluded.password,
                totp_secret = excluded.totp_secret,
                recovery_email = excluded.recovery_email,
                geo_locale = excluded.geo_locale,
                lang_code = excluded.lang_code,
                proxy_id = excluded.proxy_id,
                status = excluded.status,
                slot = excluded.slot,
                save_fingerprint_mobile = excluded.save_fingerprint_mobile,
                save_fingerprint_desktop = excluded.save_fingerprint_desktop,
                updated_at = CURRENT_TIMESTAMP
        `)

        for (const raw of bundle.accounts) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Each account must be a JSON object.')
            const email = text(raw.email).toLowerCase()
            if (!email || !email.includes('@')) fail('Every account requires a valid email.')
            if (accountEmails.has(email)) fail(`Duplicate account email in import: ${email}.`)
            accountEmails.add(email)

            const existing = findAccount.get(email)
            const password = text(raw.password, existing?.password)
            if (!password) fail(`Account ${email} requires password.`)

            const status = text(raw.status, 'ready').toLowerCase()
            if (!ACCOUNT_STATUSES.has(status)) fail(`Account ${email} has invalid status: ${status}.`)

            const proxyLabel = text(raw.proxyLabel ?? raw.proxy_label)
            let proxyId = null
            if (proxyLabel) {
                const proxy = proxiesByLabel.get(proxyLabel.toLowerCase())
                const stored = proxy ? { id: proxy.id } : findProxyByLabel.get(proxyLabel)
                if (!stored) fail(`Account ${email} references unknown proxyLabel: ${proxyLabel}.`)
                proxyId = stored.id
            } else {
                fail(`Account ${email} requires a proxy; direct account traffic is disabled.`)
            }

            let slot
            if (raw.slot != null && raw.slot !== '') {
                slot = positiveInt(raw.slot, 0, `Account ${email} slot`)
                nextSlot = Math.max(nextSlot, slot)
            } else {
                slot = existing?.slot || ++nextSlot
            }
            const saveFingerprint = raw.saveFingerprint ?? {}
            upsertAccount.run(
                existing?.id ?? stableId('account', email),
                email,
                encryptAccountSecret(password),
                encryptAccountSecret(text(raw.totpSecret ?? raw.totp_secret)) || null,
                text(raw.recoveryEmail ?? raw.recovery_email),
                text(raw.geoLocale ?? raw.geo_locale, 'auto'),
                text(raw.langCode ?? raw.lang_code, 'en'),
                proxyId,
                status,
                slot,
                boolInt(saveFingerprint.mobile ?? raw.save_fingerprint_mobile ?? true),
                boolInt(saveFingerprint.desktop ?? raw.save_fingerprint_desktop ?? true)
            )
            if (existing) updated += 1
            else inserted += 1
        }

        db.exec('COMMIT')
        return {
            dbPath,
            inserted,
            updated,
            proxies: proxiesByLabel.size,
            total: bundle.accounts.length,
            skippedDeleted: skippedDeletedEmails.length,
            skippedDeletedEmails,
            reconciliation
        }
    } catch (error) {
        try {
            db.exec('ROLLBACK')
        } catch {}
        throw error
    } finally {
        db.close()
    }
}

export function listAccountRows(projectRoot) {
    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        return db
            .prepare(
                `
            SELECT a.slot, a.email, a.status, COALESCE(p.label, '') AS proxy,
                   COALESCE(p.account_capacity, 0) AS capacity
            FROM accounts a
            LEFT JOIN proxies p ON p.id = a.proxy_id
            ORDER BY COALESCE(a.slot, 2147483647), a.email
        `
            )
            .all()
    } finally {
        db.close()
    }
}

export function getAccountStoreStats(projectRoot) {
    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        return {
            dbPath,
            accounts: Number(db.prepare('SELECT COUNT(*) AS value FROM accounts').get().value),
            permanentlyDeleted: Number(db.prepare('SELECT COUNT(*) AS value FROM deleted_accounts').get().value),
            readyAccounts: Number(
                db.prepare("SELECT COUNT(*) AS value FROM accounts WHERE status IN ('ready', 'active')").get().value
            ),
            proxies: Number(
                db
                    .prepare(
                        'SELECT COUNT(*) AS value FROM proxies p WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.proxy_id = p.id)'
                    )
                    .get().value
            ),
            proxyRecords: Number(db.prepare('SELECT COUNT(*) AS value FROM proxies').get().value),
            unusedProxies: Number(
                db
                    .prepare(
                        'SELECT COUNT(*) AS value FROM proxies p WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.proxy_id = p.id)'
                    )
                    .get().value
            ),
            overloadedProxies: 0
        }
    } finally {
        db.close()
    }
}

export function setAccountStatus(projectRoot, email, status) {
    if (!['ready', 'disabled'].includes(status)) fail('Status command supports only ready or disabled.')
    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath)
    try {
        const result = db
            .prepare('UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER(?)')
            .run(status, email)
        if (!result.changes) fail(`Account not found: ${email}.`)
        return { email, status }
    } finally {
        db.close()
    }
}

export function deleteAccountRecords(projectRoot, emails) {
    const requestedEmails = [
        ...new Set((Array.isArray(emails) ? emails : [emails]).map(value => text(value).toLowerCase()))
    ].filter(Boolean)

    if (!requestedEmails.length) fail('Delete requires at least one account email.')
    if (requestedEmails.some(email => !email.includes('@'))) fail('Delete requires valid account email addresses.')

    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath)

    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')

        const placeholders = requestedEmails.map(() => '?').join(', ')
        const accounts = db
            .prepare(
                `SELECT id, email
                 FROM accounts
                 WHERE LOWER(email) IN (${placeholders})
                 ORDER BY LOWER(email)`
            )
            .all(...requestedEmails)

        const foundEmails = new Set(accounts.map(account => String(account.email).toLowerCase()))
        const missingEmails = requestedEmails.filter(email => !foundEmails.has(email))
        if (missingEmails.length) fail(`Account not found: ${missingEmails.join(', ')}.`)

        if (tableExists(db, 'account_jobs')) {
            const accountIds = accounts.map(account => account.id)
            const jobPlaceholders = accountIds.map(() => '?').join(', ')
            const activeJobs = Number(
                db
                    .prepare(
                        `SELECT COUNT(*) AS value
                         FROM account_jobs
                         WHERE account_id IN (${jobPlaceholders})
                           AND status IN ('pending', 'queued', 'running')`
                    )
                    .get(...accountIds).value
            )
            if (activeJobs) {
                fail(`Cannot delete account(s) while ${activeJobs} related queue job(s) are active.`)
            }
        }

        const accountIds = accounts.map(account => account.id)
        const deletePlaceholders = accountIds.map(() => '?').join(', ')
        const rememberDeletedAccount = db.prepare(
            `INSERT INTO deleted_accounts (email, deleted_at)
             VALUES (?, CURRENT_TIMESTAMP)
             ON CONFLICT(email) DO UPDATE SET deleted_at = excluded.deleted_at`
        )
        for (const account of accounts) rememberDeletedAccount.run(account.email)
        const result = db.prepare(`DELETE FROM accounts WHERE id IN (${deletePlaceholders})`).run(...accountIds)

        db.exec('COMMIT')
        return {
            dbPath,
            deleted: Number(result.changes ?? 0),
            emails: accounts.map(account => account.email)
        }
    } catch (error) {
        try {
            db.exec('ROLLBACK')
        } catch {}
        throw error
    } finally {
        db.close()
    }
}
