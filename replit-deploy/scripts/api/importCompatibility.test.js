import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')

async function getFreePort() {
    const server = net.createServer()
    await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    const port = address.port
    await new Promise(resolve => server.close(resolve))
    return port
}

async function waitForApi(url, token, child) {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
        if (child.exitCode != null) throw new Error(`API process exited with code ${child.exitCode}.`)
        try {
            const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            if (response.ok) return
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('Timed out waiting for the API server.')
}

async function request(baseUrl, token, method, pathname, body) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    })
    const payload = await response.json()
    return { response, payload }
}

test('Replit dashboard can import an unlabeled proxy and a bare account row', async t => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replit-import-api-test-'))
    const port = await getFreePort()
    const token = 'test-control-token'
    const baseUrl = `http://127.0.0.1:${port}`
    let stderr = ''
    const child = spawn(process.execPath, ['scripts/api/server.js'], {
        cwd: projectRoot,
        windowsHide: true,
        env: {
            ...process.env,
            API_HOST: '127.0.0.1',
            API_PORT: String(port),
            API_TOKEN: token,
            ACCOUNTS_SOURCE: 'database',
            ACCOUNTS_DB_PATH: path.join(tempDir, 'accounts.db'),
            ACCOUNTS_DB_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        },
        stdio: ['ignore', 'ignore', 'pipe']
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
        stderr += chunk
    })

    t.after(async () => {
        if (child.exitCode == null) child.kill()
        await new Promise(resolve => {
            if (child.exitCode != null) return resolve()
            child.once('exit', resolve)
            setTimeout(resolve, 2_000).unref()
        })
        fs.rmSync(tempDir, { recursive: true, force: true })
    })

    try {
        await waitForApi(baseUrl, token, child)

        const proxyImport = await request(baseUrl, token, 'POST', '/proxies', {
            url: 'http://proxy-user:proxy-password@192.0.2.80:8080'
        })
        assert.equal(proxyImport.response.status, 200)
        assert.equal(proxyImport.payload.proxies.length, 1)
        assert.match(proxyImport.payload.proxies[0].label, /^proxy-[a-f0-9]{10}$/)
        assert.equal(proxyImport.payload.proxies[0].url, 'http://192.0.2.80')
        assert.equal(proxyImport.payload.proxies[0].port, 8080)

        const accountImport = await request(baseUrl, token, 'POST', '/accounts/import', {
            accounts: [{ email: 'dashboard@example.com', password: 'account-secret' }]
        })
        assert.equal(accountImport.response.status, 200)
        assert.equal(accountImport.payload.imported, true)
        assert.equal(accountImport.payload.accounts.length, 1)
        assert.equal(accountImport.payload.accounts[0].email, 'dashboard@example.com')
        assert.equal(accountImport.payload.accounts[0].useProxy, false)

        const proxyLabel = proxyImport.payload.proxies[0].label
        const assignment = await request(baseUrl, token, 'PATCH', '/accounts/dashboard@example.com/proxy', {
            proxyLabel
        })
        assert.equal(assignment.response.status, 200)
        assert.equal(assignment.payload.updated, true)
        assert.equal(assignment.payload.account.proxy.label, proxyLabel)
        assert.equal(assignment.payload.account.useProxy, true)

        const strictImport = await request(baseUrl, token, 'POST', '/accounts/import', {
            accounts: [{ email: 'strict@example.com', password: 'account-secret' }],
            allowDirectAccounts: false
        })
        assert.equal(strictImport.response.status, 400)
        assert.match(strictImport.payload.error, /requires a proxy/i)
    } catch (error) {
        assert.fail(`${error.message}\n${stderr}`)
    }
})
