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

process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0'
process.env.FORCE_HEADLESS = '1'

// Replit Secrets are the preferred account source. Keep database mode available
// when a persistent accounts.db is supplied separately.
if (!process.env.ACCOUNTS_SOURCE && process.env.ACCOUNT_1_EMAIL) {
    process.env.ACCOUNTS_SOURCE = 'env'
}

const child = spawn(process.execPath, [path.join(projectRoot, 'dist', 'index.js')], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit'
})
child.on('error', error => {
    console.error(`[replit] Failed to start worker: ${error.message}`)
    process.exitCode = 1
})

child.on('exit', (code, signal) => {
    if (signal) {
        console.error(`[replit] Worker stopped by ${signal}`)
        process.exitCode = 1
    } else {
        process.exitCode = code ?? 1
    }
})
