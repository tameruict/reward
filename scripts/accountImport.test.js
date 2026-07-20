import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { loadAccountImportFile } from './accountImport.js'

function withTemporaryImportFile(content, run) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-account-import-test-'))
    const filePath = path.join(tempDir, 'accounts.local.txt')
    fs.writeFileSync(filePath, content)
    try {
        return run(filePath)
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
}

test('imports email|password|host:port:user:pass rows', () => {
    withTemporaryImportFile(
        [
            'meliorakerenzagoldwin3@hotmail.com|31wOP1986|14.241.72.182:18755:tam:tam317',
            'second@example.com|another-password|14.241.72.182:18755:tam:tam317',
            'third@example.com|third-password|14.224.225.129:28682:tam:tam317'
        ].join('\n'),
        filePath => {
            const bundle = loadAccountImportFile(filePath)

            assert.equal(bundle.accounts.length, 3)
            assert.equal(bundle.proxies.length, 2)
            assert.equal(bundle.accounts[0].email, 'meliorakerenzagoldwin3@hotmail.com')
            assert.equal(bundle.accounts[0].password, '31wOP1986')
            assert.equal(bundle.proxies[0].url, '14.241.72.182')
            assert.equal(bundle.proxies[0].port, 18755)
            assert.equal(bundle.proxies[0].username, 'tam')
            assert.equal(bundle.proxies[0].password, 'tam317')
            assert.equal(bundle.accounts[0].proxyLabel, bundle.proxies[0].label)
        }
    )
})

test('rejects malformed pipe rows', () => {
    withTemporaryImportFile('account@example.com|password|not-a-proxy', filePath => {
        assert.throws(() => loadAccountImportFile(filePath), /expected host:port:user:pass/)
    })
})
