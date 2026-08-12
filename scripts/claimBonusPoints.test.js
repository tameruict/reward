import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { ClaimBonusPoints } = require('../dist/functions/activities/api/ClaimBonusPoints.js')

function createBot({ balances, responses, actionId = 'claim-action' }) {
    let balanceIndex = 0
    let responseIndex = 0
    const logs = { info: [], warn: [], error: [], debug: [] }

    return {
        bot: {
            isMobile: false,
            nextActions: actionId ? { reportClaimAllPoints: actionId } : {},
            userData: { geoLocale: 'us', currentPoints: balances[0], gainedPoints: 0 },
            browser: {
                func: {
                    reportServerAction: async (actualActionId, body) => {
                        assert.equal(actualActionId, actionId)
                        assert.deepEqual(body, [])
                        return responses[responseIndex++]
                    },
                    getCurrentPoints: async () => balances[++balanceIndex]
                }
            },
            utils: {
                randomDelay: () => 0,
                wait: async () => {}
            },
            logger: Object.fromEntries(
                Object.keys(logs).map(level => [level, (...args) => logs[level].push(args)])
            )
        },
        logs
    }
}

test('Ready to claim drain repeats until every points bucket is exhausted', async () => {
    const { bot, logs } = createBot({
        balances: [100, 130, 150, 150],
        responses: [
            { status: 200, acknowledged: true },
            { status: 200, acknowledged: true },
            { status: 200, acknowledged: true }
        ]
    })

    const result = await new ClaimBonusPoints(bot).claimBonusPoints()

    assert.deepEqual(result, { attempts: 3, acknowledged: 3, pointsGained: 50, exhausted: true })
    assert.equal(bot.userData.currentPoints, 150)
    assert.equal(bot.userData.gainedPoints, 50)
    assert.ok(logs.info.some(entry => /Ready to claim exhausted/.test(entry[2])))
})

test('Ready to claim drain stops when the server does not acknowledge the request', async () => {
    const { bot } = createBot({
        balances: [200, 200],
        responses: [{ status: 200, acknowledged: false }]
    })

    const result = await new ClaimBonusPoints(bot).claimBonusPoints()

    assert.deepEqual(result, { attempts: 1, acknowledged: 0, pointsGained: 0, exhausted: true })
})

test('Ready to claim drain stays idle when the action id is unavailable', async () => {
    const { bot, logs } = createBot({ balances: [300], responses: [], actionId: '' })

    const result = await new ClaimBonusPoints(bot).claimBonusPoints()

    assert.deepEqual(result, { attempts: 0, acknowledged: 0, pointsGained: 0, exhausted: false })
    assert.equal(logs.warn.length, 1)
})
