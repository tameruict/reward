"use strict";

const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const RESULT_PREFIX = "POINT_CHECK_RESULT=";
const ERROR_PREFIX = "POINT_CHECK_ERROR=";

function classifyError(error) {
  const message = String(error?.message || error || "Unknown point-check error");
  const lower = message.toLowerCase();
  let code = "error";
  if (lower.includes("suspended")) code = "account_suspended";
  else if (lower.includes("captcha") || lower.includes("funcaptcha")) code = "needs_interaction";
  else if (lower.includes("number matching") || lower.includes("approval")) code = "needs_interaction";
  else if (lower.includes("authentication") || lower.includes("login")) code = "auth_required";
  else if (lower.includes("429") || lower.includes("rate limit")) code = "rate_limited";
  else if (lower.includes("proxy") || lower.includes("econnrefused") || lower.includes("enotfound")) code = "proxy_error";
  else if (lower.includes("timeout") || lower.includes("timed out")) code = "timeout";
  return { code, message: message.slice(0, 800) };
}

async function main() {
  const accountId = String(process.argv[2] || process.env.POINT_CHECK_ACCOUNT_ID || "").trim();
  if (!accountId) throw new Error("An account ID is required.");

  const { loadAccounts } = require(path.join(PROJECT_ROOT, "dist", "util", "Load.js"));
  const { MicrosoftRewardsBot } = require(path.join(PROJECT_ROOT, "dist", "index.js"));
  const account = loadAccounts().find(item => item.accountId === accountId);
  if (!account) throw new Error(`Account is not active or does not exist: ${accountId}`);
  if (!account.proxy?.url) throw new Error("Account has no assigned proxy; direct fallback is disabled.");

  const bot = new MicrosoftRewardsBot();
  const result = await bot.checkAccountPoints(account);
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`);
}

main().catch(error => {
  process.stdout.write(`${ERROR_PREFIX}${JSON.stringify(classifyError(error))}\n`);
  process.exitCode = 1;
});
