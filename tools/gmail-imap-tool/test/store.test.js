'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const store = require('../src/store')

test('migrates v1 accounts and persists account-specific proxy data', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-imap-store-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

    const legacyPassword = 'abcdefghijklmnop'
    fs.writeFileSync(
        path.join(dir, 'accounts.json'),
        JSON.stringify({
            'OLD@EXAMPLE.COM': { v: 'plain', data: Buffer.from(legacyPassword).toString('base64') }
        })
    )

    store.init(dir)
    assert.deepEqual(store.getAccount('old@example.com'), {
        email: 'old@example.com',
        appPassword: legacyPassword,
        proxy: null
    })

    const saved = store.saveAccount({
        email: 'New@Example.com',
        appPassword: 'abcd efgh ijkl mnop',
        proxy: 'proxy.example:8080:user:secret'
    })
    assert.equal(saved.ok, true)
    assert.equal(saved.account.email, 'new@example.com')
    assert.equal(saved.account.hasProxy, true)
    assert.equal(saved.account.proxyDisplay, 'http://proxy.example:8080 • có xác thực')
    assert.equal(store.getAccount('new@example.com').appPassword, 'abcdefghijklmnop')
    assert.equal(store.getAccount('new@example.com').proxy, 'http://user:secret@proxy.example:8080/')

    assert.equal(store.clearProxy('new@example.com').ok, true)
    assert.equal(store.getAccount('new@example.com').proxy, null)

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'))
    assert.equal(onDisk.version, 2)
    assert.ok(onDisk.accounts['old@example.com'])
    assert.ok(onDisk.accounts['new@example.com'])
})
