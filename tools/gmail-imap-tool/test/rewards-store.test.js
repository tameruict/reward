'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const rewardsStore = require('../src/rewards-store')

test('saves, lists and removes Microsoft Rewards accounts', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-store-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

    rewardsStore.init(dir)
    const saved = rewardsStore.save({ email: ' User@Example.COM ', label: 'Main account' })
    assert.equal(saved.ok, true)
    assert.deepEqual(rewardsStore.get('user@example.com'), saved.account)
    assert.equal(rewardsStore.list().length, 1)
    assert.equal(rewardsStore.list()[0].label, 'Main account')

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'rewards-accounts.json'), 'utf8'))
    assert.equal(onDisk.version, 1)
    assert.equal(onDisk.accounts['user@example.com'].email, 'user@example.com')

    assert.equal(rewardsStore.remove('user@example.com').ok, true)
    assert.equal(rewardsStore.list().length, 0)
})
