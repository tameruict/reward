import crypto from 'node:crypto'
import net from 'node:net'
import { DatabaseSync } from 'node:sqlite'

import { ensureAccountsDatabase, resolveAccountsDbPath } from '../utils.js'
import { encryptAccountSecret } from './secrets.js'
import { formatProxyUrl, parseProxyParts, proxyIdentityKey } from './proxy.js'

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
    if (bundle.accounts != null && !Array.isArray(bundle.accounts)) fail('accounts must be an array.')
    if (bundle.proxies != null && !Array.isArray(bundle.proxies)) fail('proxies must be an array.')
    const accounts = bundle.accounts ?? []
    const proxies = bundle.proxies ?? []
    if (!accounts.length && !proxies.length) fail('Import file must contain accounts or proxies.')
    return {
        proxies,
        accounts,
        autoAssignStoredProxies: Boolean(bundle.autoAssignStoredProxies),
        allowDirectAccounts: Boolean(bundle.allowDirectAccounts)
    }
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

export function importAccountBundle(projectRoot, input, options = {}) {
    const normalizedBundle = normalizeBundle(input)
    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath)
    const restoreDeleted = Boolean(options.restoreDeleted)

    const deletedEmails = new Set(
        db
            .prepare('SELECT LOWER(email) AS email FROM deleted_accounts')
            .all()
            .map(row => row.email)
    )
    const skippedDeletedEmails = normalizedBundle.accounts
        .map(account => text(account?.email).toLowerCase())
        .filter(email => !restoreDeleted && deletedEmails.has(email))
    const restoredDeletedEmails = normalizedBundle.accounts
        .map(account => text(account?.email).toLowerCase())
        .filter(email => restoreDeleted && deletedEmails.has(email))
    const bundle = {
        ...normalizedBundle,
        accounts: normalizedBundle.accounts.filter(
            account => restoreDeleted || !deletedEmails.has(text(account?.email).toLowerCase())
        )
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
        if (rawAccount?.useProxy !== false && rawAccount?.proxy && !rawAccount.proxyLabel && !rawAccount.proxy_label) {
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
        assertNoActiveJobs(db)
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

        if (restoreDeleted && restoredDeletedEmails.length) {
            const restoreDeletedAccount = db.prepare('DELETE FROM deleted_accounts WHERE LOWER(email) = LOWER(?)')
            for (const email of new Set(restoredDeletedEmails)) restoreDeletedAccount.run(email)
        }

        const autoProxyCandidates = bundle.autoAssignStoredProxies
            ? db
                  .prepare(
                      `
                      SELECT p.id, p.label, COUNT(a.id) AS account_count
                      FROM proxies p
                      LEFT JOIN accounts a ON a.proxy_id = p.id
                      WHERE p.status = 'active'
                      GROUP BY p.id, p.label
                      ORDER BY account_count, LOWER(p.label)
                  `
                  )
                  .all()
                  .map(proxy => ({ ...proxy, account_count: Number(proxy.account_count) }))
            : []

        const nextAutoProxy = () => {
            if (!autoProxyCandidates.length) {
                fail(
                    'Pipe-delimited EMAIL|PASSWORD rows require at least one active proxy already stored in the database.'
                )
            }
            autoProxyCandidates.sort(
                (a, b) =>
                    a.account_count - b.account_count ||
                    String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' })
            )
            const selected = autoProxyCandidates[0]
            selected.account_count += 1
            return selected.id
        }

        let nextSlot = Number(db.prepare('SELECT COALESCE(MAX(slot), 0) AS value FROM accounts').get().value)
        const findAccount = db.prepare(
            'SELECT id, password, slot, proxy_id, use_proxy FROM accounts WHERE LOWER(email) = LOWER(?)'
        )
        const upsertAccount = db.prepare(`
            INSERT INTO accounts (
                id, email, password, totp_secret, recovery_email, geo_locale, lang_code,
                proxy_id, use_proxy, status, slot, save_fingerprint_mobile, save_fingerprint_desktop, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(email) DO UPDATE SET
                password = excluded.password,
                totp_secret = excluded.totp_secret,
                recovery_email = excluded.recovery_email,
                geo_locale = excluded.geo_locale,
                lang_code = excluded.lang_code,
                proxy_id = excluded.proxy_id,
                use_proxy = excluded.use_proxy,
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

            const useProxy = raw.useProxy !== false
            if (!useProxy && !bundle.allowDirectAccounts) {
                fail(`Account ${email} requests direct mode, but direct account traffic was not explicitly enabled.`)
            }

            const proxyLabel = text(raw.proxyLabel ?? raw.proxy_label)
            let proxyId = null
            if (!useProxy) {
                proxyId = null
            } else if (proxyLabel) {
                const proxy = proxiesByLabel.get(proxyLabel.toLowerCase())
                const stored = proxy ? { id: proxy.id } : findProxyByLabel.get(proxyLabel)
                if (!stored) fail(`Account ${email} references unknown proxyLabel: ${proxyLabel}.`)
                proxyId = stored.id
            } else if (bundle.autoAssignStoredProxies) {
                proxyId = existing?.proxy_id || nextAutoProxy()
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
                useProxy ? 1 : 0,
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
            restoredDeleted: new Set(restoredDeletedEmails).size,
            restoredDeletedEmails: [...new Set(restoredDeletedEmails)],
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
            SELECT a.slot, a.email, a.status,
                   CASE WHEN a.use_proxy = 0 THEN 'DIRECT' ELSE COALESCE(p.label, '') END AS proxy,
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

function safeProxyRow(row) {
    const parsed = parseProxyParts({ url: row.url, port: row.port })
    return {
        id: row.id,
        label: row.label,
        status: row.status,
        url: parsed.host ? `${parsed.protocol}://${parsed.host}` : null,
        port: Number(row.port),
        proxyHttp: Boolean(row.proxy_http),
        hasCredentials: Boolean(row.username || row.password),
        accountCapacity: Number(row.account_capacity || 1),
        accountCount: Number(row.account_count || 0),
        egressIp: row.egress_ip || null,
        cooldownSeconds: Number(row.cooldown_seconds || 0)
    }
}

/**
 * Returns all stored accounts, including disabled accounts, without secrets.
 * This is intentionally separate from loadAccounts(), which only returns
 * accounts eligible for a bot run.
 */
export function listManagedAccountRows(projectRoot) {
    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        return db
            .prepare(
                `
                SELECT a.id, a.slot, a.email, a.status, a.use_proxy,
                       p.id AS proxy_id, p.label AS proxy_label, p.status AS proxy_status,
                       p.url AS proxy_url, p.port AS proxy_port, p.username AS proxy_username,
                       p.password AS proxy_password, p.account_capacity,
                       p.egress_ip, p.cooldown_seconds
                FROM accounts a
                LEFT JOIN proxies p ON p.id = a.proxy_id
                ORDER BY COALESCE(a.slot, 2147483647), LOWER(a.email)
                `
            )
            .all()
            .map(row => {
                const parsed = row.proxy_id ? parseProxyParts({ url: row.proxy_url, port: row.proxy_port }) : null
                return {
                    id: row.id,
                    index: row.slot == null ? null : Number(row.slot),
                    email: row.email,
                    emailKey: row.email,
                    status: row.status,
                    useProxy: Boolean(row.use_proxy),
                    proxy: row.proxy_id
                        ? {
                              id: row.proxy_id,
                              label: row.proxy_label,
                              status: row.proxy_status,
                              url: parsed?.host ? `${parsed.protocol}://${parsed.host}` : null,
                              port: Number(row.proxy_port),
                              hasCredentials: Boolean(row.proxy_username || row.proxy_password),
                              accountCapacity: Number(row.account_capacity || 1),
                              egressIp: row.egress_ip || null,
                              cooldownSeconds: Number(row.cooldown_seconds || 0)
                          }
                        : null
                }
            })
    } finally {
        db.close()
    }
}

/** Returns proxy records and usage counts without proxy passwords. */
export function listProxyRows(projectRoot) {
    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        return db
            .prepare(
                `
                SELECT p.*, COUNT(a.id) AS account_count
                FROM proxies p
                LEFT JOIN accounts a ON a.proxy_id = p.id
                GROUP BY p.id
                ORDER BY LOWER(p.label)
                `
            )
            .all()
            .map(safeProxyRow)
    } finally {
        db.close()
    }
}

export function setProxyStatus(projectRoot, proxyId, status) {
    const normalizedId = text(proxyId)
    const normalizedStatus = text(status).toLowerCase()
    if (!normalizedId) fail('A proxy id is required.')
    if (!PROXY_STATUSES.has(normalizedStatus)) fail(`Invalid proxy status: ${normalizedStatus}.`)

    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath)
    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')
        assertNoActiveJobs(db)
        const proxy = db.prepare('SELECT id, label FROM proxies WHERE id = ?').get(normalizedId)
        if (!proxy) fail(`Proxy not found: ${normalizedId}.`)
        db.prepare('UPDATE proxies SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(normalizedStatus, normalizedId)
        db.exec('COMMIT')
        return { id: proxy.id, label: proxy.label, status: normalizedStatus }
    } catch (error) {
        try { db.exec('ROLLBACK') } catch {}
        throw error
    } finally {
        db.close()
    }
}

export function deleteProxyRecord(projectRoot, proxyId) {
    const normalizedId = text(proxyId)
    if (!normalizedId) fail('A proxy id is required.')

    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath)
    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')
        assertNoActiveJobs(db)
        const proxy = db.prepare('SELECT id, label FROM proxies WHERE id = ?').get(normalizedId)
        if (!proxy) fail(`Proxy not found: ${normalizedId}.`)
        const usage = Number(db.prepare('SELECT COUNT(*) AS value FROM accounts WHERE proxy_id = ?').get(normalizedId).value)
        if (usage) fail(`Cannot delete proxy ${proxy.label} while ${usage} account(s) are assigned. Detach or reassign them first.`)
        db.prepare('DELETE FROM proxies WHERE id = ?').run(normalizedId)
        db.exec('COMMIT')
        return { id: proxy.id, label: proxy.label, deleted: true }
    } catch (error) {
        try { db.exec('ROLLBACK') } catch {}
        throw error
    } finally {
        db.close()
    }
}

/**
 * Assigns an existing proxy to an account. Passing useProxy=false explicitly
 * detaches the proxy and enables direct mode for that account.
 */
export function assignAccountProxy(projectRoot, email, input = {}) {
    const normalizedEmail = text(email).toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes('@')) fail('A valid account email is required.')
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Proxy assignment must be a JSON object.')

    const useProxy = input.useProxy !== false
    const proxyId = text(input.proxyId ?? input.proxy_id)
    const proxyLabel = text(input.proxyLabel ?? input.proxy_label)
    if (proxyId && proxyLabel) fail('Provide proxyId or proxyLabel, not both.')
    if (useProxy && !proxyId && !proxyLabel) fail('A proxyId or proxyLabel is required when useProxy is true.')

    const dbPath = resolveAccountsDbPath(projectRoot)
    ensureAccountsDatabase(dbPath)
    const db = new DatabaseSync(dbPath)
    let accountId = null
    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')
        assertNoActiveJobs(db)

        const account = db.prepare('SELECT id, email FROM accounts WHERE LOWER(email) = LOWER(?)').get(normalizedEmail)
        if (!account) fail(`Account not found: ${normalizedEmail}.`)
        accountId = account.id

        let selectedProxyId = null
        if (useProxy) {
            const proxy = proxyId
                ? db.prepare('SELECT id, label, status FROM proxies WHERE id = ?').get(proxyId)
                : db.prepare('SELECT id, label, status FROM proxies WHERE LOWER(label) = LOWER(?)').get(proxyLabel)
            if (!proxy) fail(`Proxy not found: ${proxyId || proxyLabel}.`)
            if (proxy.status !== 'active') fail(`Proxy ${proxy.label} is not active.`)
            selectedProxyId = proxy.id
        }

        db.prepare('UPDATE accounts SET proxy_id = ?, use_proxy = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
            selectedProxyId,
            useProxy ? 1 : 0,
            account.id
        )
        db.exec('COMMIT')
    } catch (error) {
        try {
            db.exec('ROLLBACK')
        } catch {}
        throw error
    } finally {
        db.close()
    }

    return listManagedAccountRows(projectRoot).find(row => row.id === accountId)
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
                db
                    .prepare(
                        `
                        SELECT COUNT(*) AS value
                        FROM accounts a
                        LEFT JOIN proxies p ON p.id = a.proxy_id
                        WHERE a.status IN ('ready', 'active')
                          AND (
                              (a.use_proxy = 0 AND a.proxy_id IS NULL)
                              OR (a.use_proxy = 1 AND a.proxy_id IS NOT NULL AND p.status = 'active')
                          )
                    `
                    )
                    .get().value
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
        db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')
        assertNoActiveJobs(db)
        const result = db
            .prepare('UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER(?)')
            .run(status, email)
        if (!result.changes) fail(`Account not found: ${email}.`)
        db.exec('COMMIT')
        return { email, status }
    } catch (error) {
        try {
            db.exec('ROLLBACK')
        } catch {}
        throw error
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
