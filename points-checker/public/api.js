"use strict";

window.PointsApi = {
  async request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { code: payload.code, status: response.status });
    return payload;
  },
  summary() { return this.request("/api/summary"); },
  accounts() { return this.request("/api/accounts"); },
  runs() { return this.request("/api/runs?limit=50"); },
  run(id) { return this.request(`/api/runs/${encodeURIComponent(id)}`); },
  history(id) { return this.request(`/api/accounts/${encodeURIComponent(id)}/history`); },
  start(accountIds = []) { return this.request("/api/checks", { method: "POST", body: JSON.stringify({ accountIds }) }); },
  stop(id) { return this.request(`/api/runs/${encodeURIComponent(id)}/stop`, { method: "POST", body: "{}" }); },
};
