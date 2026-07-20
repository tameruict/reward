import fs from 'node:fs'
import path from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'

import { automaticProxyLabel, parseProxyParts } from './proxyIdentity.js'

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
    const parsed = parseProxyParts({
        url: record.proxy_url,
        port: record.proxy_port,
        username: record.proxy_username
    })
    return automaticProxyLabel({
        url: record.proxy_url,
        port: parsed.port,
        username: parsed.username
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
            const parsed = parseProxyParts({
                url: record.proxy_url,
                port: record.proxy_port,
                username: record.proxy_username,
                password: record.proxy_password
            })
            if (!record.proxy_url || !parsed.port) {
                throw new Error(`Import row ${index + 1} must provide proxy_url with a port or proxy_port.`)
            }
            proxyLabel ||= autoProxyLabel(record)
            const proxy = {
                label: proxyLabel,
                url: record.proxy_url,
                port: parsed.port,
                username: parsed.username,
                password: parsed.password,
                proxyHttp: record.proxy_http,
                status: record.proxy_status || 'active',
                accountCapacity: record.account_capacity || 1,
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

function parsePipeProxy(value, rowNumber) {
    const rawProxy = String(value ?? '').trim()
    if (!rawProxy) throw new Error(`Import row ${rowNumber} is missing proxy.`)

    // Also accept a normal URL so this format can be mixed into existing workflows.
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(rawProxy)) {
        const parsed = parseProxyParts({ url: rawProxy })
        if (!parsed.host || !parsed.port) {
            throw new Error(`Import row ${rowNumber} has an invalid proxy; expected host:port:user:pass.`)
        }
        return {
            proxy_url: parsed.host,
            proxy_port: String(parsed.port),
            proxy_username: parsed.username,
            proxy_password: parsed.password
        }
    }

    const parts = rawProxy.split(':')
    if (parts.length < 4) {
        throw new Error(`Import row ${rowNumber} has an invalid proxy; expected host:port:user:pass.`)
    }

    const [host, port, username, ...passwordParts] = parts
    if (!host || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !username) {
        throw new Error(`Import row ${rowNumber} has an invalid proxy; expected host:port:user:pass.`)
    }

    return {
        proxy_url: host,
        proxy_port: port,
        proxy_username: username,
        // Keep any additional colons in the proxy password.
        proxy_password: passwordParts.join(':')
    }
}

function parsePipeRows(content) {
    const records = []
    for (const [lineIndex, rawLine] of content.split(/\r?\n/).entries()) {
        const line = rawLine.trim()
        if (!line || line === '---' || line.startsWith('#')) continue

        const fields = line.split('|')
        if (fields.length !== 3) {
            throw new Error(`Invalid pipe import row ${lineIndex + 1}: expected email|password|host:port:user:pass.`)
        }

        const [email, password, proxy] = fields.map(field => field.trim())
        if (!email) throw new Error(`Import row ${lineIndex + 1} is missing email.`)
        if (!password) throw new Error(`Import row ${lineIndex + 1} is missing password.`)

        records.push({
            email,
            password,
            proxy_http: 'true',
            ...parsePipeProxy(proxy, lineIndex + 1)
        })
    }

    return recordsToBundle(records)
}

function parseTextFile(content) {
    const dataLines = content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && line !== '---' && !line.startsWith('#'))
    const pipeLines = dataLines.filter(line => line.includes('|'))

    if (pipeLines.length) {
        if (pipeLines.length !== dataLines.length || dataLines.some(line => line.includes('='))) {
            throw new Error('Do not mix pipe rows with KEY=value account blocks in the same .txt file.')
        }
        return parsePipeRows(content)
    }

    return parseTextBlocks(content)
}

export function loadAccountImportFile(inputPath) {
    const absolutePath = path.resolve(process.cwd(), inputPath)
    const content = fs.readFileSync(absolutePath, 'utf8')
    const extension = path.extname(absolutePath).toLowerCase()

    if (extension === '.csv') return parseCsvFile(content)
    if (extension === '.txt') return parseTextFile(content)
    if (extension === '.json') return JSON.parse(content)
    throw new Error('Unsupported import file. Use .csv, .txt, or .json.')
}
