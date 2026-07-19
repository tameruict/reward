"use strict";

const Api = window.PointsApi;
const state = { summary: null, accounts: [], runs: [], selected: new Set(), activeRun: null, view: "overview", logs: [] };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const number = value => value == null ? "—" : new Intl.NumberFormat("vi-VN").format(value);
const dateTime = value => value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value)) : "Chưa check";
const duration = ms => ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} giây`;

function statusLabel(status) {
  return ({ success: "Thành công", error: "Có lỗi", running: "Đang check", pending: "Đang chờ", cancelled: "Đã hủy", completed: "Hoàn tất", completed_with_errors: "Hoàn tất có lỗi", interrupted: "Bị gián đoạn", stopping: "Đang dừng" })[status] || "Chưa check";
}

function statusChip(status, message = "") {
  const safe = status || "unchecked";
  return `<span class="status ${escapeHtml(safe)}"${message ? ` title="${escapeHtml(message)}"` : ""}><i></i>${escapeHtml(statusLabel(status))}</span>`;
}

function delta(value) {
  if (value == null) return '<span class="muted">—</span>';
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "muted";
  return `<span class="${cls}">${value > 0 ? "+" : ""}${number(value)}</span>`;
}

function toast(message, tone = "default") {
  const element = $("#toast");
  element.textContent = message;
  element.dataset.tone = tone;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
}

function setConnection(connected) {
  const el = $("#connection");
  el.classList.toggle("online", connected);
  el.querySelector("span:last-child").textContent = connected ? "Backend online" : "Mất kết nối";
}

function renderSummary() {
  const data = state.summary || {};
  $("#metricAccounts").textContent = number(data.accounts);
  $("#metricPoints").textContent = number(data.totalPoints);
  $("#metricChecked").textContent = number(data.checked);
  $("#metricCheckedSub").textContent = data.accounts ? `${Math.round((data.checked || 0) / data.accounts * 100)}% tài khoản` : "chưa có dữ liệu";
  $("#metricFailed").textContent = number(data.failed);
  $("#metricProxies").textContent = number(data.proxies);
}

function accountRow(account, selectable = false) {
  const check = account.lastCheck;
  return `<tr data-account-id="${escapeHtml(account.id)}">
    ${selectable ? `<td class="select-cell"><input class="account-check" type="checkbox" value="${escapeHtml(account.id)}" ${state.selected.has(account.id) ? "checked" : ""} aria-label="Chọn ${escapeHtml(account.email)}"></td><td>${account.slot ?? "—"}</td>` : ""}
    <td><div class="account-name"><strong>${escapeHtml(account.email)}</strong><small>${escapeHtml(account.status)}</small></div></td>
    <td><span class="proxy-name">${escapeHtml(account.proxyLabel)}</span></td>
    <td>${statusChip(check?.status, check?.errorMessage)}</td>
    <td class="number points-value">${number(check?.points)}</td>
    <td class="number">${delta(check?.delta)}</td>
    ${selectable ? `<td>${escapeHtml(check?.country || "—")}</td>` : ""}
    <td><span class="time">${dateTime(check?.checkedAt)}</span>${selectable ? `<small class="duration">${duration(check?.durationMs)}</small>` : ""}</td>
  </tr>`;
}

function filteredAccounts() {
  const query = $("#accountSearch")?.value.trim().toLowerCase() || "";
  const filter = $("#statusFilter")?.value || "all";
  return state.accounts.filter(account => {
    const matchesQuery = !query || account.email.toLowerCase().includes(query) || account.proxyLabel.toLowerCase().includes(query);
    const status = account.lastCheck?.status || "unchecked";
    return matchesQuery && (filter === "all" || filter === status);
  });
}

function renderAccounts() {
  $("#overviewRows").innerHTML = state.accounts.slice(0, 8).map(account => accountRow(account)).join("") || '<tr><td colspan="6" class="empty">Chưa có account trong database.</td></tr>';
  const visible = filteredAccounts();
  $("#accountRows").innerHTML = visible.map(account => accountRow(account, true)).join("") || '<tr><td colspan="9" class="empty">Không tìm thấy account phù hợp.</td></tr>';
  $("#selectionSummary").textContent = state.selected.size ? `Đã chọn ${state.selected.size} tài khoản` : `${state.accounts.length} tài khoản trong database`;
  $("#checkSelectedButton").disabled = state.selected.size === 0 || Boolean(state.activeRun);
  $("#selectAll").checked = visible.length > 0 && visible.every(account => state.selected.has(account.id));
  $("#selectAll").indeterminate = visible.some(account => state.selected.has(account.id)) && !$("#selectAll").checked;
  $$(".account-check").forEach(input => input.addEventListener("change", () => {
    input.checked ? state.selected.add(input.value) : state.selected.delete(input.value);
    renderAccounts();
  }));
}

function renderRuns() {
  const container = $("#runsList");
  if (!state.runs.length) {
    container.innerHTML = '<div class="empty-state"><strong>Chưa có lượt check</strong><span>Nhấn “Check tất cả” để tạo lượt đầu tiên.</span></div>';
    return;
  }
  container.innerHTML = state.runs.map(run => {
    const done = Number(run.successCount || 0) + Number(run.failedCount || 0) + Number(run.cancelledCount || 0);
    const percent = run.totalAccounts ? Math.round(done / run.totalAccounts * 100) : 0;
    return `<article class="run-item" data-run-id="${escapeHtml(run.id)}">
      <div class="run-icon">${run.status === "running" ? '<span class="spinner"></span>' : "✓"}</div>
      <div class="run-main"><div><strong>${statusLabel(run.status)}</strong><span>${dateTime(run.startedAt || run.createdAt)}</span></div><div class="mini-track"><i style="width:${percent}%"></i></div><small>${done}/${run.totalAccounts} account · ${number(run.totalPoints)} điểm</small></div>
      <div class="run-counts"><span class="positive">${run.successCount || 0} thành công</span><span class="negative">${run.failedCount || 0} lỗi</span></div>
    </article>`;
  }).join("");
}

function detectActiveRun() {
  const active = state.runs.find(run => ["queued", "running", "stopping"].includes(run.status));
  state.activeRun = active || null;
  const panel = $("#activeRunPanel");
  const stop = $("#stopButton");
  panel.hidden = !active;
  stop.hidden = !active;
  $("#checkAllButton").disabled = Boolean(active);
  $("#checkSelectedButton").disabled = Boolean(active) || state.selected.size === 0;
  if (!active) return;
  const done = Number(active.successCount || 0) + Number(active.failedCount || 0) + Number(active.cancelledCount || 0);
  const percent = active.totalAccounts ? done / active.totalAccounts * 100 : 0;
  $("#runProgressText").textContent = `${done} / ${active.totalAccounts}`;
  $("#runProgressBar").style.width = `${percent}%`;
  $("#runStatusText").textContent = active.status === "stopping" ? "Đang hoàn tất account hiện tại rồi dừng" : `${active.successCount || 0} thành công · ${active.failedCount || 0} lỗi`;
}

async function renderHistory(accountId) {
  if (!accountId) {
    $("#historyChart").hidden = true;
    $("#historyEmpty").hidden = false;
    return;
  }
  try {
    const { history } = await Api.history(accountId);
    if (!history.length) {
      $("#historyChart").hidden = true;
      $("#historyEmpty").hidden = false;
      $("#historyEmpty").textContent = "Account này chưa có lần check thành công.";
      return;
    }
    $("#historyEmpty").hidden = true;
    $("#historyChart").hidden = false;
    const values = history.map(item => Number(item.points));
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, 1);
    const points = values.map((value, index) => {
      const x = history.length === 1 ? 450 : 28 + index * (844 / (history.length - 1));
      const y = 225 - ((value - min) / span) * 180;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const circles = points.split(" ").map((point, index) => { const [x, y] = point.split(","); return `<circle cx="${x}" cy="${y}" r="4" data-index="${index}"/>`; }).join("");
    $("#historySvg").innerHTML = `<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2563eb" stop-opacity=".22"/><stop offset="1" stop-color="#2563eb" stop-opacity="0"/></linearGradient></defs><path class="area" d="M ${points.replaceAll(" ", " L ")} L 872 240 L 28 240 Z"/><polyline points="${points}"/>${circles}`;
    const last = history.at(-1), first = history[0];
    $("#historyCurrent").textContent = `${number(last.points)} điểm`;
    $("#historyDelta").textContent = last.delta == null ? "Lần ghi nhận đầu tiên" : `${last.delta >= 0 ? "+" : ""}${number(last.delta)} từ lần trước`;
    $("#historyDelta").className = last.delta > 0 ? "positive" : last.delta < 0 ? "negative" : "muted";
    $("#historyStart").textContent = dateTime(first.checkedAt);
    $("#historyEnd").textContent = dateTime(last.checkedAt);
  } catch (error) { toast(error.message, "error"); }
}

function populateHistoryAccounts() {
  const select = $("#historyAccount");
  const current = select.value;
  select.innerHTML = '<option value="">Chọn tài khoản…</option>' + state.accounts.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.email)}</option>`).join("");
  if (state.accounts.some(account => account.id === current)) select.value = current;
}

function render() {
  renderSummary(); renderAccounts(); renderRuns(); detectActiveRun(); populateHistoryAccounts();
}

async function loadData({ quiet = false } = {}) {
  try {
    const [summary, accounts, runs] = await Promise.all([Api.summary(), Api.accounts(), Api.runs()]);
    state.summary = summary; state.accounts = accounts.accounts; state.runs = runs.runs;
    setConnection(true); render();
    if (!quiet) toast("Dữ liệu đã được cập nhật");
  } catch (error) {
    setConnection(false);
    if (!quiet) toast(error.message, "error");
  }
}

async function startCheck(accountIds) {
  try {
    const run = await Api.start(accountIds);
    state.activeRun = run; state.logs = [];
    $("#liveLog").innerHTML = "";
    toast(`Đã bắt đầu check ${run.totalAccounts} tài khoản`, "success");
    await loadData({ quiet: true });
  } catch (error) { toast(error.message, "error"); }
}

function switchView(view) {
  state.view = view;
  $$(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === view));
  $$(".view").forEach(panel => panel.classList.toggle("active", panel.id === `view-${view}`));
  const copy = {
    overview: ["Kiểm tra điểm tài khoản", "Đọc số dư qua proxy đã gán, không thực hiện nhiệm vụ kiếm điểm."],
    accounts: ["Quản lý lượt kiểm tra", "Chọn account riêng lẻ hoặc lọc theo kết quả gần nhất."],
    history: ["Lịch sử số dư", "Theo dõi biến động điểm của từng tài khoản theo thời gian."],
    runs: ["Lịch sử lượt chạy", "Xem tình trạng và kết quả của các đợt kiểm tra."],
  };
  [$("#pageTitle").textContent, $("#pageDescription").textContent] = copy[view];
  location.hash = view;
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("ready", () => setConnection(true));
  ["run", "check", "snapshot"].forEach(type => source.addEventListener(type, async event => {
    const payload = JSON.parse(event.data);
    if (payload.action === "finished") toast("Lượt check đã hoàn tất", payload.run.failedCount ? "error" : "success");
    await loadData({ quiet: true });
  }));
  source.addEventListener("log", event => {
    const payload = JSON.parse(event.data);
    const line = `${payload.email}: ${payload.line}`;
    state.logs.push(line); state.logs = state.logs.slice(-40);
    $("#liveLog").innerHTML = state.logs.map(item => `<div>${escapeHtml(item)}</div>`).join("");
    $("#liveLog").scrollTop = $("#liveLog").scrollHeight;
  });
  source.onerror = () => setConnection(false);
}

$("#refreshButton").addEventListener("click", () => loadData());
$("#checkAllButton").addEventListener("click", () => startCheck([]));
$("#checkSelectedButton").addEventListener("click", () => startCheck([...state.selected]));
$("#stopButton").addEventListener("click", async () => {
  if (!state.activeRun) return;
  try { await Api.stop(state.activeRun.id); toast("Đã dừng xếp thêm account; account đang chạy sẽ đóng an toàn."); await loadData({ quiet: true }); }
  catch (error) { toast(error.message, "error"); }
});
$("#selectAll").addEventListener("change", event => {
  for (const account of filteredAccounts()) event.target.checked ? state.selected.add(account.id) : state.selected.delete(account.id);
  renderAccounts();
});
$("#accountSearch").addEventListener("input", renderAccounts);
$("#statusFilter").addEventListener("change", renderAccounts);
$("#historyAccount").addEventListener("change", event => renderHistory(event.target.value));
$$(`.tab`).forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
$$(`[data-go]`).forEach(button => button.addEventListener("click", () => switchView(button.dataset.go)));

switchView(location.hash.slice(1) || "overview");
connectEvents();
loadData({ quiet: true });
setInterval(() => loadData({ quiet: true }), 15000);
