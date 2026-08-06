import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { loadAccountImportFile } from './accountImport.js'

function withImportFile(content, run) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-account-import-test-'))
    const inputPath = path.join(tempDir, 'accounts.txt')
    fs.writeFileSync(inputPath, content)
    try {
        return run(inputPath)
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
}

test('pipe-delimited email and password rows request stored proxy assignment', () => {
    withImportFile('first@example.com|first-secret\nsecond@example.com|second-secret\n', inputPath => {
        const bundle = loadAccountImportFile(inputPath)

        assert.equal(bundle.sourceFormat, 'pipe')
        assert.equal(bundle.autoAssignStoredProxies, true)
        assert.equal(bundle.proxies.length, 0)
        assert.deepEqual(
            bundle.accounts.map(account => ({
                email: account.email,
                password: account.password,
                proxyLabel: account.proxyLabel
            })),
            [
                { email: 'first@example.com', password: 'first-secret', proxyLabel: undefined },
                { email: 'second@example.com', password: 'second-secret', proxyLabel: undefined }
            ]
        )
    })
})

test('pipe-delimited proxy rows are normalized into account and proxy records', () => {
    withImportFile(
        [
            'first@example.com|first-secret|192.0.2.10:8010',
            'second@example.com|second-secret|192.0.2.11:8011|proxy-user|proxy-secret'
        ].join('\n'),
        inputPath => {
            const bundle = loadAccountImportFile(inputPath)

            assert.equal(bundle.sourceFormat, 'pipe')
            assert.equal(bundle.autoAssignStoredProxies, false)
            assert.equal(bundle.accounts.length, 2)
            assert.equal(bundle.proxies.length, 2)
            assert.equal(bundle.proxies[0].url, '192.0.2.10:8010')
            assert.equal(bundle.proxies[0].port, 8010)
            assert.equal(bundle.proxies[1].username, 'proxy-user')
            assert.equal(bundle.proxies[1].password, 'proxy-secret')
            assert.ok(bundle.accounts.every(account => account.proxyLabel))
        }
    )
})

test('legacy KEY=value text blocks remain supported', () => {
    withImportFile(
        ['EMAIL=legacy@example.com', 'PASSWORD=legacy-secret', 'PROXY_URL=192.0.2.20', 'PROXY_PORT=8020'].join('\n'),
        inputPath => {
            const bundle = loadAccountImportFile(inputPath)

            assert.equal(bundle.sourceFormat, undefined)
            assert.equal(bundle.accounts[0].email, 'legacy@example.com')
            assert.equal(bundle.proxies[0].port, 8020)
        }
    )
})
