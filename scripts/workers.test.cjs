const assert = require('node:assert/strict')
const test = require('node:test')

const { Workers, normaliseActivityType } = require('../dist/functions/Workers.js')
const { UrlReward } = require('../dist/functions/activities/api/UrlReward.js')

function mockBot() {
    return {
        isMobile: true,
        utils: { getFormattedDate: () => '08/08/2026' },
        logger: { info() {}, warn() {} }
    }
}

test('normalises repeated Rewards activity types', () => {
    assert.equal(normaliseActivityType('urlreward,urlreward,urlreward,urlreward'), 'urlreward')
    assert.equal(normaliseActivityType('  URLREWARD  '), 'urlreward')
})

test('Daily Set accepts ISO date keys and tasks with a live hash but no point max', async () => {
    const worker = new Workers(mockBot())
    let selected = []
    worker.solveActivities = async activities => {
        selected = activities
    }

    const task = {
        offerId: 'daily-1',
        complete: false,
        pointProgressMax: 0,
        pointProgress: 0,
        hash: 'live-hash',
        promotionType: 'urlreward,urlreward,urlreward,urlreward'
    }

    await worker.doDailySet({ dashboard: { dailySetPromotions: { '2026-08-08': [task] } } })
    assert.deepEqual(selected, [task])
})

test('More Promotions accepts activity type supplied in attributes', async () => {
    const worker = new Workers(mockBot())
    let selected = []
    worker.solveActivities = async activities => {
        selected = activities
    }

    const task = {
        offerId: 'more-1',
        complete: false,
        pointProgressMax: 0,
        pointProgress: 0,
        hash: 'live-hash',
        promotionType: '',
        attributes: { type: 'urlreward' },
        priority: 0
    }

    await worker.doMorePromotions({ dashboard: { morePromotions: [task], morePromotionsWithoutPromotionalItems: [] } })
    assert.deepEqual(selected, [task])
})

test('UrlReward falls back to the API promotion when the streamed snapshot omits it', async () => {
    const calls = []
    const bot = {
        isMobile: true,
        nextActions: { reportActivity: 'report-action' },
        reactSnapshot: { offers: [] },
        config: { skipNonPointTasks: true },
        userData: { currentPoints: 100, gainedPoints: 0, geoLocale: 'us', timezoneOffset: 0 },
        logger: { info() {}, warn() {}, debug() {}, error() {} },
        utils: { randomDelay: () => 0, wait: async () => {} },
        browser: {
            func: {
                reportServerAction: async (...args) => {
                    calls.push(args)
                    return { status: 200, acknowledged: true }
                },
                getCurrentPoints: async () => 110
            }
        }
    }

    await new UrlReward(bot).doUrlReward({
        offerId: 'daily-1',
        hash: 'api-hash',
        pointProgressMax: 10,
        activityType: '11',
        title: 'Daily task',
        promotionType: 'urlreward',
        attributes: { promotional: 'False' }
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0][1][0], 'api-hash')
    assert.equal(bot.userData.currentPoints, 110)
})
