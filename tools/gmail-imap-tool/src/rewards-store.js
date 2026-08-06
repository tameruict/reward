'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { normalizeRewardsEmail } = require('./rewards')

let filePath = null
let accounts = {}

function init(userDataDir) {
    filePath = path.join(userDataDir, 'rewards-accounts.json')
    load()
}

function load() {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        accounts = raw?.version === 1 && raw.accounts && typeof raw.accounts === 'object' ? raw.accounts : {}
    } catch {
        accounts = {}
    }
}

function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, accounts }, null, 2), { mode: 0o600 })
}

function save({ email, label } = {}) {
    const key = normalizeRewardsEmail(email)
    if (!key || !key.includes('@')) return { ok: false, error: 'Email Microsoft không hợp lệ.' }

    accounts[key] = {
        email: key,
        label: String(label || '').trim().slice(0, 80),
        updatedAt: new Date().toISOString()
    }
    persist()
    return { ok: true, account: { ...accounts[key] } }
}

function get(email) {
    const entry = accounts[normalizeRewardsEmail(email)]
    return entry ? { ...entry } : null
}

function list() {
    return Object.values(accounts)
        .map(account => ({ ...account }))
        .sort((a, b) => (a.label || a.email).localeCompare(b.label || b.email))
}

function remove(email) {
    const key = normalizeRewardsEmail(email)
    if (!accounts[key]) return { ok: false, error: 'Không tìm thấy account Rewards.' }
    delete accounts[key]
    persist()
    return { ok: true }
}

module.exports = { init, save, get, list, remove }
