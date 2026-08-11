const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..', '..')
const configPath = path.join(projectRoot, 'config.json')
const configExamplePath = path.join(projectRoot, 'config.example.json')

if (!fs.existsSync(configPath)) {
    fs.copyFileSync(configExamplePath, configPath)
    console.log('[replit] Created config.json from config.example.json')
}

// Replit exposes the public deployment port through PORT. The API must listen
// on all interfaces so the local dashboard can reach it over the Replit URL.
process.env.API_HOST ||= '0.0.0.0'
process.env.API_PORT ||= process.env.PORT || '3000'
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0'
process.env.FORCE_HEADLESS = '1'

if (!process.env.API_TOKEN?.trim()) {
    console.error('[replit] API_TOKEN is required for the public dashboard control API.')
    process.exit(1)
}

if (!process.env.ACCOUNTS_SOURCE && process.env.ACCOUNT_1_EMAIL) {
    process.env.ACCOUNTS_SOURCE = 'env'
}

const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'api', 'server.js')], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true
})

let forwarding = false
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (forwarding) return
        forwarding = true
        if (!child.killed) child.kill(signal)
    })
}

child.on('error', error => {
    console.error(`[replit] Failed to start control API: ${error.message}`)
    process.exitCode = 1
})

child.on('exit', (code, signal) => {
    if (signal && !forwarding) {
        console.error(`[replit] Control API stopped by ${signal}`)
        process.exitCode = 1
    } else {
        process.exitCode = code ?? 1
    }
})
