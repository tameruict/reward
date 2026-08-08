import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import {
    assignAccountProxy,
    deleteAccountRecords,
    deleteProxyRecord,
    getAccountStoreStats,
    importAccountBundle,
    listAccountRows,
    listManagedAccountRows,
    listProxyRows,
    setProxyStatus
} from './accounts/store.js'
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

test('importAccountBundle stores full proxy URLs with embedded credentials', () => {
    withTemporaryAccountStore(() => {
        importAccountBundle(process.cwd(), {
            proxies: [{ label: 'full-url-proxy', url: 'http://tam:tam317@14.224.225.129:28682' }],
            accounts: [{ email: 'full-url@example.com', password: 'secret', proxyLabel: 'full-url-proxy' }]
        })

        const db = new DatabaseSync(process.env.ACCOUNTS_DB_PATH, { readOnly: true })
        try {
            const proxy = db.prepare('SELECT url, port, username FROM proxies WHERE label = ?').get('full-url-proxy')

            assert.equal(proxy.url, 'http://tam:tam317@14.224.225.129:28682')
            assert.equal(proxy.port, 28682)
            assert.equal(proxy.username, 'tam')
        } finally {
            db.close()
        }
    })
})

test('pipe-style imports distribute accounts without proxy fields across active stored proxies', () => {
    withTemporaryAccountStore(() => {
        importAccountBundle(process.cwd(), {
            proxies: [
                { label: 'auto-proxy-a', url: '192.0.2.71', port: 8071 },
                { label: 'auto-proxy-b', url: '192.0.2.72', port: 8072 }
            ],
            accounts: [{ email: 'seed@example.com', password: 'seed-secret', proxyLabel: 'auto-proxy-a' }]
        })

        const result = importAccountBundle(process.cwd(), {
            autoAssignStoredProxies: true,
            accounts: [
                { email: 'pipe-one@example.com', password: 'pipe-one-secret' },
                { email: 'pipe-two@example.com', password: 'pipe-two-secret' }
            ]
        })

        assert.equal(result.inserted, 2)
        const db = new DatabaseSync(process.env.ACCOUNTS_DB_PATH, { readOnly: true })
        try {
            const imported = db
                .prepare(
                    `
                    SELECT a.email, p.label AS proxy
                    FROM accounts a
                    JOIN proxies p ON p.id = a.proxy_id
                    WHERE a.email LIKE 'pipe-%'
                    ORDER BY a.email
                `
                )
                .all()
            assert.equal(imported.length, 2)
            assert.ok(imported.every(account => account.proxy))
            assert.equal(new Set(imported.map(account => account.proxy)).size, 2)
        } finally {
            db.close()
        }
    })
})

test('explicit direct mode imports and schedules accounts without a proxy', () => {
    withTemporaryAccountStore(() => {
        const result = importAccountBundle(process.cwd(), {
            allowDirectAccounts: true,
            accounts: [
                {
                    email: 'direct@example.com',
                    password: 'direct-secret',
                    useProxy: false
                }
            ]
        })

        assert.equal(result.inserted, 1)
        assert.equal(getAccountStoreStats(process.cwd()).readyAccounts, 1)
        assert.equal(listAccountRows(process.cwd())[0].proxy, 'DIRECT')

        const db = new DatabaseSync(process.env.ACCOUNTS_DB_PATH, { readOnly: true })
        try {
            const account = db
                .prepare('SELECT proxy_id, use_proxy FROM accounts WHERE email = ?')
                .get('direct@example.com')
            assert.equal(account.proxy_id, null)
            assert.equal(account.use_proxy, 0)
        } finally {
            db.close()
        }

        const store = new JobStore(process.cwd())
        try {
            const batch = store.createBatch()
            assert.equal(batch.jobs, 1)
            assert.equal(batch.routes, 1)
            assert.equal(batch.lockGroups, 1)
        } finally {
            store.close()
        }
    })
})

test('lists safe management rows and can reassign or detach an account proxy', () => {
    withTemporaryAccountStore(() => {
        importAccountBundle(process.cwd(), {
            proxies: [
                { label: 'proxy-one', url: '192.0.2.81', port: 8081 },
                { label: 'proxy-two', url: '192.0.2.82', port: 8082, username: 'user', password: 'secret' }
            ],
            accounts: [{ email: 'managed@example.com', password: 'account-secret', proxyLabel: 'proxy-one' }]
        })

        const proxies = listProxyRows(process.cwd())
        assert.deepEqual(proxies.map(proxy => proxy.label), ['proxy-one', 'proxy-two'])
        assert.equal(Object.hasOwn(proxies[1], 'password'), false)
        assert.equal(proxies[1].hasCredentials, true)

        const reassigned = assignAccountProxy(process.cwd(), 'managed@example.com', { proxyLabel: 'proxy-two' })
        assert.equal(reassigned.proxy.label, 'proxy-two')
        assert.equal(reassigned.useProxy, true)

        const detached = assignAccountProxy(process.cwd(), 'managed@example.com', { useProxy: false })
        assert.equal(detached.proxy, null)
        assert.equal(detached.useProxy, false)
        assert.equal(listManagedAccountRows(process.cwd())[0].email, 'managed@example.com')
    })
})

test('proxy management supports proxy-only creation, status changes, and safe deletion', () => {
    withTemporaryAccountStore(() => {
        importAccountBundle(process.cwd(), {
            proxies: [{ label: 'assigned-proxy', url: '192.0.2.91', port: 8091 }],
            accounts: [{ email: 'assigned@example.com', password: 'secret', proxyLabel: 'assigned-proxy' }]
        })

        importAccountBundle(process.cwd(), {
            proxies: [{ label: 'unused-proxy', url: '192.0.2.92', port: 8092 }],
            accounts: []
        })

        const rows = listProxyRows(process.cwd())
        const assigned = rows.find(proxy => proxy.label === 'assigned-proxy')
        const unused = rows.find(proxy => proxy.label === 'unused-proxy')
        assert.ok(assigned)
        assert.ok(unused)

        const deletedAssigned = deleteProxyRecord(process.cwd(), assigned.id)
        assert.equal(deletedAssigned.detached, 1)
        assert.deepEqual(deletedAssigned.detachedEmails, ['assigned@example.com'])
        assert.equal(listManagedAccountRows(process.cwd())[0].useProxy, false)
        assert.equal(listManagedAccountRows(process.cwd())[0].proxy, null)

        const disabled = setProxyStatus(process.cwd(), unused.id, 'disabled')
        assert.equal(disabled.status, 'disabled')
        assert.equal(listProxyRows(process.cwd()).find(proxy => proxy.id === unused.id).status, 'disabled')

        const deleted = deleteProxyRecord(process.cwd(), unused.id)
        assert.equal(deleted.deleted, true)
        assert.equal(listProxyRows(process.cwd()).some(proxy => proxy.id === unused.id), false)
    })
})

test('restoreDeleted imports a permanently deleted account and removes its tombstone atomically', () => {
    withTemporaryAccountStore(() => {
        seedAccounts()
        deleteAccountRecords(process.cwd(), ['banned@example.com'])

        const result = importAccountBundle(
            process.cwd(),
            {
                accounts: [
                    {
                        email: 'banned@example.com',
                        password: 'replacement-secret',
                        proxyLabel: 'test-proxy'
                    }
                ]
            },
            { restoreDeleted: true }
        )

        assert.equal(result.inserted, 1)
        assert.equal(result.restoredDeleted, 1)
        assert.deepEqual(result.restoredDeletedEmails, ['banned@example.com'])
        assert.equal(getAccountStoreStats(process.cwd()).permanentlyDeleted, 0)
        assert.deepEqual(
            listAccountRows(process.cwd()).map(account => account.email),
            ['keep@example.com', 'banned@example.com']
        )
    })
})
