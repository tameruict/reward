'use strict'

const $ = sel => document.querySelector(sel)
const $$ = sel => Array.from(document.querySelectorAll(sel))

// ---------------- Tabs ----------------
$$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.tab').forEach(b => b.classList.remove('active'))
        $$('.panel').forEach(p => p.classList.remove('active'))
        btn.classList.add('active')
        $(`#tab-${btn.dataset.tab}`).classList.add('active')
        if (btn.dataset.tab === 'inbox') refreshAccountSelect()
    })
})

function fmtDate(d) {
    if (!d) return ''
    const dt = new Date(d)
    if (isNaN(dt)) return ''
    const p = n => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`
}

function setMsg(el, text, kind) {
    el.textContent = text || ''
    el.className = 'inline-msg' + (kind ? ' ' + kind : '')
}

// ---------------- Accounts ----------------
async function renderAccounts() {
    const accounts = await window.api.listAccounts()
    const box = $('#acc-list')
    box.innerHTML = ''
    if (!accounts.length) {
        box.innerHTML = '<div class="muted">Chưa có tài khoản nào.</div>'
        return
    }

    for (const account of accounts) {
        const item = document.createElement('div')
        item.className = 'acc-item'

        const meta = document.createElement('div')
        meta.className = 'acc-meta'
        const email = document.createElement('span')
        email.textContent = account.email
        const lock = document.createElement('span')
        lock.className = 'lock'
        lock.textContent = account.encrypted ? '🔒 mã hoá' : '⚠ chưa mã hoá'
        if (!account.encrypted) lock.style.color = 'var(--warn)'
        meta.append(email, lock)

        if (account.hasProxy) {
            const proxy = document.createElement('span')
            proxy.className = 'proxy-badge'
            proxy.textContent = `Proxy: ${account.proxyDisplay}`
            meta.append(proxy)
        }

        const actions = document.createElement('div')
        actions.className = 'acc-actions'

        const useBtn = document.createElement('button')
        useBtn.className = 'ghost small'
        useBtn.textContent = 'Đọc inbox'
        useBtn.onclick = async () => {
            $('.tab[data-tab="inbox"]').click()
            await refreshAccountSelect()
            $('#inbox-account').value = account.email
            onAccountChange()
            loadInbox()
        }

        const edit = document.createElement('button')
        edit.className = 'ghost small'
        edit.textContent = 'Cập nhật'
        edit.onclick = () => {
            $('#man-email').value = account.email
            $('#man-pw').value = ''
            $('#man-proxy').value = ''
            $('#man-email').focus()
            setMsg(
                $('#man-msg'),
                'Nhập App Password mới nếu muốn đổi; proxy trống sẽ chuyển sang kết nối trực tiếp.',
                'warn'
            )
        }

        const clearProxy = document.createElement('button')
        clearProxy.className = 'ghost small'
        clearProxy.textContent = 'Bỏ proxy'
        clearProxy.classList.toggle('hidden', !account.hasProxy)
        clearProxy.onclick = async () => {
            const res = await window.api.clearAccountProxy(account.email)
            if (!res.ok) {
                setMsg($('#man-msg'), 'Lỗi: ' + (res.error || 'không rõ'), 'err')
                return
            }
            await Promise.all([renderAccounts(), refreshAccountSelect()])
        }

        const del = document.createElement('button')
        del.className = 'ghost small'
        del.textContent = 'Xoá'
        del.onclick = async () => {
            if (!confirm(`Xoá account ${account.email}?`)) return
            await window.api.deleteAccount(account.email)
            await Promise.all([renderAccounts(), refreshAccountSelect()])
        }

        actions.append(useBtn, edit, clearProxy, del)
        item.append(meta, actions)
        box.append(item)
    }
}

// ---------------- Tab 1: Activation ----------------
window.api.onActivateStatus(status => {
    const el = $('#act-status')
    el.classList.remove('hidden')
    el.textContent = status
})

$('#act-start').addEventListener('click', async () => {
    const email = $('#act-email').value.trim()
    const proxy = $('#act-proxy').value.trim()
    if (!email) {
        $('#act-status').classList.remove('hidden')
        $('#act-status').textContent = 'Hãy nhập địa chỉ Gmail trước.'
        return
    }
    $('#act-result').classList.add('hidden')
    $('#act-status').classList.remove('hidden')
    $('#act-status').textContent = 'Đang mở cửa sổ đăng nhập…'
    $('#act-start').disabled = true
    try {
        const res = await window.api.activate(email, proxy)
        if (res.ok) {
            $('#act-pw').textContent = res.display || res.appPassword
            $('#act-saved').textContent = `— đã lưu cho ${email}${proxy ? ' kèm proxy' : ''}`
            $('#act-result').classList.remove('hidden')
            $('#act-status').textContent = '✓ Hoàn tất.'
            await Promise.all([renderAccounts(), refreshAccountSelect()])
        } else {
            $('#act-status').textContent = res.cancelled
                ? 'Đã huỷ (cửa sổ đóng trước khi lấy được mã).'
                : 'Lỗi: ' + (res.error || 'không rõ')
        }
    } finally {
        $('#act-start').disabled = false
    }
})

$('#act-imap').addEventListener('click', () => {
    const email = $('#act-email').value.trim()
    window.api.openImapSettings(email)
})

$('#act-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#act-pw').textContent.replace(/\s+/g, ''))
    $('#act-copy').textContent = 'Đã copy'
    setTimeout(() => ($('#act-copy').textContent = 'Copy'), 1500)
})

$('#man-save').addEventListener('click', async () => {
    const email = $('#man-email').value.trim()
    const appPassword = $('#man-pw').value.trim()
    const proxy = $('#man-proxy').value.trim()
    if (!email) {
        setMsg($('#man-msg'), 'Nhập email trước.', 'err')
        return
    }

    const res = await window.api.saveAccount({ email, appPassword, proxy })
    if (!res.ok) {
        setMsg($('#man-msg'), 'Lỗi: ' + (res.error || 'không rõ'), 'err')
        return
    }

    setMsg($('#man-msg'), `✓ Đã lưu account ${res.account.email}${res.account.hasProxy ? ' kèm proxy' : ''}.`, 'ok')
    $('#man-pw').value = ''
    await Promise.all([renderAccounts(), refreshAccountSelect()])
})

// ---------------- Microsoft Rewards ----------------
async function refreshRewardsAccounts(preferredEmail) {
    const accounts = await window.api.listRewardsAccounts()
    const select = $('#rewards-account')
    const previous = preferredEmail || select.value
    select.innerHTML = ''

    if (!accounts.length) {
        const empty = document.createElement('option')
        empty.value = ''
        empty.textContent = 'Chưa có account Rewards'
        select.append(empty)
        $('#rewards-open').disabled = true
        $('#rewards-delete').disabled = true
        return
    }

    for (const account of accounts) {
        const option = document.createElement('option')
        option.value = account.email
        option.textContent = account.label ? `${account.label} — ${account.email}` : account.email
        select.append(option)
    }
    if (previous && [...select.options].some(option => option.value === previous)) select.value = previous
    $('#rewards-open').disabled = false
    $('#rewards-delete').disabled = false
}

$('#rewards-save').addEventListener('click', async () => {
    const email = $('#rewards-email').value.trim()
    const label = $('#rewards-label').value.trim()
    if (!email) {
        setMsg($('#rewards-msg'), 'Nhập email Microsoft trước.', 'err')
        return
    }

    const res = await window.api.saveRewardsAccount({ email, label })
    if (!res.ok) {
        setMsg($('#rewards-msg'), 'Lỗi: ' + (res.error || 'không rõ'), 'err')
        return
    }

    await refreshRewardsAccounts(res.account.email)
    $('#rewards-email').value = ''
    $('#rewards-label').value = ''
    setMsg($('#rewards-msg'), `✓ Đã lưu account ${res.account.email}.`, 'ok')
})

$('#rewards-open').addEventListener('click', async () => {
    const button = $('#rewards-open')
    const email = $('#rewards-account').value
    if (!email) {
        setMsg($('#rewards-msg'), 'Hãy lưu và chọn account trước.', 'err')
        return
    }
    button.disabled = true
    setMsg($('#rewards-msg'), 'Đang mở Chromium…', 'warn')
    try {
        const res = await window.api.openRewards(email)
        setMsg(
            $('#rewards-msg'),
            res.ok
                ? `✓ Đã mở Chromium cho ${email}. Phiên đăng nhập sẽ được giữ lại.`
                : 'Lỗi: ' + (res.error || 'không rõ'),
            res.ok ? 'ok' : 'err'
        )
    } finally {
        button.disabled = false
    }
})

$('#rewards-delete').addEventListener('click', async () => {
    const email = $('#rewards-account').value
    if (!email || !confirm(`Xoá account Rewards ${email} và phiên Chromium đã lưu?`)) return

    const res = await window.api.deleteRewardsAccount(email)
    if (!res.ok) {
        setMsg($('#rewards-msg'), 'Lỗi: ' + (res.error || 'không rõ'), 'err')
        return
    }
    await refreshRewardsAccounts()
    setMsg($('#rewards-msg'), res.warning || `✓ Đã xoá account ${email} và phiên Chromium.`, res.warning ? 'warn' : 'ok')
})

// ---------------- Tab 2: Inbox ----------------
const MANUAL = '__manual__'
let currentMessages = []

async function refreshAccountSelect() {
    const accounts = await window.api.listAccounts()
    const sel = $('#inbox-account')
    const prev = sel.value
    sel.innerHTML = ''
    for (const account of accounts) {
        const opt = document.createElement('option')
        opt.value = account.email
        opt.textContent = account.hasProxy ? `${account.email} • proxy` : account.email
        sel.append(opt)
    }
    const manual = document.createElement('option')
    manual.value = MANUAL
    manual.textContent = '➕ Nhập tay…'
    sel.append(manual)
    if (prev && [...sel.options].some(option => option.value === prev)) sel.value = prev
    onAccountChange()
}

function onAccountChange() {
    const isManual = $('#inbox-account').value === MANUAL
    $('#inbox-email').classList.toggle('hidden', !isManual)
    $('#inbox-pw').classList.toggle('hidden', !isManual)
    $('#inbox-proxy').classList.toggle('hidden', !isManual)
    $('#inbox-save').classList.toggle('hidden', !isManual)
}
$('#inbox-account').addEventListener('change', onAccountChange)

function currentCreds() {
    const selected = $('#inbox-account').value
    if (selected === MANUAL) {
        return {
            email: $('#inbox-email').value.trim(),
            appPassword: $('#inbox-pw').value.trim(),
            proxy: $('#inbox-proxy').value.trim()
        }
    }
    return { email: selected } // password and proxy are resolved in the main process
}

$('#inbox-save').addEventListener('click', async () => {
    const creds = currentCreds()
    if (!creds.email || !creds.appPassword) {
        setMsg($('#inbox-msg'), 'Account mới cần email và App Password.', 'err')
        return
    }

    const res = await window.api.saveAccount(creds)
    if (!res.ok) {
        setMsg($('#inbox-msg'), 'Lỗi lưu account: ' + (res.error || 'không rõ'), 'err')
        return
    }

    await Promise.all([renderAccounts(), refreshAccountSelect()])
    $('#inbox-account').value = res.account.email
    onAccountChange()
    setMsg($('#inbox-msg'), `✓ Đã lưu account ${res.account.email}.`, 'ok')
})

async function loadInbox() {
    const { email, appPassword, proxy } = currentCreds()
    if (!email) {
        setMsg($('#inbox-msg'), 'Chọn hoặc nhập tài khoản.', 'err')
        return
    }
    setMsg($('#inbox-msg'), 'Đang kết nối & tải…', 'warn')
    $('#inbox-load').disabled = true
    try {
        const res = await window.api.listInbox({
            email,
            appPassword,
            proxy,
            limit: $('#inbox-limit').value,
            unread: $('#inbox-unread').checked,
            from: $('#inbox-from').value.trim()
        })
        if (!res.ok) {
            setMsg($('#inbox-msg'), 'Lỗi: ' + res.error, 'err')
            return
        }
        currentMessages = res.messages || []
        renderMailList()
        setMsg($('#inbox-msg'), `✓ ${currentMessages.length} mail.`, 'ok')
    } finally {
        $('#inbox-load').disabled = false
    }
}
$('#inbox-load').addEventListener('click', loadInbox)

function renderMailList() {
    const tbody = $('#mail-rows')
    tbody.innerHTML = ''
    $('#mail-empty').classList.toggle('hidden', currentMessages.length > 0)
    for (const message of currentMessages) {
        const tr = document.createElement('tr')
        if (!message.seen) tr.classList.add('unread')
        tr.dataset.uid = message.uid
        tr.innerHTML =
            `<td class="col-date">${fmtDate(message.date)}</td>` +
            `<td class="col-from">${escapeHtml(message.from)}</td>` +
            `<td>${escapeHtml(message.subject)}</td>`
        tr.addEventListener('click', () => openMessage(message.uid, tr))
        tbody.append(tr)
    }
}

async function openMessage(uid, tr) {
    $$('#mail-rows tr').forEach(row => row.classList.remove('selected'))
    tr.classList.add('selected')
    const { email, appPassword, proxy } = currentCreds()
    setMsg($('#inbox-msg'), 'Đang tải nội dung…', 'warn')
    const res = await window.api.readMessage({ email, appPassword, proxy, uid })
    if (!res.ok || !res.message) {
        setMsg($('#inbox-msg'), 'Lỗi đọc mail: ' + (res.error || 'không tìm thấy'), 'err')
        return
    }
    setMsg($('#inbox-msg'), '', '')
    const message = res.message
    $('#view-empty').classList.add('hidden')
    $('#view-body').classList.remove('hidden')
    $('#view-subject').textContent = message.subject
    $('#view-meta').textContent = `${message.from}  •  ${fmtDate(message.date)}`

    $('#view-text').textContent = message.text || '(không có nội dung text)'
    const iframe = $('#view-html')
    const hasHtml = Boolean(message.html)
    $('#view-toggle').classList.toggle('hidden', !hasHtml)
    $('#view-toggle').textContent = 'Xem HTML'
    $('#view-text').classList.remove('hidden')
    iframe.classList.add('hidden')
    iframe.srcdoc = hasHtml ? message.html : ''
}

$('#view-toggle').addEventListener('click', () => {
    const showingHtml = !$('#view-html').classList.contains('hidden')
    $('#view-html').classList.toggle('hidden', showingHtml)
    $('#view-text').classList.toggle('hidden', !showingHtml)
    $('#view-toggle').textContent = showingHtml ? 'Xem HTML' : 'Xem text'
})

$('#inbox-otp').addEventListener('click', async () => {
    const { email, appPassword, proxy } = currentCreds()
    if (!email) {
        setMsg($('#inbox-msg'), 'Chọn hoặc nhập tài khoản.', 'err')
        return
    }
    setMsg($('#inbox-msg'), 'Đang tìm mã OTP…', 'warn')
    const res = await window.api.getOtp({ email, appPassword, proxy, minutes: 15 })
    if (!res.ok) {
        setMsg($('#inbox-msg'), 'Lỗi: ' + res.error, 'err')
        return
    }
    if (!res.hit) {
        setMsg($('#inbox-msg'), 'Không tìm thấy mã OTP nào (15 phút gần đây).', 'warn')
        return
    }
    setMsg($('#inbox-msg'), `✓ Mã: ${res.hit.code}  —  ${res.hit.subject}`, 'ok')
    try {
        await navigator.clipboard.writeText(res.hit.code)
    } catch {
        /* ignore */
    }
})

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(
        /[&<>"']/g,
        char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    )
}

// ---------------- Init ----------------
renderAccounts()
refreshAccountSelect()
refreshRewardsAccounts()
