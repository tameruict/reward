"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAccountsDbPath = resolveAccountsDbPath;
exports.ensureAccountsDatabase = ensureAccountsDatabase;
exports.loadAccountsFromDatabase = loadAccountsFromDatabase;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_sqlite_1 = require("node:sqlite");
const AccountSecrets_1 = require("./AccountSecrets");
const DEFAULT_DB_PATH = path_1.default.join('data', 'accounts.db');
function resolveProjectRelative(projectRoot, maybeRelativePath) {
    return path_1.default.isAbsolute(maybeRelativePath) ? maybeRelativePath : path_1.default.join(projectRoot, maybeRelativePath);
}
function resolveAccountsDbPath(projectRoot) {
    const configured = process.env.ACCOUNTS_DB_PATH?.trim();
    return resolveProjectRelative(projectRoot, configured || DEFAULT_DB_PATH);
}
function ensureAccountsDatabase(dbPath) {
    fs_1.default.mkdirSync(path_1.default.dirname(dbPath), { recursive: true });
    const db = new node_sqlite_1.DatabaseSync(dbPath);
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
        `);
        const proxyColumns = new Set(db.prepare('PRAGMA table_info(proxies)').all().map(row => row.name));
        if (!proxyColumns.has('account_capacity')) {
            db.exec('ALTER TABLE proxies ADD COLUMN account_capacity INTEGER NOT NULL DEFAULT 1');
        }
        if (!proxyColumns.has('identity_key')) {
            db.exec('ALTER TABLE proxies ADD COLUMN identity_key TEXT');
        }
        if (!proxyColumns.has('egress_ip')) {
            db.exec('ALTER TABLE proxies ADD COLUMN egress_ip TEXT');
        }
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_proxies_identity_key ON proxies(identity_key)');
    }
    finally {
        db.close();
    }
}
function loadAccountsFromDatabase(projectRoot) {
    const dbPath = resolveAccountsDbPath(projectRoot);
    if (!fs_1.default.existsSync(dbPath))
        return null;
    ensureAccountsDatabase(dbPath);
    const db = new node_sqlite_1.DatabaseSync(dbPath, { readOnly: true });
    try {
        const rows = db
            .prepare(`
                SELECT
                    a.id AS account_id,
                    a.email,
                    a.password,
                    a.totp_secret,
                    a.recovery_email,
                    a.geo_locale,
                    a.lang_code,
                    a.proxy_id,
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
                `)
            .all();
        return rows.map(row => ({
            accountId: row.account_id,
            proxyId: row.proxy_id,
            status: row.account_status,
            slot: row.slot ?? undefined,
            email: row.email,
            password: (0, AccountSecrets_1.decryptAccountSecret)(row.password, `password for ${row.email}`),
            totpSecret: row.totp_secret
                ? (0, AccountSecrets_1.decryptAccountSecret)(row.totp_secret, `TOTP secret for ${row.email}`)
                : undefined,
            recoveryEmail: row.recovery_email ?? '',
            geoLocale: row.geo_locale ?? 'auto',
            langCode: row.lang_code ?? 'en',
            proxy: {
                proxyHttp: Boolean(row.proxy_http),
                url: row.proxy_url ?? '',
                port: row.proxy_port ?? 0,
                username: row.proxy_username ?? '',
                password: (0, AccountSecrets_1.decryptAccountSecret)(row.proxy_password, `proxy password for ${row.email}`)
            },
            saveFingerprint: {
                mobile: Boolean(row.save_fingerprint_mobile),
                desktop: Boolean(row.save_fingerprint_desktop)
            }
        }));
    }
    finally {
        db.close();
    }
}
//# sourceMappingURL=AccountDatabase.js.map