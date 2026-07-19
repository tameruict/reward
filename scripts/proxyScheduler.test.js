import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { accountRouteKey, buildProxyAwareChunks, groupAccountsByProxy } = require('../dist/util/ProxyScheduler.js')

function account(email, proxy = {}) {
    return {
        email,
        password: 'test',
        recoveryEmail: '',
        geoLocale: 'auto',
        langCode: 'en',
        proxy: {
            proxyHttp: false,
            url: proxy.url || '',
            port: proxy.port || 0,
            username: proxy.username || '',
            password: proxy.password || ''
        },
        saveFingerprint: { mobile: false, desktop: false }
    }
}

test('accounts using the same proxy endpoint always share one route', () => {
    const first = account('one@example.com', {
        url: 'HTTP://Proxy.Example.com/',
        port: 8080,
        username: 'worker',
        password: 'old-secret'
    })
    const second = account('two@example.com', {
        url: 'proxy.example.com',
        port: 8080,
        username: 'worker',
        password: 'new-secret'
    })

    assert.equal(accountRouteKey(first), accountRouteKey(second))
    assert.equal(groupAccountsByProxy([first, second]).length, 1)
})

test('an embedded proxy port is treated like the explicit port used by the browser', () => {
    const embedded = account('one@example.com', { url: 'http://proxy.example.com:8080' })
    const explicit = account('two@example.com', { url: 'http://proxy.example.com', port: 8080 })

    assert.equal(accountRouteKey(embedded), accountRouteKey(explicit))
})

test('an embedded proxy credential URL matches the split proxy fields', () => {
    const embedded = account('one@example.com', { url: 'http://worker:secret@proxy.example.com:8080' })
    const explicit = account('two@example.com', {
        url: 'http://proxy.example.com',
        port: 8080,
        username: 'worker',
        password: 'secret'
    })

    assert.equal(accountRouteKey(embedded), accountRouteKey(explicit))
})

test('automatic mode creates one sequential lane per proxy', () => {
    const accounts = [
        account('a1@example.com', { url: 'proxy-a.test', port: 8001 }),
        account('b1@example.com', { url: 'proxy-b.test', port: 8002 }),
        account('a2@example.com', { url: 'proxy-a.test', port: 8001 }),
        account('b2@example.com', { url: 'proxy-b.test', port: 8002 })
    ]

    const chunks = buildProxyAwareChunks(accounts, 0)
    assert.equal(chunks.length, 2)
    assert.deepEqual(
        chunks.map(chunk => chunk.map(item => item.email)),
        [
            ['a1@example.com', 'a2@example.com'],
            ['b1@example.com', 'b2@example.com']
        ]
    )
})

test('a worker limit balances whole proxy groups without splitting a route', () => {
    const accounts = [
        account('a1@example.com', { url: 'proxy-a.test', port: 8001 }),
        account('a2@example.com', { url: 'proxy-a.test', port: 8001 }),
        account('a3@example.com', { url: 'proxy-a.test', port: 8001 }),
        account('b1@example.com', { url: 'proxy-b.test', port: 8002 }),
        account('b2@example.com', { url: 'proxy-b.test', port: 8002 }),
        account('c1@example.com', { url: 'proxy-c.test', port: 8003 })
    ]

    const chunks = buildProxyAwareChunks(accounts, 2)
    assert.equal(chunks.length, 2)

    for (const route of groupAccountsByProxy(accounts)) {
        assert.equal(
            chunks.filter(chunk => chunk.some(item => accountRouteKey(item) === route.routeKey)).length,
            1,
            `route ${route.routeKey} must exist in exactly one worker chunk`
        )
    }
})

test('direct accounts share one conservative route', () => {
    const chunks = buildProxyAwareChunks([account('one@example.com'), account('two@example.com')], 0)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].length, 2)
})
