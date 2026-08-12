"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyError } = require("../worker/checkAccount");

test("classifies a structured AccountUnusableError as suspended", () => {
  const error = Object.assign(new Error("Account cannot be used: a@b.com | Microsoft Rewards account has been suspended"), {
    name: "AccountUnusableError",
    reason: "suspended",
  });
  assert.equal(classifyError(error).code, "suspended");
});

test("classifies a suspended account by message keyword", () => {
  assert.equal(classifyError(new Error("Your Microsoft Rewards account has been suspended")).code, "suspended");
});

test("classifies a locked account distinctly", () => {
  assert.equal(classifyError(new Error("This account has been locked! Remove from config and restart!")).code, "locked");
});

test("still classifies transient errors correctly", () => {
  assert.equal(classifyError(new Error("connect ECONNREFUSED 10.0.0.1:8080")).code, "proxy_error");
  assert.equal(classifyError(new Error("Navigation timeout of 30000 ms exceeded")).code, "timeout");
  assert.equal(classifyError(new Error("HTTP 429 rate limit hit")).code, "rate_limited");
  assert.equal(classifyError(new Error("Something unexpected happened")).code, "error");
});
