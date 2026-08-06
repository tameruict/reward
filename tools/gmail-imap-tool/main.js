'use strict'

const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('node:path')

const store = require('./src/store')
const { activateAccount, openImapSettings } = require('./src/activate')
const { GmailReader } = require('./src/imap')
const { normalizeProxy } = require('./src/proxy')
const rewardsStore = require('./src/rewards-store')
const { openRewardsBrowser, clearRewardsProfile } = require('./src/rewards')

let mainWindow = null

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1140,
        height: 780,
        minWidth: 900,
        minHeight: 600,
        title: 'Gmail IMAP Tool',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(() => {
    store.init(app.getPath('userData'))
    rewardsStore.init(app.getPath('userData'))
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// Resolve the app password for a request: prefer an explicitly supplied one,
// otherwise look it up (decrypted) from the local store. Never returned to the UI.
function resolveConnection(email, appPassword, proxy) {
    const saved = store.getAccount(email)
    const pass = appPassword ? String(appPassword).replace(/\s+/g, '') : saved?.appPassword
    return {
        pass: pass || null,
        proxy: proxy === undefined ? saved?.proxy || null : normalizeProxy(proxy)
    }
}

async function withReader(email, appPassword, proxy, fn) {
    let connection
    try {
        connection = resolveConnection(email, appPassword, proxy)
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    const { pass, proxy: resolvedProxy } = connection
    if (!email || !pass) return { ok: false, error: 'Thiếu email hoặc App Password.' }
    const reader = new GmailReader({ user: email, pass, proxy: resolvedProxy })
    try {
        await reader.connect()
        return { ok: true, ...(await fn(reader)) }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
        await reader.close()
    }
}

// ---- Account store ----
ipcMain.handle('accounts:list', () => store.list())
ipcMain.handle('accounts:delete', (_e, email) => store.remove(email))
ipcMain.handle('accounts:save', (_e, payload) => store.saveAccount(payload))
ipcMain.handle('accounts:clearProxy', (_e, email) => store.clearProxy(email))

// ---- Microsoft Rewards ----
ipcMain.handle('rewards:listAccounts', () => rewardsStore.list())
ipcMain.handle('rewards:saveAccount', (_e, payload) => rewardsStore.save(payload))
ipcMain.handle('rewards:open', (_e, { email }) => {
    const account = rewardsStore.get(email)
    return openRewardsBrowser({ BrowserWindow, session, parent: mainWindow, account })
})
ipcMain.handle('rewards:deleteAccount', async (_e, email) => {
    const removed = rewardsStore.remove(email)
    if (!removed.ok) return removed
    try {
        await clearRewardsProfile({ session, email })
        return { ok: true }
    } catch (err) {
        return {
            ok: true,
            warning: `Đã xoá account nhưng không thể dọn toàn bộ phiên Chromium: ${
                err instanceof Error ? err.message : String(err)
            }`
        }
    }
})

// ---- Activation (semi-automatic) ----
ipcMain.handle('activate:start', async (_e, { email, proxy }) => {
    let normalizedProxy
    try {
        normalizedProxy = normalizeProxy(proxy)
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    const result = await activateAccount({
        email,
        parent: mainWindow,
        onStatus: s => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('activate:status', s)
        }
    })
    if (result.ok && result.appPassword && email) {
        const saved = store.saveAccount({ email, appPassword: result.appPassword, proxy: normalizedProxy })
        if (!saved.ok) return saved
    }
    return result
})

ipcMain.handle('activate:openImapSettings', (_e, { email }) => openImapSettings({ email, parent: mainWindow }))

// ---- IMAP reading ----
ipcMain.handle('imap:list', (_e, { email, appPassword, proxy, limit, unread, from }) =>
    withReader(email, appPassword, proxy, async reader => ({
        messages: await reader.list({ limit: Number(limit) || 25, unread: Boolean(unread), from: from || undefined })
    }))
)

ipcMain.handle('imap:read', (_e, { email, appPassword, proxy, uid }) =>
    withReader(email, appPassword, proxy, async reader => ({ message: await reader.read(uid) }))
)

ipcMain.handle('imap:otp', (_e, { email, appPassword, proxy, minutes, any }) =>
    withReader(email, appPassword, proxy, async reader => ({
        hit: await reader.otp({ minutes: Number(minutes) || 10, ...(any ? { from: null } : {}) })
    }))
)

ipcMain.handle('imap:verify', (_e, { email, appPassword, proxy }) =>
    withReader(email, appPassword, proxy, async reader => ({ mailboxes: await reader.listMailboxes() }))
)
