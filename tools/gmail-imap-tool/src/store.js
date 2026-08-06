'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { safeStorage } = require('electron')
const { normalizeProxy, maskProxy } = require('./proxy')

let filePath = null
/** email(lowercased) -> { appPassword, proxy?, updatedAt } */
let accounts = {}

function init(userDataDir) {
    filePath = path.join(userDataDir, 'accounts.json')
    load()
}

function load() {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        if (raw?.version === 2 && raw.accounts && typeof raw.accounts === 'object') {
            accounts = raw.accounts
            return
        }

        // Migrate the v1 shape: { "email": { v, data } }.
        accounts = {}
        if (raw && typeof raw === 'object') {
            for (const [email, appPassword] of Object.entries(raw)) {
                if (appPassword?.data) {
                    accounts[email.toLowerCase()] = { appPassword, proxy: null, updatedAt: null }
                }
            }
        }
        persist()
    } catch {
        accounts = {}
    }
}

function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ version: 2, accounts }, null, 2), { mode: 0o600 })
}

function encrypt(text) {
    try {
        if (safeStorage.isEncryptionAvailable()) {
            return { v: 'enc', data: safeStorage.encryptString(text).toString('base64') }
        }
    } catch {
        /* fall through to plain */
    }
    return { v: 'plain', data: Buffer.from(text, 'utf8').toString('base64') }
}

function decrypt(entry) {
    if (!entry || !entry.data) return null
    const buf = Buffer.from(entry.data, 'base64')
    try {
        if (entry.v === 'enc') return safeStorage.decryptString(buf)
    } catch {
        return null
    }
    return buf.toString('utf8')
}

function cleanEmail(email) {
    return String(email || '').trim().toLowerCase()
}

function saveAccount({ email, appPassword, proxy } = {}) {
    const key = cleanEmail(email)
    if (!key || !key.includes('@')) return { ok: false, error: 'Email không hợp lệ.' }

    const existing = accounts[key]
    const cleanPassword = String(appPassword || '').replace(/\s+/g, '')
    if (!existing && !cleanPassword) {
        return { ok: false, error: 'Account mới cần App Password.' }
    }

    let normalizedProxy
    try {
        normalizedProxy = proxy === undefined ? undefined : normalizeProxy(proxy)
    } catch (err) {
        return { ok: false, error: err.message }
    }

    accounts[key] = {
        appPassword: cleanPassword ? encrypt(cleanPassword) : existing.appPassword,
        proxy: normalizedProxy === undefined ? existing?.proxy || null : normalizedProxy ? encrypt(normalizedProxy) : null,
        updatedAt: new Date().toISOString()
    }
    persist()
    return { ok: true, account: publicAccount(key, accounts[key]) }
}

function save(email, appPassword, proxy) {
    return saveAccount({ email, appPassword, proxy })
}

function getAccount(email) {
    const key = cleanEmail(email)
    const entry = accounts[key]
    if (!entry) return null
    return {
        email: key,
        appPassword: decrypt(entry.appPassword),
        proxy: decrypt(entry.proxy)
    }
}

function get(email) {
    return getAccount(email)?.appPassword || null
}

function publicAccount(email, entry) {
    const proxy = decrypt(entry.proxy)
    return {
        email,
        encrypted: entry.appPassword?.v === 'enc',
        hasProxy: Boolean(proxy),
        proxyDisplay: proxy ? maskProxy(proxy) : '',
        updatedAt: entry.updatedAt || null
    }
}

function list() {
    return Object.keys(accounts)
        .sort()
        .map(email => publicAccount(email, accounts[email]))
}

function remove(email) {
    const key = cleanEmail(email)
    if (key) delete accounts[key]
    persist()
    return { ok: true }
}

function clearProxy(email) {
    const key = cleanEmail(email)
    if (!accounts[key]) return { ok: false, error: 'Không tìm thấy account.' }
    accounts[key].proxy = null
    accounts[key].updatedAt = new Date().toISOString()
    persist()
    return { ok: true }
}

module.exports = { init, save, saveAccount, get, getAccount, list, remove, clearProxy }
