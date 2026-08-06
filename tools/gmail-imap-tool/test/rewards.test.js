'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    REWARDS_JOIN_URL,
    normalizeRewardsEmail,
    partitionForRewards,
    openRewardsBrowser,
    clearRewardsProfile
} = require('../src/rewards')

function createMocks() {
    const profiles = new Map()
    const session = {
        fromPartition(partition) {
            if (!profiles.has(partition)) {
                profiles.set(partition, {
                    userAgent: 'Mozilla/5.0 Chrome/144.0.0.0 Electron/43.2.0',
                    getUserAgent() {
                        return this.userAgent
                    },
                    setUserAgent(value) {
                        this.userAgent = value
                    },
                    async clearStorageData() {
                        this.storageCleared = true
                    },
                    async clearCache() {
                        this.cacheCleared = true
                    }
                })
            }
            return profiles.get(partition)
        }
    }

    class BrowserWindow {
        constructor(options) {
            this.options = options
            this.destroyed = false
            this.minimized = false
            this.webContents = {
                setWindowOpenHandler: handler => {
                    this.windowOpenHandler = handler
                }
            }
            BrowserWindow.instances.push(this)
        }

        static instances = []

        on(event, handler) {
            if (event === 'closed') this.closedHandler = handler
        }

        async loadURL(url) {
            this.url = url
        }

        isDestroyed() {
            return this.destroyed
        }

        isMinimized() {
            return this.minimized
        }

        restore() {
            this.minimized = false
        }

        show() {
            this.shown = true
        }

        focus() {
            this.focused = true
        }

        destroy() {
            this.destroyed = true
            this.closedHandler?.()
        }
    }

    return { BrowserWindow, session, profiles }
}

test('normalizes account identity and creates a stable persistent partition', () => {
    assert.equal(normalizeRewardsEmail('  User@Example.COM '), 'user@example.com')
    const first = partitionForRewards('User@Example.com')
    const second = partitionForRewards(' user@example.COM ')
    assert.equal(first, second)
    assert.match(first, /^persist:ms-rewards-[a-f0-9]{24}$/)
})

test('opens Rewards in an isolated persistent Chromium profile', async () => {
    const mocks = createMocks()
    const result = await openRewardsBrowser({
        BrowserWindow: mocks.BrowserWindow,
        session: mocks.session,
        parent: null,
        account: { email: 'rewards@example.com', label: 'Rewards 1' }
    })

    assert.deepEqual(result, { ok: true, reused: false })
    const win = mocks.BrowserWindow.instances[0]
    assert.equal(win.url, REWARDS_JOIN_URL)
    assert.equal(win.options.webPreferences.partition, partitionForRewards('rewards@example.com'))
    assert.equal(win.options.webPreferences.nodeIntegration, false)
    assert.equal(win.options.webPreferences.sandbox, true)
    assert.doesNotMatch(
        mocks.profiles.get(partitionForRewards('rewards@example.com')).userAgent,
        /Electron/
    )
})

test('clears the persisted Chromium profile when an account is deleted', async () => {
    const mocks = createMocks()
    const email = 'delete-me@example.com'
    await clearRewardsProfile({ session: mocks.session, email })
    const profile = mocks.profiles.get(partitionForRewards(email))
    assert.equal(profile.storageCleared, true)
    assert.equal(profile.cacheCleared, true)
})
