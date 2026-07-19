import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import { cleanupProxyRecords, getAccountStoreStats, importAccountBundle } from './accountStore.js'

test('proxy cleanup merges used legacy duplicates and HTTP mode updates in place', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-proxy-cleanup-'))
    process.env.ACCOUNTS_DB_PATH = path.join(tempDir, 'accounts.db')
    process.env.ACCOUNTS_DB_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const projectRoot = process.cwd()

    try {
        importAccountBundle(projectRoot, {
            proxies: [
                {
                    label: 'primary',
                    url: '192.0.2.10',
                    port: 8001,
                    username: 'user',
                    password: 'pass',
                    proxyHttp: true
                },
                { label: 'legacy', url: '192.0.2.20', port: 8002, username: 'user', password: 'pass', proxyHttp: false }
            ],
            accounts: [
                { email: 'one@example.com', password: 'secret', proxyLabel: 'primary' },
                { email: 'two@example.com', password: 'secret', proxyLabel: 'primary' },
                { email: 'three@example.com', password: 'secret', proxyLabel: 'legacy' },
                { email: 'four@example.com', password: 'secret', proxyLabel: 'legacy' }
            ]
        })

        const db = new DatabaseSync(process.env.ACCOUNTS_DB_PATH)
        db.prepare(
            `
            UPDATE proxies SET url = '192.0.2.10', port = 8001, identity_key = 'identity_legacy_duplicate'
            WHERE label = 'legacy'
        `
        ).run()
        db.close()

        const cleanup = cleanupProxyRecords(projectRoot)
        assert.equal(cleanup.mergedGroups, 1)
        assert.equal(cleanup.deletedRecords, 1)
        assert.equal(cleanup.reassignedAccounts, 2)

        let stats = getAccountStoreStats(projectRoot)
        assert.equal(stats.accounts, 4)
        assert.equal(stats.proxies, 1)
        assert.equal(stats.proxyRecords, 1)
        assert.equal(stats.unusedProxies, 0)

        importAccountBundle(projectRoot, {
            proxies: [
                {
                    label: 'same-endpoint-new-label',
                    url: 'http://192.0.2.10',
                    port: 8001,
                    username: 'user',
                    password: 'new-pass',
                    proxyHttp: false
                }
            ],
            accounts: [
                {
                    email: 'one@example.com',
                    password: 'secret',
                    proxyLabel: 'same-endpoint-new-label'
                }
            ]
        })

        stats = getAccountStoreStats(projectRoot)
        assert.equal(stats.proxies, 1)
        assert.equal(stats.proxyRecords, 1)
        const verify = new DatabaseSync(process.env.ACCOUNTS_DB_PATH, { readOnly: true })
        assert.equal(Number(verify.prepare('SELECT proxy_http FROM proxies').get().proxy_http), 0)
        assert.equal(Number(verify.prepare('SELECT COUNT(*) AS value FROM accounts').get().value), 4)
        verify.close()
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
})

test('proxy cleanup merges duplicates without limiting accounts per proxy', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-proxy-capacity-'))
    process.env.ACCOUNTS_DB_PATH = path.join(tempDir, 'accounts.db')
    process.env.ACCOUNTS_DB_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const projectRoot = process.cwd()

    try {
        const accounts = []
        for (let index = 1; index <= 8; index += 1) {
            accounts.push({
                email: `capacity-${index}@example.com`,
                password: 'secret',
                proxyLabel: index <= 4 ? 'capacity-a' : 'capacity-b'
            })
        }
        importAccountBundle(projectRoot, {
            proxies: [
                { label: 'capacity-a', url: '192.0.2.30', port: 8030 },
                { label: 'capacity-b', url: '192.0.2.40', port: 8040 }
            ],
            accounts
        })

        const db = new DatabaseSync(process.env.ACCOUNTS_DB_PATH)
        db.prepare(
            `
            UPDATE proxies SET url = '192.0.2.30', port = 8030, identity_key = 'identity_capacity_duplicate'
            WHERE label = 'capacity-b'
        `
        ).run()
        db.close()

        const cleanup = cleanupProxyRecords(projectRoot)
        assert.equal(cleanup.mergedGroups, 1)
        assert.equal(cleanup.deletedRecords, 1)
        assert.equal(cleanup.reassignedAccounts, 4)
        const stats = getAccountStoreStats(projectRoot)
        assert.equal(stats.accounts, 8)
        assert.equal(stats.proxyRecords, 1)
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
})
