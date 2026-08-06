'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeProxy, maskProxy } = require('../src/proxy')

test('empty proxy means direct connection', () => {
    assert.equal(normalizeProxy(''), null)
    assert.equal(normalizeProxy('   '), null)
})

test('normalizes host:port as HTTP proxy', () => {
    assert.equal(normalizeProxy('127.0.0.1:8080'), 'http://127.0.0.1:8080/')
})

test('normalizes host:port:user:pass and escapes credentials', () => {
    assert.equal(
        normalizeProxy('proxy.example:9000:user@example.com:p@ss:word'),
        'http://user%40example.com:p%40ss%3Aword@proxy.example:9000/'
    )
})

test('keeps supported SOCKS5 proxy URLs', () => {
    assert.equal(normalizeProxy('socks5://user:pass@localhost:1080'), 'socks5://user:pass@localhost:1080')
})

test('masks proxy credentials for renderer output', () => {
    assert.equal(maskProxy('http://user:secret@proxy.example:8080'), 'http://proxy.example:8080 • có xác thực')
})

test('rejects unsupported proxy protocols', () => {
    assert.throws(() => normalizeProxy('ftp://proxy.example:21'), /chỉ hỗ trợ/)
})
