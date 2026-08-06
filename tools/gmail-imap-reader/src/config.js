import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DEFAULTS = { host: 'imap.gmail.com', port: 993 }

/** Load a local .env file (Node >=20.6 built-in) if it exists. Never throws. */
export function loadDotEnv() {
    const envPath = path.join(ROOT, '.env')
    if (!fs.existsSync(envPath)) return
    try {
        process.loadEnvFile(envPath)
    } catch {
        // ignore malformed .env — flags / real env vars still work
    }
}

/** Read accounts.json (array, or { accounts: [...] }). Returns [] if missing. */
export function loadAccountsFile() {
    const p = path.join(ROOT, 'accounts.json')
    if (!fs.existsSync(p)) return []
    let raw
    try {
        raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch (e) {
        throw new Error(`accounts.json không hợp lệ (JSON lỗi): ${e.message}`)
    }
    const list = Array.isArray(raw) ? raw : raw?.accounts
    return Array.isArray(list) ? list : []
}

/** Gmail app passwords are shown as "abcd efgh ijkl mnop" — spaces must be stripped. */
function normalizePass(pass) {
    return typeof pass === 'string' ? pass.replace(/\s+/g, '') : pass
}

/**
 * Resolve IMAP credentials from (in priority order):
 *   1. --user + --pass flags
 *   2. accounts.json, selected by --account <label> or --user <email>
 *      (or the single entry if that's all there is and no env user is set)
 *   3. .env / environment: GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_HOST, GMAIL_PORT
 */
export function resolveCredentials(flags = {}) {
    loadDotEnv()
    const accounts = loadAccountsFile()

    // 1. Fully specified on the command line.
    if (flags.user && flags.pass) {
        return {
            user: flags.user,
            pass: normalizePass(flags.pass),
            host: flags.host || DEFAULTS.host,
            port: Number(flags.port) || DEFAULTS.port,
            label: flags.user
        }
    }

    // 2. Pick from accounts.json.
    let picked = null
    if (flags.account) {
        picked = accounts.find(a => String(a.label || '').toLowerCase() === String(flags.account).toLowerCase())
        if (!picked) throw new Error(`Không tìm thấy account nhãn "${flags.account}" trong accounts.json`)
    } else if (flags.user) {
        picked = accounts.find(a => String(a.user || '').toLowerCase() === String(flags.user).toLowerCase())
    } else if (accounts.length === 1 && !process.env.GMAIL_USER) {
        picked = accounts[0]
    }

    if (picked) {
        const pass = normalizePass(picked.appPassword || picked.pass)
        if (!pass) throw new Error(`Account "${picked.label || picked.user}" thiếu "appPassword" trong accounts.json`)
        return {
            user: picked.user,
            pass,
            host: picked.host || flags.host || DEFAULTS.host,
            port: Number(picked.port || flags.port) || DEFAULTS.port,
            label: picked.label || picked.user
        }
    }

    // 3. Environment / .env.
    const user = flags.user || process.env.GMAIL_USER
    const pass = normalizePass(flags.pass || process.env.GMAIL_APP_PASSWORD)
    if (user && pass) {
        return {
            user,
            pass,
            host: flags.host || process.env.GMAIL_HOST || DEFAULTS.host,
            port: Number(flags.port || process.env.GMAIL_PORT) || DEFAULTS.port,
            label: user
        }
    }

    throw new Error(
        'Chưa có thông tin đăng nhập.\n' +
            '  → Tạo file .env (GMAIL_USER + GMAIL_APP_PASSWORD), hoặc\n' +
            '  → Tạo accounts.json rồi chọn bằng --account <label>, hoặc\n' +
            '  → Truyền trực tiếp: --user you@gmail.com --pass "app password"'
    )
}

/** List configured accounts (for the `accounts` command), passwords masked. */
export function listConfiguredAccounts() {
    loadDotEnv()
    const out = []
    for (const a of loadAccountsFile()) {
        out.push({ source: 'accounts.json', label: a.label || a.user, user: a.user, hasPass: Boolean(a.appPassword || a.pass) })
    }
    if (process.env.GMAIL_USER) {
        out.push({ source: '.env', label: process.env.GMAIL_USER, user: process.env.GMAIL_USER, hasPass: Boolean(process.env.GMAIL_APP_PASSWORD) })
    }
    return out
}
