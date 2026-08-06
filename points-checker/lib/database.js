"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function resolveDatabasePath() {
  const configured = String(process.env.ACCOUNTS_DB_PATH || "../data/accounts.db").trim();
  return path.isAbsolute(configured) ? configured : path.resolve(__dirname, "..", configured);
}

class PointsDatabase {
  constructor(dbPath = resolveDatabasePath()) {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Accounts database not found: ${dbPath}`);
    }

    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;");
    this.ensureSchema();
    this.recoverInterruptedRuns();
  }

  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS point_check_runs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'manual',
        status TEXT NOT NULL DEFAULT 'queued',
        total_accounts INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        cancelled_count INTEGER NOT NULL DEFAULT 0,
        total_points INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS point_checks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES point_check_runs(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        points INTEGER,
        previous_points INTEGER,
        point_delta INTEGER,
        lifetime_points INTEGER,
        lifetime_points_redeemed INTEGER,
        country TEXT,
        duration_ms INTEGER,
        error_code TEXT,
        error_message TEXT,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(run_id, account_id)
      );

      CREATE INDEX IF NOT EXISTS idx_point_checks_run ON point_checks(run_id, status);
      CREATE INDEX IF NOT EXISTS idx_point_checks_account ON point_checks(account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_point_runs_created ON point_check_runs(created_at DESC);
    `);
  }

  recoverInterruptedRuns() {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE point_checks
      SET status = 'error', error_code = 'server_restarted',
          error_message = 'Dashboard restarted during this check', finished_at = ?
      WHERE status = 'running'
    `).run(now);
    this.db.prepare(`
      UPDATE point_checks
      SET status = 'cancelled', error_code = 'server_restarted',
          error_message = 'Dashboard restarted before this check began', finished_at = ?
      WHERE status = 'pending'
        AND run_id IN (SELECT id FROM point_check_runs WHERE status IN ('queued', 'running', 'stopping'))
    `).run(now);
    this.db.prepare(`
      UPDATE point_check_runs
      SET status = 'interrupted', finished_at = ?
      WHERE status IN ('queued', 'running', 'stopping')
    `).run(now);
  }

  listAccounts() {
    return this.db.prepare(`
      WITH latest AS (
        SELECT pc.*, ROW_NUMBER() OVER (
          PARTITION BY pc.account_id
          ORDER BY COALESCE(pc.finished_at, pc.started_at, pc.created_at) DESC, pc.rowid DESC
        ) AS row_num
        FROM point_checks pc
      )
      SELECT
        a.id, a.slot, a.email, a.status,
        p.id AS proxy_id, p.label AS proxy_label, p.status AS proxy_status,
        p.max_concurrency AS route_concurrency,
        COALESCE(NULLIF(TRIM(p.egress_ip), ''), NULLIF(TRIM(p.identity_key), ''), p.id, 'direct:default') AS lock_key,
        latest.status AS check_status,
        latest.points, latest.point_delta, latest.country,
        latest.duration_ms, latest.error_code, latest.error_message,
        latest.finished_at AS checked_at
      FROM accounts a
      LEFT JOIN proxies p ON p.id = a.proxy_id
      LEFT JOIN latest ON latest.account_id = a.id AND latest.row_num = 1
      ORDER BY COALESCE(a.slot, 2147483647), a.email
    `).all().map(row => ({
      id: row.id,
      slot: row.slot,
      email: row.email,
      status: row.status,
      proxyId: row.proxy_id,
      proxyLabel: row.proxy_label || "Direct",
      proxyStatus: row.proxy_status,
      routeConcurrency: Math.max(1, Number(row.route_concurrency) || 1),
      lockKey: row.proxy_id ? `proxy:${row.lock_key}` : "direct:default",
      lastCheck: row.check_status ? {
        status: row.check_status,
        points: row.points,
        delta: row.point_delta,
        country: row.country,
        durationMs: row.duration_ms,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        checkedAt: row.checked_at,
      } : null,
    }));
  }

  activeAccounts(accountIds) {
    const all = this.listAccounts().filter(account =>
      ["ready", "active"].includes(account.status) &&
      account.proxyId && account.proxyStatus === "active"
    );
    if (!accountIds || !accountIds.length) return all;
    const wanted = new Set(accountIds.map(String));
    const selected = all.filter(account => wanted.has(account.id));
    if (selected.length !== wanted.size) {
      throw Object.assign(new Error("One or more accounts are unavailable or do not have an active proxy."), { code: "BAD_REQUEST" });
    }
    return selected;
  }

  createRun(accounts, source = "manual") {
    const runId = crypto.randomUUID();
    const insertRun = this.db.prepare(`
      INSERT INTO point_check_runs (id, source, status, total_accounts)
      VALUES (?, ?, 'queued', ?)
    `);
    const insertCheck = this.db.prepare(`
      INSERT INTO point_checks (id, run_id, account_id, proxy_id)
      VALUES (?, ?, ?, ?)
    `);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      insertRun.run(runId, source, accounts.length);
      for (const account of accounts) {
        insertCheck.run(crypto.randomUUID(), runId, account.id, account.proxyId);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getRun(runId);
  }

  markRunStarted(runId) {
    this.db.prepare(`UPDATE point_check_runs SET status = 'running', started_at = ? WHERE id = ?`).run(new Date().toISOString(), runId);
  }

  markCheckStarted(runId, accountId) {
    this.db.prepare(`
      UPDATE point_checks SET status = 'running', started_at = ?, error_code = NULL, error_message = NULL
      WHERE run_id = ? AND account_id = ?
    `).run(new Date().toISOString(), runId, accountId);
  }

  previousPoints(accountId, currentRunId) {
    const row = this.db.prepare(`
      SELECT points FROM point_checks
      WHERE account_id = ? AND run_id <> ? AND status = 'success' AND points IS NOT NULL
      ORDER BY COALESCE(finished_at, started_at, created_at) DESC, rowid DESC LIMIT 1
    `).get(accountId, currentRunId);
    return row ? Number(row.points) : null;
  }

  completeCheck(runId, accountId, result, durationMs) {
    const previous = this.previousPoints(accountId, runId);
    const delta = previous == null ? null : Number(result.points) - previous;
    this.db.prepare(`
      UPDATE point_checks
      SET status = 'success', points = ?, previous_points = ?, point_delta = ?,
          lifetime_points = ?, lifetime_points_redeemed = ?, country = ?, duration_ms = ?,
          finished_at = ?, error_code = NULL, error_message = NULL
      WHERE run_id = ? AND account_id = ?
    `).run(
      result.points, previous, delta, result.lifetimePoints, result.lifetimePointsRedeemed,
      result.country, durationMs, result.checkedAt || new Date().toISOString(), runId, accountId,
    );
  }

  failCheck(runId, accountId, error, durationMs) {
    this.db.prepare(`
      UPDATE point_checks
      SET status = 'error', duration_ms = ?, error_code = ?, error_message = ?, finished_at = ?
      WHERE run_id = ? AND account_id = ?
    `).run(durationMs, error.code || "error", String(error.message || error).slice(0, 800), new Date().toISOString(), runId, accountId);
  }

  cancelPending(runId, message = "Cancelled by user") {
    this.db.prepare(`
      UPDATE point_checks SET status = 'cancelled', error_code = 'cancelled', error_message = ?, finished_at = ?
      WHERE run_id = ? AND status = 'pending'
    `).run(message, new Date().toISOString(), runId);
    this.db.prepare(`UPDATE point_check_runs SET status = 'stopping' WHERE id = ? AND status IN ('queued', 'running')`).run(runId);
  }

  finishRun(runId) {
    const stats = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
        SUM(CASE WHEN status = 'success' THEN COALESCE(points, 0) ELSE 0 END) AS total_points
      FROM point_checks WHERE run_id = ?
    `).get(runId);
    const current = this.db.prepare("SELECT status FROM point_check_runs WHERE id = ?").get(runId);
    const status = current?.status === "stopping" ? "cancelled" : Number(stats.failed_count) > 0 ? "completed_with_errors" : "completed";
    this.db.prepare(`
      UPDATE point_check_runs SET status = ?, success_count = ?, failed_count = ?, cancelled_count = ?,
          total_points = ?, finished_at = ? WHERE id = ?
    `).run(status, stats.success_count || 0, stats.failed_count || 0, stats.cancelled_count || 0, stats.total_points || 0, new Date().toISOString(), runId);
    return this.getRun(runId);
  }

  getRun(runId) {
    const run = this.db.prepare(`
      SELECT id, source, status, total_accounts AS totalAccounts, success_count AS successCount,
             failed_count AS failedCount, cancelled_count AS cancelledCount, total_points AS totalPoints,
             started_at AS startedAt, finished_at AS finishedAt, created_at AS createdAt
      FROM point_check_runs WHERE id = ?
    `).get(runId);
    if (!run) return null;
    run.checks = this.db.prepare(`
      SELECT pc.account_id AS accountId, a.email, COALESCE(p.label, 'Direct') AS proxyLabel,
             pc.status, pc.points, pc.previous_points AS previousPoints, pc.point_delta AS delta,
             pc.country, pc.duration_ms AS durationMs, pc.error_code AS errorCode,
             pc.error_message AS errorMessage, pc.started_at AS startedAt, pc.finished_at AS finishedAt
      FROM point_checks pc JOIN accounts a ON a.id = pc.account_id
      LEFT JOIN proxies p ON p.id = pc.proxy_id
      WHERE pc.run_id = ? ORDER BY COALESCE(a.slot, 2147483647), a.email
    `).all(runId);
    return run;
  }

  listRuns(limit = 30) {
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return this.db.prepare(`
      SELECT id, source, status, total_accounts AS totalAccounts, success_count AS successCount,
             failed_count AS failedCount, cancelled_count AS cancelledCount, total_points AS totalPoints,
             started_at AS startedAt, finished_at AS finishedAt, created_at AS createdAt
      FROM point_check_runs ORDER BY created_at DESC LIMIT ?
    `).all(safeLimit);
  }

  history(accountId, limit = 60) {
    const rows = this.db.prepare(`
      SELECT points, previous_points AS previousPoints, point_delta AS delta, country,
             duration_ms AS durationMs, finished_at AS checkedAt
      FROM point_checks WHERE account_id = ? AND status = 'success'
      ORDER BY COALESCE(finished_at, started_at, created_at) DESC, rowid DESC LIMIT ?
    `).all(accountId, Math.min(Math.max(Number(limit) || 60, 1), 365));
    return rows.reverse();
  }

  summary() {
    const accounts = this.listAccounts();
    const active = accounts.filter(a => ["ready", "active"].includes(a.status));
    const checked = active.filter(a => a.lastCheck?.status === "success");
    // A suspended/locked account is unusable, not a transient failure — count it
    // separately so "failed" reflects only checks worth retrying.
    const isUnusable = check => check?.status === "error" && ["suspended", "locked"].includes(check.errorCode);
    const suspended = active.filter(a => isUnusable(a.lastCheck));
    const failed = active.filter(a => a.lastCheck?.status === "error" && !isUnusable(a.lastCheck));
    const latestRun = this.listRuns(1)[0] || null;
    return {
      accounts: active.length,
      checked: checked.length,
      failed: failed.length,
      suspended: suspended.length,
      totalPoints: checked.reduce((sum, account) => sum + Number(account.lastCheck.points || 0), 0),
      proxies: new Set(active.map(account => account.proxyId).filter(Boolean)).size,
      latestRun,
      databasePath: this.dbPath,
    };
  }

  close() {
    this.db.exec("PRAGMA wal_checkpoint(PASSIVE)");
    this.db.close();
  }
}

module.exports = { PointsDatabase, PROJECT_ROOT, resolveDatabasePath };
