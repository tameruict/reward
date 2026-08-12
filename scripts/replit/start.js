import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const publicPort = Number(process.env.PORT || 3000)
const apiPort = Number(process.env.REPLIT_INTERNAL_API_PORT || 3010)
const dashboardUsername = String(process.env.DASHBOARD_USERNAME || '').trim()
const dashboardPassword = String(process.env.DASHBOARD_PASSWORD || '')
const allowInsecure = /^(1|true|yes)$/i.test(String(process.env.REPLIT_ALLOW_INSECURE_DASHBOARD || ''))

if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535) {
    throw new Error(`Invalid public PORT: ${process.env.PORT}`)
}
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535 || apiPort === publicPort) {
    throw new Error(`REPLIT_INTERNAL_API_PORT must be valid and different from PORT (received ${apiPort})`)
}
if ((!dashboardUsername || !dashboardPassword) && !allowInsecure) {
    throw new Error(
        'Refusing to expose the Replit dashboard without authentication. Set DASHBOARD_USERNAME and DASHBOARD_PASSWORD as Replit Secrets.'
    )
}
if (!fs.existsSync(path.join(projectRoot, 'dist', 'index.js'))) {
    throw new Error('dist/index.js is missing. Run `npm run build` before `npm run replit:start`.')
}

// This token is shared only by the two child processes and is never written to
// disk or exposed to the browser. Basic auth protects the public dashboard.
const internalToken = crypto.randomBytes(32).toString('hex')
const children = new Map()
let shuttingDown = false

function launch(name, script, env) {
    const child = spawn(process.execPath, [script], {
        cwd: projectRoot,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe']
    })

    children.set(name, child)
    child.stdout.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`))
    child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`))
    child.on('exit', (code, signal) => {
        children.delete(name)
        if (shuttingDown) return
        process.stderr.write(`[replit] ${name} exited unexpectedly (code=${code}, signal=${signal})\n`)
        void shutdown('child-exit', code ?? 1)
    })

    return child
}

async function shutdown(signal, exitCode = 0) {
    if (shuttingDown) return
    shuttingDown = true
    process.stdout.write(`[replit] shutting down (${signal})\n`)

    for (const child of children.values()) child.kill('SIGTERM')
    const deadline = Date.now() + 10000
    while (children.size && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    for (const child of children.values()) child.kill('SIGKILL')
    process.exit(exitCode)
}

async function runSelfTest() {
    const deadline = Date.now() + 30000
    const authorization = `Basic ${Buffer.from(`${dashboardUsername}:${dashboardPassword}`).toString('base64')}`
    let lastError

    while (Date.now() < deadline) {
        try {
            const healthResponse = await fetch(`http://127.0.0.1:${publicPort}/api/health`, {
                headers: { Authorization: authorization }
            })
            if (!healthResponse.ok) throw new Error(`health returned HTTP ${healthResponse.status}`)
            const health = await healthResponse.json()
            if (!health.ok || !health.reachable || !health.controlApi?.ok) {
                throw new Error(`health payload is not ready: ${JSON.stringify(health)}`)
            }

            const accountsResponse = await fetch(`http://127.0.0.1:${publicPort}/api/accounts`, {
                headers: { Authorization: authorization }
            })
            if (!accountsResponse.ok) throw new Error(`accounts returned HTTP ${accountsResponse.status}`)
            const accounts = await accountsResponse.json()
            const accountCount = Array.isArray(accounts.accounts) ? accounts.accounts.length : -1
            if (process.env.REPLIT_EXPECT_EMPTY === 'true' && accountCount !== 0) {
                throw new Error(`expected an empty account store, found ${accountCount}`)
            }

            process.stdout.write(`__REPLIT_SMOKE_OK__ ${JSON.stringify({ accountCount, health: true })}\n`)
            await shutdown('self-test', 0)
            return
        } catch (error) {
            lastError = error
            await new Promise(resolve => setTimeout(resolve, 250))
        }
    }

    process.stderr.write(
        `__REPLIT_SMOKE_FAILED__ ${lastError instanceof Error ? lastError.message : String(lastError)}\n`
    )
    await shutdown('self-test-failed', 1)
}

launch('api', path.join(projectRoot, 'scripts', 'api', 'server.js'), {
    API_HOST: '127.0.0.1',
    API_PORT: String(apiPort),
    API_TOKEN: internalToken,
    API_ALLOW_ENV_OVERRIDES: 'false'
})

launch('dashboard', path.join(projectRoot, 'local-dashboard', 'server.js'), {
    HOST: '0.0.0.0',
    PORT: String(publicPort),
    CONTROL_API_URL: `http://127.0.0.1:${apiPort}`,
    CONTROL_API_TOKEN: internalToken,
    DASHBOARD_USERNAME: dashboardUsername,
    DASHBOARD_PASSWORD: dashboardPassword
})

process.stdout.write(
    `[replit] Microsoft Point started | public=0.0.0.0:${publicPort} | api=127.0.0.1:${apiPort} | dashboardAuth=${dashboardUsername && dashboardPassword ? 'enabled' : 'disabled'}\n`
)

if (process.env.REPLIT_SELF_TEST === 'true') void runSelfTest()

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
