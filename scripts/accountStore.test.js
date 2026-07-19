import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { deleteAccountRecords, getAccountStoreStats, importAccountBundle, listAccountRows } from './accountStore.js'
import { JobStore } from './queue/jobStore.js'

const TEST_DB_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

function withTemporaryAccountStore(run) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-account-store-test-'))
    const previousDbPath = process.env.ACCOUNTS_DB_PATH
    const previousDbKey = process.env.ACCOUNTS_DB_KEY
    process.env.ACCOUNTS_DB_PATH = path.join(tempDir, 'accounts.db')
    process.env.ACCOUNTS_DB_KEY = TEST_DB_KEY

    try {
        return run()
    } finally {
        if (previousDbPath === undefined) delete process.env.ACCOUNTS_DB_PATH
        else process.env.ACCOUNTS_DB_PATH = previousDbPath
        if (previousDbKey === undefined) delete process.env.ACCOUNTS_DB_KEY
        else process.env.ACCOUNTS_DB_KEY = previousDbKey
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
}

function seedAccounts() {
    importAccountBundle(process.cwd(), {
        proxies: [
            {
                label: 'test-proxy',
                url: '192.0.2.10',
                port: 8080,
                username: 'proxy-user',
                password: 'proxy-password'
            }
        ],
        accounts: [
            { email: 'keep@example.com', password: 'keep-secret', proxyLabel: 'test-proxy' },
            { email: 'banned@example.com', password: 'banned-secret', proxyLabel: 'test-proxy' }
        ]
    })
}

test('deleteAccountRecords permanently removes selected accounts only', () => {
    withTemporaryAccountStore(() => {
        seedAccounts()

        const result = deleteAccountRecords(process.cwd(), ['BANNED@example.com'])

        assert.equal(result.deleted, 1)
        assert.deepEqual(result.emails, ['banned@example.com'])
        assert.deepEqual(
            listAccountRows(process.cwd()).map(account => account.email),
            ['keep@example.com']
        )
        assert.equal(getAccountStoreStats(process.cwd()).permanentlyDeleted, 1)

        const reimport = importAccountBundle(process.cwd(), {
            proxies: [
                {
                    label: 'test-proxy',
                    url: '192.0.2.10',
                    port: 8080,
                    username: 'proxy-user',
                    password: 'proxy-password'
                }
            ],
            accounts: [
                { email: 'keep@example.com', password: 'keep-secret', proxyLabel: 'test-proxy' },
                { email: 'banned@example.com', password: 'banned-secret', proxyLabel: 'test-proxy' }
            ]
        })

        assert.equal(reimport.skippedDeleted, 1)
        assert.deepEqual(reimport.skippedDeletedEmails, ['banned@example.com'])
        assert.deepEqual(
            listAccountRows(process.cwd()).map(account => account.email),
            ['keep@example.com']
        )
    })
})

test('deleteAccountRecords is atomic when any requested account is missing', () => {
    withTemporaryAccountStore(() => {
        seedAccounts()

        assert.throws(
            () => deleteAccountRecords(process.cwd(), ['banned@example.com', 'missing@example.com']),
            /Account not found: missing@example.com/
        )
        assert.equal(listAccountRows(process.cwd()).length, 2)
    })
})

test('deleteAccountRecords refuses to remove an account with active queue work', () => {
    withTemporaryAccountStore(() => {
        seedAccounts()
        const store = new JobStore(process.cwd())

        try {
            store.createBatch()
            assert.throws(
                () => deleteAccountRecords(process.cwd(), ['banned@example.com']),
                /Cannot delete account\(s\) while 1 related queue job\(s\) are active/
            )
            assert.equal(listAccountRows(process.cwd()).length, 2)
        } finally {
            store.close()
        }
    })
})

test('one proxy may hold more than six accounts but still schedules one proxy lane', () => {
    withTemporaryAccountStore(() => {
        const accounts = Array.from({ length: 8 }, (_, index) => ({
            email: `bulk-${index + 1}@example.com`,
            password: 'secret',
            proxyLabel: 'bulk-proxy'
        }))

        const result = importAccountBundle(process.cwd(), {
            proxies: [{ label: 'bulk-proxy', url: '192.0.2.60', port: 8060 }],
            accounts
        })
        assert.equal(result.total, 8)
        assert.equal(listAccountRows(process.cwd()).length, 8)

        const store = new JobStore(process.cwd())
        try {
            const batch = store.createBatch({ proxyConcurrency: 1 })
            assert.equal(batch.jobs, 8)
            assert.equal(batch.routes, 1)
            assert.equal(batch.lockGroups, 1)
        } finally {
            store.close()
        }
    })
})
