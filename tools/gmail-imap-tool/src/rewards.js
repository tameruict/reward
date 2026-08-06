'use strict'

const crypto = require('node:crypto')

const REWARDS_JOIN_URL = 'https://rewards.bing.com/welcome?rh=6U50lXzSzO4&ref=rafsrchae'

const rewardsWindows = new Map()

function normalizeRewardsEmail(email) {
    return String(email || '').trim().toLowerCase()
}

function partitionForRewards(email) {
    const normalized = normalizeRewardsEmail(email)
    const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24)
    return `persist:ms-rewards-${digest}`
}

async function openRewardsBrowser({ BrowserWindow, session, parent, account }) {
    const email = normalizeRewardsEmail(account?.email)
    if (!email) return { ok: false, error: 'Hãy chọn account Microsoft Rewards.' }

    const existing = rewardsWindows.get(email)
    if (existing && !existing.isDestroyed()) {
        if (existing.isMinimized()) existing.restore()
        existing.show()
        existing.focus()
        return { ok: true, reused: true }
    }

    const partition = partitionForRewards(email)
    const profile = session.fromPartition(partition)
    try {
        // Keep Chromium's real version while removing the Electron marker that
        // can trigger unsupported-browser checks during Microsoft sign-in.
        profile.setUserAgent(profile.getUserAgent().replace(/\sElectron\/[\d.]+/i, ''))
    } catch {
        /* best effort */
    }

    let win
    try {
        win = new BrowserWindow({
            width: 1180,
            height: 860,
            minWidth: 900,
            minHeight: 650,
            parent: parent || undefined,
            title: `Microsoft Rewards — ${account.label || email}`,
            autoHideMenuBar: true,
            webPreferences: {
                partition,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true
            }
        })
        rewardsWindows.set(email, win)
        win.on('closed', () => rewardsWindows.delete(email))

        // Login flows may open a child window. Keep it in the same persistent
        // Chromium profile so authentication cookies are not lost.
        win.webContents.setWindowOpenHandler(() => ({
            action: 'allow',
            overrideBrowserWindowOptions: {
                parent: win,
                autoHideMenuBar: true,
                webPreferences: {
                    partition,
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true
                }
            }
        }))

        await win.loadURL(REWARDS_JOIN_URL)
        return { ok: true, reused: false }
    } catch (err) {
        rewardsWindows.delete(email)
        if (win && !win.isDestroyed()) win.destroy()
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
}

async function clearRewardsProfile({ session, email }) {
    const normalized = normalizeRewardsEmail(email)
    const existing = rewardsWindows.get(normalized)
    if (existing && !existing.isDestroyed()) existing.destroy()
    rewardsWindows.delete(normalized)

    const profile = session.fromPartition(partitionForRewards(normalized))
    await profile.clearStorageData()
    await profile.clearCache()
}

module.exports = {
    REWARDS_JOIN_URL,
    normalizeRewardsEmail,
    partitionForRewards,
    openRewardsBrowser,
    clearRewardsProfile
}
