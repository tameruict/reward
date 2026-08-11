import assert from 'node:assert/strict'
import test from 'node:test'

import { listConfiguredAccountRows } from './accounts.js'

test('Replit Secrets accounts are exposed as safe dashboard rows', () => {
    const rows = listConfiguredAccountRows({
        ACCOUNT_1_EMAIL: 'one@example.com',
        ACCOUNT_1_PASSWORD: 'secret-password',
        ACCOUNT_1_TOTP_SECRET: 'secret-totp',
        ACCOUNT_1_RECOVERY_EMAIL: 'recovery@example.com',
        ACCOUNT_1_GEO_LOCALE: 'US',
        ACCOUNT_1_PROXY_URL: 'proxy.example.com',
        ACCOUNT_1_PROXY_PORT: '8000',
        ACCOUNT_1_PROXY_USERNAME: 'proxy-user',
        ACCOUNT_1_PROXY_PASSWORD: 'proxy-password'
    })

    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0], {
        id: 'env-account-1',
        index: 1,
        email: 'one@example.com',
        emailKey: 'one@example.com',
        status: 'ready',
        useProxy: true,
        hasRecoveryEmail: true,
        hasTotp: true,
        geoLocale: 'US',
        langCode: 'en',
        proxy: {
            id: 'env-proxy-1',
            label: 'ACCOUNT_1 proxy',
            status: 'active',
            url: 'proxy.example.com',
            port: 8000,
            hasCredentials: true,
            accountCapacity: 1,
            egressIp: null,
            cooldownSeconds: 0
        }
    })

    assert.equal('password' in rows[0], false)
    assert.equal('totpSecret' in rows[0], false)
    assert.equal('username' in rows[0].proxy, false)
    assert.equal('proxyPassword' in rows[0].proxy, false)
})
