"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { PointsDatabase } = require("./lib/database");
const { EventHub } = require("./lib/eventHub");
const { CheckQueue } = require("./lib/checkQueue");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 8891;
const PUBLIC_DIR = path.join(__dirname, "public");
const USERNAME = String(process.env.DASHBOARD_USERNAME || "");
const PASSWORD = String(process.env.DASHBOARD_PASSWORD || "");

const database = new PointsDatabase();
const events = new EventHub();
const queue = new CheckQueue(database, events);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function authenticate(req, res) {
  if (!USERNAME && !PASSWORD) return true;
  const header = String(req.headers.authorization || "");
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator !== -1 && decoded.slice(0, separator) === USERNAME && decoded.slice(separator + 1) === PASSWORD) return true;
  }
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Points Checker"', "Content-Type": "text/plain; charset=utf-8" });
  res.end("Authentication required");
  return false;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(Object.assign(new Error("Request body is too large."), { code: "BODY_TOO_LARGE" }));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error("Request body must be valid JSON."), { code: "BAD_JSON" })); }
    });
    req.on("error", reject);
  });
}

function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_DIR, requested);
  if (!resolved.startsWith(`${path.resolve(PUBLIC_DIR)}${path.sep}`) && resolved !== path.join(PUBLIC_DIR, "index.html")) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  fs.readFile(resolved, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") return sendJson(res, 404, { error: "Not found" });
      return sendJson(res, 500, { error: "Could not read static file" });
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'",
    });
    res.end(data);
  });
}

async function route(req, res) {
  if (!authenticate(req, res)) return;
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const { pathname } = url;

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { status: "ok", queue: queue.status(), database: database.dbPath, now: new Date().toISOString() });
  }
  if (req.method === "GET" && pathname === "/api/summary") return sendJson(res, 200, database.summary());
  if (req.method === "GET" && pathname === "/api/accounts") return sendJson(res, 200, { accounts: database.listAccounts() });
  if (req.method === "GET" && pathname === "/api/runs") return sendJson(res, 200, { runs: database.listRuns(url.searchParams.get("limit")) });

  const runMatch = /^\/api\/runs\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && runMatch) {
    const run = database.getRun(runMatch[1]);
    return run ? sendJson(res, 200, run) : sendJson(res, 404, { error: "Run not found" });
  }

  const historyMatch = /^\/api\/accounts\/([^/]+)\/history$/.exec(pathname);
  if (req.method === "GET" && historyMatch) {
    return sendJson(res, 200, { accountId: historyMatch[1], history: database.history(historyMatch[1], url.searchParams.get("limit")) });
  }

  if (req.method === "POST" && pathname === "/api/checks") {
    const body = await readJson(req);
    if (body.accountIds != null && !Array.isArray(body.accountIds)) {
      throw Object.assign(new Error("accountIds must be an array."), { code: "BAD_REQUEST" });
    }
    const run = queue.start(body.accountIds || [], body.source || "manual");
    return sendJson(res, 202, run);
  }

  const stopMatch = /^\/api\/runs\/([^/]+)\/stop$/.exec(pathname);
  if (req.method === "POST" && stopMatch) return sendJson(res, 202, queue.stop(stopMatch[1]));

  if (req.method === "GET" && pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const remove = events.add(res);
    req.on("close", remove);
    return;
  }

  if (pathname.startsWith("/api/")) return sendJson(res, 404, { error: "API endpoint not found" });
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Method not allowed" });
  return serveStatic(pathname, res);
}

const server = http.createServer((req, res) => {
  route(req, res).catch(error => {
    const clientError = ["BAD_REQUEST", "BAD_JSON", "BODY_TOO_LARGE", "RUN_ACTIVE", "NO_ACCOUNTS", "NOT_ACTIVE"].includes(error.code);
    sendJson(res, clientError ? 400 : 500, { error: error.message || "Internal server error", code: error.code || "INTERNAL_ERROR" });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[points-checker] Listening on http://${HOST}:${PORT}`);
  console.log(`[points-checker] Database: ${database.dbPath}`);
  console.log(`[points-checker] Max concurrency: ${queue.maxConcurrency ?? "auto (one worker per proxy route)"}`);
});

function shutdown(signal) {
  console.log(`[points-checker] ${signal} received; shutting down.`);
  server.close(() => {
    events.close();
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
