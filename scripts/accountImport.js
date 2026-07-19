import fs from 'node:fs'
import path from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'

import { automaticProxyLabel } from './proxyIdentity.js'

const FIELD_ALIASES = new Map([
    ['mail', 'email'],
    ['user', 'email'],
    ['pass', 'password'],
    ['proxy', 'proxy_url'],
    ['proxy_host', 'proxy_url'],
    ['proxy_user', 'proxy_username'],
    ['proxy_pass', 'proxy_password'],
    ['totp', 'totp_secret'],
    ['recovery', 'recovery_email']
])

function normalizeFieldName(value) {
    const normalized = String(value)
        .trim()
        .toLowerCase()
        .replace(/^account_/, '')
        .replace(/[\s-]+/g, '_')
    return FIELD_ALIASES.get(normalized) ?? normalized
}

function normalizeRecord(record) {
    return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
            normalizeFieldName(key),
            value == null ? '' : String(value).trim()
        ])
    )
}

function autoProxyLabel(record) {
    return automaticProxyLabel({
        url: record.proxy_url,
        port: Number(record.proxy_port),
        username: record.proxy_username ?? ''
    })
}

function recordsToBundle(rawRecords) {
    if (!rawRecords.length) throw new Error('Import file does not contain any account rows.')

    const proxies = new Map()
    const accounts = rawRecords.map((rawRecord, index) => {
        const record = normalizeRecord(rawRecord)
        if (!record.email) throw new Error(`Import row ${index + 1} is missing email.`)

        const hasProxyDetails = Boolean(record.proxy_url || record.proxy_port)
        let proxyLabel = record.proxy_label || ''
        if (hasProxyDetails) {
            if (!record.proxy_url || !record.proxy_port) {
                throw new Error(`Import row ${index + 1} must provide both proxy_url and proxy_port.`)
            }
            proxyLabel ||= autoProxyLabel(record)
            const proxy = {
                label: proxyLabel,
                url: record.proxy_url,
                port: record.proxy_port,
                username: record.proxy_username,
                password: record.proxy_password,
                proxyHttp: record.proxy_http,
                status: record.proxy_status || 'active',
                accountCapacity: record.account_capacity || 6,
                egressIp: record.proxy_egress_ip || record.egress_ip,
                cooldownSeconds: record.cooldown_seconds || 0
            }
            const key = proxyLabel.toLowerCase()
            const serialized = JSON.stringify(proxy)
            const existing = proxies.get(key)
            if (existing && existing.serialized !== serialized) {
                throw new Error(`Import rows use proxy label ${proxyLabel} with different proxy details.`)
            }
            proxies.set(key, { serialized, proxy })
        }

        return {
            email: record.email,
            password: record.password,
            totpSecret: record.totp_secret,
            recoveryEmail: record.recovery_email,
            geoLocale: record.geo_locale || 'auto',
            langCode: record.lang_code || 'en',
            proxyLabel: proxyLabel || undefined,
            status: record.status || 'ready',
            saveFingerprint: {
                mobile: record.save_fingerprint_mobile,
                desktop: record.save_fingerprint_desktop
            }
        }
    })

    return { proxies: [...proxies.values()].map(entry => entry.proxy), accounts }
}

function parseCsvFile(content) {
    const records = parseCsv(content, {
        bom: true,
        columns: header => header.map(normalizeFieldName),
        comment: '#',
        skip_empty_lines: true,
        skip_records_with_empty_values: false,
        trim: true
    })
    return recordsToBundle(records)
}

function parseTextBlocks(content) {
    const records = []
    let current = {}

    const pushCurrent = () => {
        if (!Object.keys(current).length) return
        records.push(current)
        current = {}
    }

    for (const [lineIndex, rawLine] of content.split(/\r?\n/).entries()) {
        const line = rawLine.trim()
        if (!line || line === '---') {
            pushCurrent()
            continue
        }
        if (line.startsWith('#')) continue

        const separator = line.indexOf('=')
        if (separator < 1) throw new Error(`Invalid accounts.txt line ${lineIndex + 1}: expected KEY=value.`)
        const key = normalizeFieldName(line.slice(0, separator))
        const value = line.slice(separator + 1).trim()

        if (key === 'email' && current.email) pushCurrent()
        if (Object.hasOwn(current, key)) {
            throw new Error(`Duplicate ${key.toUpperCase()} in accounts.txt block near line ${lineIndex + 1}.`)
        }
        current[key] = value
    }
    pushCurrent()
    return recordsToBundle(records)
}

export function loadAccountImportFile(inputPath) {
    const absolutePath = path.resolve(process.cwd(), inputPath)
    const content = fs.readFileSync(absolutePath, 'utf8')
    const extension = path.extname(absolutePath).toLowerCase()

    if (extension === '.csv') return parseCsvFile(content)
    if (extension === '.txt') return parseTextBlocks(content)
    if (extension === '.json') return JSON.parse(content)
    throw new Error('Unsupported import file. Use .csv, .txt, or .json.')
}
