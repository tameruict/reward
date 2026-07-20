"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSession = loadSession;
exports.saveStorageState = saveStorageState;
exports.saveFingerprint = saveFingerprint;
exports.deleteSession = deleteSession;
exports.closeSessionStore = closeSessionStore;
const node_sqlite_1 = require("node:sqlite");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
let db = null;
function platformOf(isMobile) {
    return isMobile ? 'mobile' : 'desktop';
}
function getDb(sessionPath) {
    if (db)
        return db;
    const dir = node_path_1.default.resolve(process.cwd(), sessionPath);
    node_fs_1.default.mkdirSync(dir, { recursive: true });
    db = new node_sqlite_1.DatabaseSync(node_path_1.default.join(dir, 'sessions.db'));
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            email         TEXT NOT NULL,
            platform      TEXT NOT NULL,
            storage_state TEXT,
            fingerprint   TEXT,
            updated_at    INTEGER NOT NULL,
            PRIMARY KEY (email, platform)
        )
    `);
    return db;
}
function loadSession(sessionPath, email, isMobile, maxAgeMs) {
    const row = getDb(sessionPath)
        .prepare('SELECT storage_state, fingerprint, updated_at FROM sessions WHERE email = ? AND platform = ?')
        .get(email, platformOf(isMobile));
    if (!row)
        return null;
    if (maxAgeMs && Date.now() - row.updated_at > maxAgeMs) {
        return null;
    }
    return {
        storageState: row.storage_state ? JSON.parse(row.storage_state) : null,
        fingerprint: row.fingerprint ? JSON.parse(row.fingerprint) : null,
        updatedAt: row.updated_at
    };
}
function saveStorageState(sessionPath, email, isMobile, storageState) {
    getDb(sessionPath)
        .prepare(`INSERT INTO sessions (email, platform, storage_state, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(email, platform)
             DO UPDATE SET storage_state = excluded.storage_state, updated_at = excluded.updated_at`)
        .run(email, platformOf(isMobile), JSON.stringify(storageState), Date.now());
}
function saveFingerprint(sessionPath, email, isMobile, fingerprint) {
    getDb(sessionPath)
        .prepare(`INSERT INTO sessions (email, platform, fingerprint, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(email, platform)
             DO UPDATE SET fingerprint = excluded.fingerprint, updated_at = excluded.updated_at`)
        .run(email, platformOf(isMobile), JSON.stringify(fingerprint), Date.now());
}
// Unused
function deleteSession(sessionPath, email, isMobile) {
    getDb(sessionPath).prepare('DELETE FROM sessions WHERE email = ? AND platform = ?').run(email, platformOf(isMobile));
}
function closeSessionStore() {
    if (!db)
        return;
    try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        db.close();
    }
    catch { }
    db = null;
}
//# sourceMappingURL=SessionStore.js.map