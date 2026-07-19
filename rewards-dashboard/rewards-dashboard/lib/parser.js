"use strict";

// Control API entries are normalized to "<RFC3339 timestamp> <log line>".
const LEADING_TS_RE = /^(\S+)\s([\s\S]*)$/;

// App log format (src/logging/Logger.ts):
// [localTime] [userName] [LEVEL] PLATFORM [TITLE] message
const APP_LINE_RE =
  /^\[([^\]]+)\]\s\[([^\]]+)\]\s\[([^\]]+)\]\s(\S+)\s\[([^\]]+)\]\s([\s\S]*)$/;

const ACCOUNT_START_RE = /^Starting account:\s(\S+)\s\|\sgeoLocale:\s(.*)$/;
const ACCOUNT_END_RE =
  /^Completed account:\s(\S+)\s\|\spointsGained=(-?\d+)\s\|\spreviousBalance=(\d+)\s\|\scurrentBalance=(\d+)\s\|\sdurationSeconds=([\d.]+)$/;
const ACCOUNT_ERR_RE = /^(\S+@\S+):\s([\s\S]*)$/;
const RUN_START_RE =
  /^Starting Microsoft Rewards Script\s\|\sv([\w.\-]+)\s\|\sAccounts:\s(\d+)\s\|\sClusters:\s(\d+)$/;
const RUN_END_RE =
  /^Completed all accounts\s\|\saccountsProcessed=(\d+)\s\|\spointsGained=(-?\d+)\s\|\spreviousBalance=(\d+)\s\|\scurrentBalance=(\d+)\s\|\sruntimeMinutes=([\d.]+)$/;
const STREAK_PROTECTION_RE =
  /^Snapshot complete\s\|\soffers=(\d+)\s\|\sreportable=(\d+)\s\|\sstreaks=(\d+)\s\|\sstreakProtectionEnabled=(true|false)\s\|\sstreakProtectionRemainingDays=(\d+|null)\s\|\sstreakCounter=(\d+|null)\s\|\slevel=([^|]+)\s\|\saccount=(\S+@\S+)$/;

// src/browser/auth/methods/PasswordlessLogin.ts - the only login flow that
// logs an actual value a human needs to act on before the bot can proceed
// (TOTP-with-secret is auto-filled and deliberately never logged; manual
// TOTP/email code entry waits on a raw stdin prompt with no code the bot
// itself knows, so there's nothing to surface for those).
const LOGIN_NUMBER_RE = /^Please approve login and select number:\s*(\d+)$/;
const LOGIN_NUMBER_RESOLVED_RE =
  /^(Approval detected|Login approved successfully|Login approval failed or timed out|Approval timeout after \d+ seconds!)$/;

/**
 * Strips the normalized leading timestamp.
 */
function splitTimestamp(rawLine) {
  const m = LEADING_TS_RE.exec(rawLine);
  if (!m) return { timestamp: null, rest: rawLine };
  return { timestamp: m[1], rest: m[2] };
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Parses one normalized Control API log line into a structured event, or null if it
 * doesn't match the app's log format at all (defensive - unrelated stdout).
 */
function parseLine(rawLine) {
  const { timestamp, rest } = splitTimestamp(rawLine);
  if (!timestamp) return null;

  const clean = rest.replace(ANSI_RE, "");
  const m = APP_LINE_RE.exec(clean);
  if (!m) return null;

  const [, appTime, userName, level, platform, title, message] = m;

  const base = {
    ts: timestamp,
    appTime,
    userName,
    level: level.toLowerCase(),
    platform,
    title,
    message,
    raw: clean,
  };

  switch (title) {
    case "ACCOUNT-START": {
      const am = ACCOUNT_START_RE.exec(message);
      if (am)
        return {
          ...base,
          kind: "account-start",
          email: am[1],
          geoLocale: am[2],
        };
      break;
    }
    case "ACCOUNT-END": {
      const am = ACCOUNT_END_RE.exec(message);
      if (am) {
        return {
          ...base,
          kind: "account-end",
          email: am[1],
          gained: Number(am[2]),
          oldPoints: Number(am[3]),
          newPoints: Number(am[4]),
          durationSec: Number(am[5]),
        };
      }
      break;
    }
    case "ACCOUNT-ERROR": {
      const am = ACCOUNT_ERR_RE.exec(message);
      if (am)
        return { ...base, kind: "account-error", email: am[1], error: am[2] };
      return { ...base, kind: "account-error", email: null, error: message };
    }
    case "RUN-START": {
      const am = RUN_START_RE.exec(message);
      if (am) {
        return {
          ...base,
          kind: "run-start",
          version: am[1],
          totalAccounts: Number(am[2]),
          clusters: Number(am[3]),
        };
      }
      break;
    }
    case "RUN-END": {
      const am = RUN_END_RE.exec(message);
      if (am) {
        return {
          ...base,
          kind: "run-end",
          accountsProcessed: Number(am[1]),
          totalGained: Number(am[2]),
          oldTotal: Number(am[3]),
          newTotal: Number(am[4]),
          runtimeMin: Number(am[5]),
        };
      }
      break;
    }
    case "REACT-PARSE": {
      const protection = STREAK_PROTECTION_RE.exec(message);
      if (protection) {
        return {
          ...base,
          kind: "streak-protection",
          email: protection[8],
          enabled: protection[4] === "true",
          remainingDays:
            protection[5] === "null" ? null : Number(protection[5]),
          streakCounter:
            protection[6] === "null" ? null : Number(protection[6]),
        };
      }
      break;
    }
    case "LOGIN-PASSWORDLESS": {
      const numMatch = LOGIN_NUMBER_RE.exec(message);
      if (numMatch)
        return { ...base, kind: "login-number", number: numMatch[1] };
      if (LOGIN_NUMBER_RESOLVED_RE.test(message)) {
        return { ...base, kind: "login-number-resolved" };
      }
      break;
    }
    default:
      break;
  }

  // Fall through: no specific structured match, but still a valid app log
  // line. Kept as a generic event so warnings/errors show up in the feed.
  return { ...base, kind: "generic" };
}

module.exports = { parseLine };
