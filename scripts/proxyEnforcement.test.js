import assert from 'node:assert/strict'
import http from 'node:http'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { default: HttpClient, ProxyUnavailableError } = require('../dist/util/Http.js')
const { OmoCaptchaClient } = require('../dist/util/OmoCaptcha.js')

function proxyAccount(port, proxyHttp = false) {
    return {
        proxyHttp,
        url: 'http://127.0.0.1',
        port,
        username: '',
        password: ''
    }
}

async function listen(server) {
    await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
    })
    return server.address().port
}

async function close(server) {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
}

test('a configured account proxy is enforced even when legacy proxyHttp is false', async () => {
    const requests = []
    const proxy = http.createServer((request, response) => {
        requests.push(request.url)
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ routedThroughProxy: true }))
    })
    const port = await listen(proxy)

    try {
        const client = new HttpClient(proxyAccount(port, false))
        const response = await client.request({
            url: 'http://account-traffic.invalid/proxy-enforcement',
            method: 'GET'
        })

        assert.equal(client.usesProxy, true)
        assert.deepEqual(response.data, { routedThroughProxy: true })
        assert.equal(requests.length, 1)
        assert.match(requests[0], /account-traffic\.invalid\/proxy-enforcement/)
    } finally {
        await close(proxy)
    }
})

test('a transient proxy health-check failure is retried before the route is rejected', async () => {
    let attempts = 0
    const transport = {
        fetch: async () => {
            attempts++
            if (attempts === 1) throw new Error('temporary proxy timeout')
            return {
                status: 200,
                text: async () => JSON.stringify({ ip: '192.0.2.1' })
            }
        }
    }

    const client = new HttpClient(proxyAccount(8080, true))
    client.instance = transport
    client.createInstance = () => transport

    await client.assertProxyReady(true)
    assert.equal(attempts, 2)
})

test('a dead proxy opens a circuit after repeated failures and never falls back to direct', async () => {
    const reservedPort = http.createServer()
    const port = await listen(reservedPort)
    await close(reservedPort)

    const client = new HttpClient(proxyAccount(port, true))

    await assert.rejects(
        () => client.assertProxyReady(true),
        error => error instanceof ProxyUnavailableError && /direct fallback is disabled/.test(error.message)
    )

    await assert.rejects(
        () => client.assertProxyReady(true),
        error => error instanceof ProxyUnavailableError && !/retry allowed in/.test(error.message)
    )

    const started = Date.now()
    await assert.rejects(
        () => client.assertProxyReady(true),
        error => error instanceof ProxyUnavailableError && /retry allowed in/.test(error.message)
    )
    assert.ok(Date.now() - started < 500, 'the open proxy circuit should fail immediately')
})

test('account-scoped captcha solver requests use the enforced proxy client', async () => {
    const requests = []
    const proxy = http.createServer((request, response) => {
        requests.push(request.url)
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
            JSON.stringify(
                request.url.includes('/v2/createTask')
                    ? { errorId: 0, taskId: 'proxy-task' }
                    : { errorId: 0, status: 'ready', solution: { index: 2 } }
            )
        )
    })
    const port = await listen(proxy)

    try {
        const httpClient = new HttpClient(proxyAccount(port, false))
        const captcha = new OmoCaptchaClient({
            apiKey: 'proxy-test-key',
            baseUrl: 'http://omocaptcha.invalid',
            httpClient,
            sleep: async () => {}
        })

        assert.equal(await captcha.solveFuncaptchaImage('aW1hZ2U=', 'Select the matching image'), 2)
        assert.equal(requests.length, 2)
        assert.match(requests[0], /omocaptcha\.invalid\/v2\/createTask/)
        assert.match(requests[1], /omocaptcha\.invalid\/v2\/getTaskResult/)
    } finally {
        await close(proxy)
    }
})
