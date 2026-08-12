"use strict";

const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const RESULT_PREFIX = "CONN_TEST_RESULT=";
const ERROR_PREFIX = "CONN_TEST_ERROR=";

// A lightweight reachability probe: it never logs in, so it cannot lock or
// suspend an account. It only confirms two things through the account's own
// proxy route: (1) the proxy is alive and what egress IP it exits from, and
// (2) Microsoft Rewards answers over that route.
const IP_CHECK_URL = "https://api.ipify.org?format=json";
const REWARDS_URL = "https://rewards.bing.com/";

function classifyConnError(error) {
  const message = String(error?.message || error || "Unknown connection error");
  const lower = message.toLowerCase();
  let code = "error";
  if (error?.name === "ProxyUnavailableError") code = "proxy_error";
  else if (lower.includes("timed out") || lower.includes("timeout")) code = "timeout";
  else if (lower.includes("econnrefused") || lower.includes("connection refused")) code = "proxy_error";
  else if (lower.includes("enotfound") || lower.includes("eai_again") || lower.includes("could not be resolved")) code = "dns_error";
  else if (lower.includes("proxy")) code = "proxy_error";
  return { code, message: message.slice(0, 400) };
}

// Any numeric HTTP status (even a 3xx/4xx/5xx) means the destination was
// actually reached over the route, which is exactly what we are testing.
// Only a transport failure counts as "unreachable".
async function probe(http, url) {
  const startedAt = Date.now();
  try {
    const res = await http.request({ url, method: "GET", headers: { Accept: "*/*" } });
    return { ok: true, status: res.status, ms: Date.now() - startedAt };
  } catch (error) {
    if (typeof error?.status === "number") {
      return { ok: true, status: error.status, ms: Date.now() - startedAt };
    }
    return { ok: false, ms: Date.now() - startedAt, ...classifyConnError(error) };
  }
}

async function testConnection(account, HttpClient) {
  const Client = HttpClient || require(path.join(PROJECT_ROOT, "dist", "util", "Http.js")).default;
  const http = new Client(account.proxy);
  const usesProxy = http.usesProxy;

  // 1) Proxy liveness + egress IP.
  const ipStarted = Date.now();
  let proxyOk = false;
  let egressIp = null;
  let proxyMs = null;
  let proxyError = null;
  try {
    const res = await http.request({ url: IP_CHECK_URL, method: "GET", headers: { Accept: "application/json" } });
    proxyMs = Date.now() - ipStarted;
    egressIp = res?.data?.ip ?? (typeof res?.data === "string" ? res.data.trim() : null);
    proxyOk = true;
  } catch (error) {
    proxyMs = Date.now() - ipStarted;
    proxyError = classifyConnError(error);
  }

  // 2) Microsoft Rewards reachability over the same route. Skip it when the
  //    proxy is already dead — probing a dead proxy just wastes another timeout.
  let rewards;
  if (proxyOk || !usesProxy) {
    rewards = await probe(http, REWARDS_URL);
  } else {
    rewards = { ok: false, ms: 0, code: proxyError.code, message: "Bỏ qua: proxy không kết nối được" };
  }

  return {
    accountId: account.accountId ?? null,
    email: account.email,
    usesProxy,
    proxyOk,
    egressIp,
    proxyMs,
    proxyError,
    rewardsOk: rewards.ok,
    rewardsStatus: rewards.ok ? rewards.status : null,
    rewardsMs: rewards.ms,
    rewardsError: rewards.ok ? null : { code: rewards.code, message: rewards.message },
    checkedAt: new Date().toISOString(),
  };
}

async function main() {
  const accountId = String(process.argv[2] || process.env.POINT_CHECK_ACCOUNT_ID || "").trim();
  if (!accountId) throw new Error("An account ID is required.");

  const { loadAccounts } = require(path.join(PROJECT_ROOT, "dist", "util", "Load.js"));
  const account = loadAccounts().find(item => item.accountId === accountId);
  if (!account) throw new Error(`Account is not active or does not exist: ${accountId}`);

  const result = await testConnection(account);
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch(error => {
    process.stdout.write(`${ERROR_PREFIX}${JSON.stringify(classifyConnError(error))}\n`);
    process.exitCode = 1;
  });
}

module.exports = { testConnection, classifyConnError, probe };
