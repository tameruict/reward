import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { default: BrowserFunc, RewardsAuthenticationRequiredError } = require('../dist/browser/BrowserFunc.js')
const { Login } = require('../dist/browser/auth/Login.js')

function createBot() {
    const warnings = []
    const errors = []

    return {
        bot: {
            isMobile: true,
            logger: {
                info: () => {},
                debug: () => {},
                warn: (...args) => warnings.push(args),
                error: (...args) => errors.push(args)
            },
            utils: {
                wait: async () => {}
            }
        },
        warnings,
        errors
    }
}

test('Rewards dashboard bootstrap accepts usable HTML when DOMContentLoaded is delayed', async () => {
    const { bot, warnings } = createBot()
    const browserFunc = new BrowserFunc(bot)
    const html = `<html><body>${'x'.repeat(1100)}</body></html>`
    let gotoOptions

    const page = {
        goto: async (url, options) => {
            assert.equal(url, 'https://rewards.bing.com/dashboard')
            gotoOptions = options
            return { status: () => 200 }
        },
        waitForLoadState: async () => {
            throw new Error('DOMContentLoaded timeout')
        },
        url: () => 'https://rewards.bing.com/dashboard',
        content: async () => html,
        isClosed: () => false,
        evaluate: async () => {}
    }

    const result = await browserFunc.loadRewardsDashboardPage(page, 60000)

    assert.equal(result, html)
    assert.equal(gotoOptions.waitUntil, 'commit')
    assert.equal(gotoOptions.timeout, 60000)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0][2], /continuing with usable HTML/)
})

test('Rewards dashboard bootstrap retries transient navigation failures and keeps the final cause', async () => {
    const { bot, warnings } = createBot()
    const browserFunc = new BrowserFunc(bot)
    const originalError = new Error('proxy connection timed out')
    let attempts = 0
    let stops = 0

    const page = {
        goto: async () => {
            attempts++
            throw originalError
        },
        url: () => 'about:blank',
        isClosed: () => false,
        evaluate: async () => {
            stops++
        }
    }

    await assert.rejects(
        () => browserFunc.loadRewardsDashboardPage(page, 60000),
        error => {
            assert.match(error.message, /could not be loaded after 3 attempts/)
            assert.match(error.message, /proxy connection timed out/)
            assert.equal(error.cause, originalError)
            return true
        }
    )

    assert.equal(attempts, 3)
    assert.equal(stops, 2)
    assert.equal(warnings.length, 2)
})

test('Rewards dashboard bootstrap stops immediately on OAuth redirect and redacts sensitive URL data', async () => {
    const { bot, warnings } = createBot()
    const browserFunc = new BrowserFunc(bot)
    const oauthUrl =
        'https://login.live.com/oauth20_authorize.srf?state=sensitive-state&code_challenge=sensitive-challenge#fragment'
    let attempts = 0
    let stops = 0

    const page = {
        goto: async () => {
            attempts++
            return { status: () => 200 }
        },
        waitForLoadState: async () => {},
        url: () => oauthUrl,
        isClosed: () => false,
        evaluate: async () => {
            stops++
        }
    }

    await assert.rejects(
        () => browserFunc.loadRewardsDashboardPage(page, 60000),
        error => {
            assert.ok(error instanceof RewardsAuthenticationRequiredError)
            assert.equal(error.destination, 'login.live.com/oauth20_authorize.srf')
            assert.doesNotMatch(error.message, /sensitive-state|sensitive-challenge|fragment/)
            return true
        }
    )

    assert.equal(attempts, 1)
    assert.equal(stops, 0)
    assert.equal(warnings.length, 1)
    assert.doesNotMatch(JSON.stringify(warnings), /sensitive-state|sensitive-challenge|fragment/)
})

test('recoverable OAuth redirects do not emit a false bootstrap error', async () => {
    const { bot, errors } = createBot()
    bot.config = { globalTimeout: '60sec' }
    bot.utils.stringToNumber = () => 60000
    bot.browser = { react: {} }
    const browserFunc = new BrowserFunc(bot)
    const oauthError = new RewardsAuthenticationRequiredError(
        'https://login.live.com/oauth20_authorize.srf?state=secret'
    )
    browserFunc.loadRewardsDashboardPage = async () => {
        throw oauthError
    }

    await assert.rejects(
        () => browserFunc.bootstrap({}),
        error => error === oauthError
    )
    assert.equal(errors.length, 0)
})

test('Rewards session resumes the Microsoft login flow once after an OAuth redirect', async () => {
    const { bot, warnings } = createBot()
    let bootstrapAttempts = 0
    let recoveryAttempts = 0

    bot.nextActions = {}
    bot.reactSnapshot = { reportable: [], offers: [], account: { availablePoints: 0 } }
    bot.browser = {
        func: {
            bootstrap: async () => {
                bootstrapAttempts++
                if (bootstrapAttempts === 1) {
                    throw new RewardsAuthenticationRequiredError(
                        'https://login.live.com/oauth20_authorize.srf?state=secret'
                    )
                }
            }
        },
        utils: {
            checkSuspendedAccount: async () => false
        }
    }

    const login = new Login(bot)
    login.runLoginStateMachine = async (_page, _account, phase) => {
        recoveryAttempts++
        assert.equal(phase, 'Rewards OAuth recovery')
    }

    await login.getRewardsSession({}, { email: 'account@example.com' })

    assert.equal(bootstrapAttempts, 2)
    assert.equal(recoveryAttempts, 1)
    assert.match(warnings[0][2], /resuming Microsoft login flow once/)
    assert.doesNotMatch(JSON.stringify(warnings), /state=secret/)
})

test('Rewards session stops after one unsuccessful OAuth recovery', async () => {
    const { bot } = createBot()
    let bootstrapAttempts = 0
    let recoveryAttempts = 0

    bot.browser = {
        func: {
            bootstrap: async () => {
                bootstrapAttempts++
                throw new RewardsAuthenticationRequiredError(
                    'https://login.live.com/oauth20_authorize.srf?state=secret'
                )
            }
        }
    }

    const login = new Login(bot)
    login.runLoginStateMachine = async () => {
        recoveryAttempts++
    }

    await assert.rejects(
        () => login.getRewardsSession({}, { email: 'account@example.com' }),
        /Rewards authentication loop detected/
    )

    assert.equal(bootstrapAttempts, 2)
    assert.equal(recoveryAttempts, 1)
})

test('Closing an unverified browser context does not persist its partial OAuth session', async () => {
    const { bot, warnings } = createBot()
    const browserFunc = new BrowserFunc(bot)
    let storageStateReads = 0
    let closes = 0
    const context = {
        browser: () => null,
        storageState: async () => {
            storageStateReads++
            return { cookies: [], origins: [] }
        },
        close: async () => {
            closes++
        }
    }

    await browserFunc.closeBrowser(context, 'account@example.com', false)

    assert.equal(storageStateReads, 0)
    assert.equal(closes, 1)
    assert.match(warnings[0][2], /Skipping session save/)
})

test('Rewards session logging rethrows the original error instead of undefined', async () => {
    const { bot, errors } = createBot()
    const originalError = new Error('page.goto: Timeout 30000ms exceeded')
    bot.browser = {
        func: {
            bootstrap: async () => {
                throw originalError
            }
        }
    }

    const login = new Login(bot)

    await assert.rejects(
        () => login.getRewardsSession({}, { email: 'account@example.com' }),
        error => error === originalError
    )
    assert.equal(errors.length, 1)
    assert.match(errors[0][2], /Timeout 30000ms exceeded/)
})
