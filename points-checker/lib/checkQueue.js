"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const { PROJECT_ROOT } = require("./database");

const RESULT_PREFIX = "POINT_CHECK_RESULT=";
const ERROR_PREFIX = "POINT_CHECK_ERROR=";

function cleanLine(line) {
  return String(line || "").replace(/[\r\n]+/g, " ").slice(0, 700);
}

class CheckQueue {
  constructor(database, eventHub) {
    this.database = database;
    this.eventHub = eventHub;
    const configuredConcurrency = String(process.env.MAX_CONCURRENCY || "auto").trim().toLowerCase();
    this.maxConcurrency = configuredConcurrency === "auto" || configuredConcurrency === ""
      ? null
      : Math.min(Math.max(Number(configuredConcurrency) || 1, 1), 100);
    this.timeoutMs = Math.min(Math.max(Number(process.env.CHECK_TIMEOUT_MS) || 180000, 30000), 900000);
    this.activeRun = null;
  }

  start(accountIds, source = "manual") {
    if (this.activeRun) {
      throw Object.assign(new Error("A point-check run is already active."), { code: "RUN_ACTIVE" });
    }
    const accounts = this.database.activeAccounts(accountIds);
    if (!accounts.length) {
      throw Object.assign(new Error("No active accounts with an active proxy are available."), { code: "NO_ACCOUNTS" });
    }

    const run = this.database.createRun(accounts, source);
    const proxyRoutes = new Set(accounts.map(account => account.lockKey)).size;
    this.activeRun = {
      id: run.id,
      pending: [...accounts],
      active: new Map(),
      locks: new Set(),
      stopping: false,
      proxyRoutes,
      maxConcurrency: Math.max(1, Math.min(proxyRoutes, this.maxConcurrency ?? proxyRoutes)),
    };
    this.database.markRunStarted(run.id);
    this.eventHub.emit("run", { action: "started", run: this.database.getRun(run.id) });
    this.pump();
    return this.database.getRun(run.id);
  }

  stop(runId) {
    if (!this.activeRun || this.activeRun.id !== runId) {
      throw Object.assign(new Error("That run is not active."), { code: "NOT_ACTIVE" });
    }
    this.activeRun.stopping = true;
    this.activeRun.pending = [];
    this.database.cancelPending(runId);
    this.eventHub.emit("run", { action: "stopping", run: this.database.getRun(runId) });
    if (!this.activeRun.active.size) this.finish();
    return this.database.getRun(runId);
  }

  pump() {
    const state = this.activeRun;
    if (!state) return;

    while (!state.stopping && state.active.size < state.maxConcurrency && state.pending.length) {
      const index = state.pending.findIndex(account => !state.locks.has(account.lockKey));
      if (index === -1) break;
      const [account] = state.pending.splice(index, 1);
      state.locks.add(account.lockKey);
      state.active.set(account.id, account);
      void this.runAccount(state, account);
    }

    if (!state.pending.length && !state.active.size) this.finish();
  }

  async runAccount(state, account) {
    const startedAt = Date.now();
    this.database.markCheckStarted(state.id, account.id);
    this.eventHub.emit("check", {
      action: "started",
      runId: state.id,
      account: { id: account.id, email: account.email, proxyLabel: account.proxyLabel },
    });

    try {
      const result = await this.spawnWorker(account.id, line => {
        this.eventHub.emit("log", { runId: state.id, accountId: account.id, email: account.email, line });
      });
      this.database.completeCheck(state.id, account.id, result, Date.now() - startedAt);
      this.eventHub.emit("check", {
        action: "success", runId: state.id, accountId: account.id,
        result: { points: result.points, country: result.country },
      });
    } catch (error) {
      this.database.failCheck(state.id, account.id, error, Date.now() - startedAt);
      this.eventHub.emit("check", {
        action: "error", runId: state.id, accountId: account.id,
        error: { code: error.code || "error", message: cleanLine(error.message) },
      });
    } finally {
      if (this.activeRun?.id !== state.id) return;
      state.active.delete(account.id);
      state.locks.delete(account.lockKey);
      this.eventHub.emit("snapshot", { run: this.database.getRun(state.id), summary: this.database.summary() });
      this.pump();
    }
  }

  spawnWorker(accountId, onLog) {
    const workerPath = path.join(__dirname, "..", "worker", "checkAccount.js");
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [workerPath, accountId], {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          ACCOUNTS_DB_PATH: this.database.dbPath,
          POINT_CHECK_ACCOUNT_ID: accountId,
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdoutBuffer = "";
      let stderrBuffer = "";
      let result = null;
      let reportedError = null;
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reportedError = { code: "timeout", message: `Point check exceeded ${this.timeoutMs} ms` };
      }, this.timeoutMs);

      const consume = (chunk, isError) => {
        const value = chunk.toString("utf8");
        if (isError) stderrBuffer = (stderrBuffer + value).slice(-12000);
        else stdoutBuffer = (stdoutBuffer + value).slice(-30000);
        for (const rawLine of value.split(/\r?\n/)) {
          const line = cleanLine(rawLine);
          if (!line) continue;
          if (line.startsWith(RESULT_PREFIX)) {
            try { result = JSON.parse(line.slice(RESULT_PREFIX.length)); } catch {}
          } else if (line.startsWith(ERROR_PREFIX)) {
            try { reportedError = JSON.parse(line.slice(ERROR_PREFIX.length)); } catch {}
          } else if (!line.includes("ExperimentalWarning")) {
            onLog(line);
          }
        }
      };

      child.stdout.on("data", chunk => consume(chunk, false));
      child.stderr.on("data", chunk => consume(chunk, true));
      child.on("error", error => {
        clearTimeout(timer);
        reject(Object.assign(error, { code: "worker_start_failed" }));
      });
      child.on("exit", code => {
        clearTimeout(timer);
        if (result && code === 0) return resolve(result);
        const detail = reportedError || {
          code: code === null ? "worker_terminated" : "worker_failed",
          message: cleanLine(stderrBuffer || stdoutBuffer || `Worker exited with code ${code}`),
        };
        reject(Object.assign(new Error(detail.message || "Point check failed"), { code: detail.code || "worker_failed" }));
      });
    });
  }

  finish() {
    const state = this.activeRun;
    if (!state) return;
    const run = this.database.finishRun(state.id);
    this.activeRun = null;
    this.eventHub.emit("run", { action: "finished", run, summary: this.database.summary() });
  }

  status() {
    if (!this.activeRun) return null;
    return {
      id: this.activeRun.id,
      pending: this.activeRun.pending.length,
      active: this.activeRun.active.size,
      proxyRoutes: this.activeRun.proxyRoutes,
      maxConcurrency: this.activeRun.maxConcurrency,
      stopping: this.activeRun.stopping,
    };
  }
}

module.exports = { CheckQueue };
