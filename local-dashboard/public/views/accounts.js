import * as U from "../util.js";
import { cached } from "../api.js";

let accountsPayload = null;
let proxiesPayload = null;
let rootEl = null;
let mounted = false;
let context = null;

const launching = new Set();

const SOURCE_LABELS = {
  search: "Search",
  bonus: "Bonus search",
  read: "Read",
  checkIn: "Check-in",
  claimReward: "Claim reward",
  claimBonus: "Claim bonus",
  urlReward: "URL reward",
  visualSearch: "Visual search",
  appReward: "App reward",
  punchcard: "Punchcard",
  searchOnBing: "Search activity",
};

function controlState() {
  const status = context?.status;
  const usable = Boolean(status?.reachable && status?.authOk !== false);
  const running = Boolean(status?.botRunning);
  return { usable, running };
}

async function runAccount(account) {
  if (!context || !account.configured || !Number.isInteger(account.index)) return;

  launching.add(account.index);
  render(rootEl);
  try {
    await context.api.control("start", { accountIndex: account.index });
    context.toast(
      `Started ACCOUNT_${account.index} only (${account.email}).`,
      "success",
    );
    context.invalidate();
    await context.refresh();
  } catch (error) {
    context.toast(error.message, error.status === 409 ? "warn" : "error");
  } finally {
    launching.delete(account.index);
    render(rootEl);
  }
}

function earnableBadge(account) {
  const earnable = account.earnable || account.live?.earnable;
  const total = earnable
    ? Object.values(earnable).reduce((sum, points) => sum + (Number(points) || 0), 0)
    : 0;
  if (total <= 0) return "";
  return `<span class="point-source point-source--target"><strong>Earnable</strong> ${U.escapeHtml(U.fmtNumber(total))}</span>`;
}

// Only sources that actually earned something today — ten "+0" chips per
// account is noise, not detail.
function sourceBreakdown(account) {
  const bySource = account.live?.bySource || {};
  return Object.entries(SOURCE_LABELS)
    .filter(([source]) => Number(bySource[source]) > 0)
    .map(
      ([source, label]) =>
        `<span class="point-source"><strong>${U.escapeHtml(label)}</strong> ${U.escapeHtml(U.fmtSigned(Number(bySource[source])))}</span>`,
    )
    .join("");
}

function protectionPresentation(account) {
  if (account.streakProtectionEnabled == null) return null;

  const remaining = account.streakProtectionRemainingDays;
  const days =
    remaining == null
      ? "days unavailable"
      : `${remaining} protection day${remaining === 1 ? "" : "s"} left`;
  const state = account.streakProtectionEnabled ? "On" : "Off";
  const streak =
    account.streakCounter == null
      ? "streak unavailable"
      : `${U.fmtNumber(account.streakCounter)} day${account.streakCounter === 1 ? "" : "s"} current streak`;

  return {
    state,
    days,
    streak,
    pillClass:
      account.streakProtectionEnabled && remaining !== 0
        ? "pill-success"
        : remaining === 0
          ? "pill-warn"
          : "pill-idle",
  };
}

function kv(items) {
  return `<dl class="kv">${items
    .map(
      ([k, v]) =>
        `<div><dt>${U.escapeHtml(k)}</dt><dd>${U.escapeHtml(String(v))}</dd></div>`,
    )
    .join("")}</dl>`;
}

function detailGroups(a, protection) {
  const groups = [];

  groups.push([
    "Configuration",
    [
      ["Stored account", a.configured ? "Yes" : "No \u2014 seen in logs only"],
      ...(a.configuredStatus ? [["Account status", a.configuredStatus]] : []),
      ...(a.geoLocale ? [["Geo locale", a.geoLocale]] : []),
      ...(a.langCode ? [["Language", a.langCode]] : []),
      ...(a.hasTotp != null ? [["TOTP secret", a.hasTotp ? "Set" : "Not set"]] : []),
      ...(a.hasRecoveryEmail != null
        ? [["Recovery email", a.hasRecoveryEmail ? "Set" : "Not set"]]
        : []),
      [
        "Proxy",
        a.proxy
          ? `${a.proxy.url}${a.proxy.port ? `:${a.proxy.port}` : ""}${a.proxy.hasCredentials ? " (authenticated)" : ""}`
          : "None",
      ],
    ],
  ]);

  groups.push([
    "Streak &amp; protection",
    [
      ["Success streak", `${a.successStreak} run${a.successStreak === 1 ? "" : "s"}`],
      ...(protection
        ? [
          ["Current streak", protection.streak],
          ["Streak protection", protection.state === "On" ? "Enabled" : "Disabled"],
          ["Protection days remaining", protection.days],
          ...(a.streakProtectionUpdatedAt
            ? [["Protection status checked", U.fmtRelative(a.streakProtectionUpdatedAt)]]
            : []),
        ]
        : []),
    ],
  ]);

  groups.push([
    "Run history",
    [
      ["Runs recorded by the API", U.fmtNumber(a.apiRuns)],
      ["Points collected (API history)", U.fmtSigned(a.apiTotalCollected)],
      ["Last duration", U.fmtDuration(a.lastDurationSec)],
      ["History points loaded", U.fmtNumber(a.historyCount)],
    ],
  ]);

  return groups
    .map(
      ([title, items]) => `
        <div class="acc-detail-group">
            <h3 class="acc-detail-group-title">${title}</h3>
            ${kv(items)}
        </div>`,
    )
    .join("");
}

function renderAccountPanel(a, live) {
  const protection = protectionPresentation(a);
  const { usable, running } = controlState();

  const statusKey = launching.has(a.index)
    ? "starting"
    : live && running
      ? "running"
      : "idle";

  const runButton =
    a.configured && Number.isInteger(a.index)
      ? `<button type="button" class="btn btn-primary btn-small" data-run-account="${a.index}" ${!usable || running || launching.has(a.index) ? "disabled" : ""
      } title="Run only ACCOUNT_${a.index}">${launching.has(a.index) ? "Starting\u2026" : "Run only"}</button>`
      : "";

  const chips = [
    protection
      ? `<span class="pill ${protection.pillClass}" title="${U.escapeAttr(protection.streak)}; streak protection is ${protection.state.toLowerCase()}; ${U.escapeAttr(protection.days)}">Protection ${protection.state} \u00b7 ${a.streakProtectionRemainingDays == null ? "days unavailable" : `${a.streakProtectionRemainingDays} day${a.streakProtectionRemainingDays === 1 ? "" : "s"} left`}</span>`
      : "",
    earnableBadge(live || {}),
    sourceBreakdown(live || {}),
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="panel account-detail-panel">
        <div class="panel-head">
            <h2>${U.escapeHtml(a.email)}</h2>
            ${a.index != null ? `<span class="tag-mini">ACCOUNT_${a.index}</span>` : ""}
            ${a.configured ? "" : '<span class="tag-mini">unconfigured</span>'}
            <span class="acc-detail-actions">
                ${U.statusPill(statusKey)}
                ${runButton}
            </span>
        </div>
        <div class="panel-body">
            ${detailGroups(a, protection)}
        </div>
        ${chips ? `<div class="account-today-row">
            <span class="account-today-label">Today</span>
            <div class="account-today-chips">${chips}</div>
        </div>` : ""}
    </div>`;
}

function render(root) {
  const container = U.$("#accountsContainer", root);
  const accounts = accountsPayload?.accounts || [];

  const liveByEmail = new Map(
    (context?.status?.bot?.run?.accounts || []).map((la) => [la.email, la]),
  );

  const errEl = U.$("#accountsError", root);
  if (errEl) {
    errEl.hidden = !accountsPayload?.apiError;
    if (accountsPayload?.apiError) errEl.textContent = accountsPayload.apiError;
  }

  if (!accounts.length) {
    container.innerHTML = '<p class="empty-note" style="padding:1.25rem">No accounts configured or observed yet.</p>';
    return;
  }

  container.innerHTML = accounts.map(a => {
    const live = liveByEmail.get(a.email) || null;
    return renderAccountPanel(a, live);
  }).join("");

  renderManagementRows(root, accounts);

  container.querySelectorAll("button[data-run-account]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.runAccount);
      const account = accounts.find((a) => a.index === index);
      if (account) runAccount(account);
    }),
  );
}

function renderManagementRows(root, accounts) {
  const host = U.$("#accountManagerRows", root);
  if (!host) return;
  const proxies = proxiesPayload?.proxies || [];
  const options = [
    `<option value="__direct">Direct traffic (no proxy)</option>`,
    ...proxies.map((proxy) =>
      `<option value="${U.escapeAttr(proxy.label)}">${U.escapeHtml(proxy.label)} — ${U.escapeHtml(proxy.url || "")}:${U.escapeHtml(proxy.port || "")}</option>`,
    ),
  ].join("");

  const manageable = accounts.filter((account) => account.configured !== false);
  if (!manageable.length) {
    host.innerHTML = '<p class="empty-note">No stored accounts available for management.</p>';
    return;
  }

  host.innerHTML = manageable.map((account) => {
    const current = account.useProxy === false ? "__direct" : (account.proxy?.label || "");
    const status = account.configuredStatus || "ready";
    const nextStatus = status === "disabled" ? "ready" : "disabled";
    return `
      <div class="account-manager-row">
        <div class="account-manager-identity">
          <strong>${U.escapeHtml(account.email)}</strong>
          <span class="hint">${U.escapeHtml(status)}${account.proxy?.label ? ` · ${U.escapeHtml(account.proxy.label)}` : ""}</span>
        </div>
        <label class="account-manager-proxy">
          <span class="visually-hidden">Proxy for ${U.escapeHtml(account.email)}</span>
          <select data-account-proxy="${U.escapeAttr(account.email)}" ${!proxies.length ? "disabled" : ""}>
            <option value="" disabled ${!current ? "selected" : ""}>Choose a proxy</option>
            ${options.replace(`value="${U.escapeAttr(current)}"`, `value="${U.escapeAttr(current)}" selected`)}
          </select>
        </label>
        <button type="button" class="btn btn-small" data-save-proxy="${U.escapeAttr(account.email)}" ${!proxies.length ? "disabled" : ""}>Save proxy</button>
        <button type="button" class="btn btn-small" data-account-status="${U.escapeAttr(account.email)}" data-next-status="${nextStatus}">${nextStatus === "disabled" ? "Disable" : "Enable"}</button>
        <button type="button" class="btn btn-small btn-danger" data-delete-account="${U.escapeAttr(account.email)}">Delete</button>
      </div>`;
  }).join("");

  host.querySelectorAll("button[data-save-proxy]").forEach((button) =>
    button.addEventListener("click", async () => {
      const email = button.dataset.saveProxy;
      const select = Array.from(host.querySelectorAll("select[data-account-proxy]")).find(
        (node) => node.dataset.accountProxy === email,
      );
      const value = select?.value;
      if (!email || !value) return;
      try {
        await context.api.assignProxy(email, value === "__direct" ? { useProxy: false } : { proxyLabel: value });
        context.toast(`Updated proxy for ${email}.`, "success");
        await reloadManagement();
      } catch (error) {
        context.toast(error.message, error.status === 409 ? "warn" : "error");
      }
    }),
  );

  host.querySelectorAll("button[data-account-status]").forEach((button) =>
    button.addEventListener("click", async () => {
      const email = button.dataset.accountStatus;
      const nextStatus = button.dataset.nextStatus;
      try {
        await context.api.setAccountStatus(email, nextStatus);
        context.toast(`${email} is now ${nextStatus}.`, "success");
        await reloadManagement();
      } catch (error) {
        context.toast(error.message, error.status === 409 ? "warn" : "error");
      }
    }),
  );

  host.querySelectorAll("button[data-delete-account]").forEach((button) =>
    button.addEventListener("click", async () => {
      const email = button.dataset.deleteAccount;
      if (!globalThis.confirm(`Permanently delete ${email}?`)) return;
      try {
        await context.api.deleteAccount(email);
        context.toast(`Deleted ${email}.`, "success");
        await reloadManagement();
      } catch (error) {
        context.toast(error.message, error.status === 409 ? "warn" : "error");
      }
    }),
  );
}

async function reloadManagement() {
  context.invalidate("accounts");
  context.invalidate("proxies");
  await context.refresh();
}

export default {
  id: "accounts",
  label: "Accounts",
  interval: 10000,

  mount(root, ctx) {
    rootEl = root;
    context = ctx;
    root.innerHTML = `
      <p class="notice notice--warn" id="accountsError" hidden></p>
      <div class="panel account-management-panel">
        <div class="panel-head"><h2>Remote account management</h2></div>
        <div class="panel-body">
          <p class="hint">Import JSON from this page, then assign a stored proxy to each account. Passwords and proxy credentials are sent only to the protected control API and are never displayed again.</p>
          <textarea id="accountImportJson" rows="8" spellcheck="false" placeholder='{"proxies":[{"label":"proxy-01","url":"proxy.example.com","port":8000}],"accounts":[{"email":"user@example.com","password":"...","proxyLabel":"proxy-01"}]}'></textarea>
          <div class="account-management-actions">
            <button type="button" class="btn btn-primary" id="importAccountsButton">Import / update accounts</button>
            <button type="button" class="btn" id="clearAccountImportButton">Clear</button>
          </div>
          <div id="accountManagerRows"><p class="empty-note">Loading account and proxy assignments&hellip;</p></div>
        </div>
      </div>
      <div id="accountsContainer">
          <p class="empty-note" style="padding:1.25rem">Loading accounts configuration details&hellip;</p>
      </div>
      <p class="hint" style="margin-top: 1.5rem;">Accounts are configured in the bot&rsquo;s <code>.env</code> (<code>ACCOUNT_N_*</code>).
      The control API exposes full local email addresses but never sends passwords, recovery addresses, TOTP secrets, or proxy credentials.</p>
    `;
    U.$("#importAccountsButton", root).addEventListener("click", async () => {
      const input = U.$("#accountImportJson", root);
      try {
        const bundle = JSON.parse(input.value);
        await context.api.importAccounts(bundle);
        input.value = "";
        context.toast("Accounts and proxies imported.", "success");
        await reloadManagement();
      } catch (error) {
        context.toast(error.message, error.status === 409 ? "warn" : "error");
      }
    });
    U.$("#clearAccountImportButton", root).addEventListener("click", () => {
      U.$("#accountImportJson", root).value = "";
    });
    mounted = true;
  },

  async refresh(ctx) {
    context = ctx;
    [accountsPayload, proxiesPayload] = await Promise.all([
      cached("accounts", ctx.api.accounts, 5000),
      cached("proxies", ctx.api.proxies, 5000),
    ]);
    this.redraw(ctx);
  },

  redraw(ctx) {
    context = ctx || context;
    if (!mounted || !accountsPayload) return;
    render(rootEl);
  }
};
