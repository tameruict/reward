"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { PointsDatabase } = require("../lib/database");
const { CheckQueue } = require("../lib/checkQueue");

function seedDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "points-checker-"));
  const dbPath = path.join(directory, "accounts.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE proxies (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, status TEXT NOT NULL,
      egress_ip TEXT, identity_key TEXT, max_concurrency INTEGER
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, slot INTEGER, email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, proxy_id TEXT REFERENCES proxies(id), status TEXT NOT NULL
    );
    INSERT INTO proxies VALUES ('p1', 'Proxy One', 'active', '1.1.1.1', 'identity-one', 1);
    INSERT INTO proxies VALUES ('p2', 'Proxy Two', 'active', '2.2.2.2', 'identity-two', 1);
    INSERT INTO proxies VALUES ('p3', 'Proxy Off', 'disabled', '3.3.3.3', 'identity-three', 1);
    INSERT INTO accounts VALUES ('a1', 1, 'one@example.com', 'top-secret', 'p1', 'ready');
    INSERT INTO accounts VALUES ('a2', 2, 'two@example.com', 'top-secret', 'p1', 'ready');
    INSERT INTO accounts VALUES ('a3', 3, 'three@example.com', 'top-secret', 'p2', 'ready');
    INSERT INTO accounts VALUES ('a4', 4, 'four@example.com', 'top-secret', NULL, 'ready');
    INSERT INTO accounts VALUES ('a5', 5, 'five@example.com', 'top-secret', 'p3', 'ready');
  `);
  db.close();
  return { directory, dbPath };
}

// Mirrors the real accounts.db, where auto-provisioned proxies have an empty
// egress_ip (""), a distinct identity_key, and max_concurrency = 1.
function seedEmptyEgress() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "points-checker-empty-"));
  const dbPath = path.join(directory, "accounts.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE proxies (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, status TEXT NOT NULL,
      egress_ip TEXT, identity_key TEXT, max_concurrency INTEGER
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, slot INTEGER, email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, proxy_id TEXT REFERENCES proxies(id), status TEXT NOT NULL
    );
    INSERT INTO proxies VALUES ('q1', 'Proxy A', 'active', '', 'identity-a', 1);
    INSERT INTO proxies VALUES ('q2', 'Proxy B', 'active', '', 'identity-b', 1);
    INSERT INTO proxies VALUES ('q3', 'Proxy C', 'active', '', 'identity-c', 1);
    INSERT INTO accounts VALUES ('a1', 1, 'a1@example.com', 'pw', 'q1', 'ready');
    INSERT INTO accounts VALUES ('a2', 2, 'a2@example.com', 'pw', 'q1', 'ready');
    INSERT INTO accounts VALUES ('a3', 3, 'a3@example.com', 'pw', 'q2', 'ready');
    INSERT INTO accounts VALUES ('a4', 4, 'a4@example.com', 'pw', 'q2', 'ready');
    INSERT INTO accounts VALUES ('a5', 5, 'a5@example.com', 'pw', 'q3', 'ready');
    INSERT INTO accounts VALUES ('a6', 6, 'a6@example.com', 'pw', 'q3', 'ready');
  `);
  db.close();
  return { directory, dbPath };
}

test("stores balance history without exposing account secrets", () => {
  const { directory, dbPath } = seedDatabase();
  const store = new PointsDatabase(dbPath);
  try {
    const accounts = store.listAccounts();
    assert.equal(accounts.length, 5);
    assert.equal(Object.hasOwn(accounts[0], "password"), false);
    assert.deepEqual(store.activeAccounts().map(account => account.id), ["a1", "a2", "a3"]);

    const run = store.createRun(store.activeAccounts(["a1"]));
    store.markRunStarted(run.id);
    store.markCheckStarted(run.id, "a1");
    store.completeCheck(run.id, "a1", {
      points: 1200, lifetimePoints: 5000, lifetimePointsRedeemed: 3800,
      country: "US", checkedAt: "2026-07-18T12:00:00.000Z",
    }, 2500);
    const finished = store.finishRun(run.id);
    assert.equal(finished.status, "completed");
    assert.equal(finished.totalPoints, 1200);
    assert.equal(store.summary().totalPoints, 1200);

    const second = store.createRun(store.activeAccounts(["a1"]));
    store.markRunStarted(second.id);
    store.markCheckStarted(second.id, "a1");
    store.completeCheck(second.id, "a1", {
      points: 1250, lifetimePoints: 5050, lifetimePointsRedeemed: 3800,
      country: "US", checkedAt: "2026-07-18T13:00:00.000Z",
    }, 2000);
    store.finishRun(second.id);
    const history = store.history("a1");
    assert.equal(history.length, 2);
    assert.equal(history[1].delta, 50);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("separates suspended accounts from ordinary check failures", () => {
  const { directory, dbPath } = seedDatabase();
  const store = new PointsDatabase(dbPath);
  try {
    const run = store.createRun(store.activeAccounts(["a1", "a2", "a3"]));
    store.markRunStarted(run.id);
    for (const id of ["a1", "a2", "a3"]) store.markCheckStarted(run.id, id);
    // a1 is suspended, a2 hit a transient proxy error, a3 succeeded.
    store.failCheck(run.id, "a1", { code: "suspended", message: "Microsoft Rewards account has been suspended" }, 1500);
    store.failCheck(run.id, "a2", { code: "proxy_error", message: "ECONNREFUSED" }, 800);
    store.completeCheck(run.id, "a3", { points: 500, lifetimePoints: null, lifetimePointsRedeemed: null, country: "US", checkedAt: "2026-07-20T10:00:00.000Z" }, 1200);
    store.finishRun(run.id);

    const summary = store.summary();
    assert.equal(summary.suspended, 1); // a1 counted as suspended, not failed
    assert.equal(summary.failed, 1);    // only a2

    const accounts = store.listAccounts();
    const a1 = accounts.find(account => account.id === "a1");
    assert.equal(a1.lastCheck.status, "error");
    assert.equal(a1.lastCheck.errorCode, "suspended");
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("queue runs different proxies concurrently but serializes the same proxy", async () => {
  const { directory, dbPath } = seedDatabase();
  const store = new PointsDatabase(dbPath);
  const events = { emit() {} };
  const queue = new CheckQueue(store, events);
  queue.maxConcurrency = 3;
  const inFlightLocks = new Set();
  let overlap = false;
  let maxActive = 0;
  const accountById = new Map(store.activeAccounts().map(account => [account.id, account]));
  queue.spawnWorker = async accountId => {
    const lock = accountById.get(accountId).lockKey;
    if (inFlightLocks.has(lock)) overlap = true;
    inFlightLocks.add(lock);
    maxActive = Math.max(maxActive, inFlightLocks.size);
    await new Promise(resolve => setTimeout(resolve, 20));
    inFlightLocks.delete(lock);
    return { points: accountId === "a1" ? 100 : 200, lifetimePoints: null, lifetimePointsRedeemed: null, country: "US", checkedAt: new Date().toISOString() };
  };

  try {
    const run = queue.start([]);
    while (queue.activeRun) await new Promise(resolve => setTimeout(resolve, 10));
    const finished = store.getRun(run.id);
    assert.equal(overlap, false);
    assert.equal(maxActive, 2);
    assert.equal(finished.successCount, 3);
    assert.equal(finished.status, "completed");
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("treats each proxy as its own route when egress_ip is empty", () => {
  const { directory, dbPath } = seedEmptyEgress();
  const store = new PointsDatabase(dbPath);
  try {
    const active = store.activeAccounts();
    const routes = new Set(active.map(account => account.lockKey));
    assert.equal(active.length, 6);
    // Regression guard: an empty egress_ip must not collapse every account onto
    // one shared route. Each distinct proxy is its own concurrency lane.
    assert.equal(routes.size, 3);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("runs one worker per proxy in parallel when egress_ip is empty", async () => {
  const { directory, dbPath } = seedEmptyEgress();
  const store = new PointsDatabase(dbPath);
  const events = { emit() {} };
  const queue = new CheckQueue(store, events);
  queue.maxConcurrency = null; // auto → scale to the number of proxies in use
  const inFlight = new Map();
  let overlap = false;
  let maxActive = 0;
  const accountById = new Map(store.activeAccounts().map(account => [account.id, account]));
  queue.spawnWorker = async accountId => {
    const lock = accountById.get(accountId).lockKey;
    if ((inFlight.get(lock) || 0) > 0) overlap = true; // same proxy must stay serialized
    inFlight.set(lock, (inFlight.get(lock) || 0) + 1);
    maxActive = Math.max(maxActive, [...inFlight.values()].reduce((sum, n) => sum + n, 0));
    await new Promise(resolve => setTimeout(resolve, 20));
    inFlight.set(lock, inFlight.get(lock) - 1);
    return { points: 100, lifetimePoints: null, lifetimePointsRedeemed: null, country: "US", checkedAt: new Date().toISOString() };
  };

  try {
    const run = queue.start([]);
    assert.equal(queue.activeRun.proxyRoutes, 3);
    assert.equal(queue.activeRun.maxConcurrency, 3);
    while (queue.activeRun) await new Promise(resolve => setTimeout(resolve, 10));
    const finished = store.getRun(run.id);
    assert.equal(overlap, false); // never two accounts through the same proxy at once
    assert.equal(maxActive, 3);   // all three proxies busy simultaneously
    assert.equal(finished.successCount, 6);
    assert.equal(finished.status, "completed");
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
