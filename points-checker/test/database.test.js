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
      egress_ip TEXT, identity_key TEXT
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, slot INTEGER, email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, proxy_id TEXT REFERENCES proxies(id), status TEXT NOT NULL
    );
    INSERT INTO proxies VALUES ('p1', 'Proxy One', 'active', '1.1.1.1', 'identity-one');
    INSERT INTO proxies VALUES ('p2', 'Proxy Two', 'active', '2.2.2.2', 'identity-two');
    INSERT INTO proxies VALUES ('p3', 'Proxy Off', 'disabled', '3.3.3.3', 'identity-three');
    INSERT INTO accounts VALUES ('a1', 1, 'one@example.com', 'top-secret', 'p1', 'ready');
    INSERT INTO accounts VALUES ('a2', 2, 'two@example.com', 'top-secret', 'p1', 'ready');
    INSERT INTO accounts VALUES ('a3', 3, 'three@example.com', 'top-secret', 'p2', 'ready');
    INSERT INTO accounts VALUES ('a4', 4, 'four@example.com', 'top-secret', NULL, 'ready');
    INSERT INTO accounts VALUES ('a5', 5, 'five@example.com', 'top-secret', 'p3', 'ready');
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
