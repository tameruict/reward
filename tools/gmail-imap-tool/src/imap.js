'use strict'

const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')

/** Default sender for Microsoft account security codes. */
const MS_SECURITY_SENDER = 'account-security-noreply@accountprotection.microsoft.com'

function formatAddress(list) {
    if (!Array.isArray(list) || !list.length) return ''
    return list
        .map(a => (a.name ? `${a.name} <${a.address}>` : a.address))
        .filter(Boolean)
        .join(', ')
}

function toSummary(msg) {
    return {
        seq: msg.seq,
        uid: msg.uid,
        date: msg.internalDate || msg.envelope?.date || null,
        from: formatAddress(msg.envelope?.from),
        subject: msg.envelope?.subject || '(không có tiêu đề)',
        seen: msg.flags instanceof Set ? msg.flags.has('\\Seen') : false
    }
}

class GmailReader {
    constructor(creds) {
        this.creds = creds
        this.client = null
    }

    async connect() {
        this.client = new ImapFlow({
            host: this.creds.host || 'imap.gmail.com',
            port: Number(this.creds.port) || 993,
            secure: true,
            auth: { user: this.creds.user, pass: String(this.creds.pass || '').replace(/\s+/g, '') },
            ...(this.creds.proxy ? { proxy: this.creds.proxy } : {}),
            logger: false,
            socketTimeout: 30_000,
            greetingTimeout: 15_000,
            connectionTimeout: 15_000
        })
        await this.client.connect()
    }

    async close() {
        if (!this.client) return
        try {
            await this.client.logout()
        } catch {
            /* best-effort */
        }
        this.client = null
    }

    async _withMailbox(mailbox, fn) {
        const lock = await this.client.getMailboxLock(mailbox || 'INBOX')
        try {
            return await fn()
        } finally {
            lock.release()
        }
    }

    async listMailboxes() {
        const boxes = await this.client.list()
        return boxes.map(b => b.path)
    }

    async list({ mailbox = 'INBOX', limit = 25, unread = false, from } = {}) {
        return this._withMailbox(mailbox, async () => {
            const query = { envelope: true, flags: true, internalDate: true }

            if (unread || from) {
                const search = {}
                if (unread) search.seen = false
                if (from) search.from = from
                const uids = await this.client.search(search, { uid: true })
                if (!uids.length) return []
                const pick = uids.slice(-limit)
                const out = []
                for await (const msg of this.client.fetch(pick, query, { uid: true })) {
                    out.push(toSummary(msg))
                }
                return out.sort((a, b) => new Date(b.date) - new Date(a.date))
            }

            const total = this.client.mailbox?.exists || 0
            if (!total) return []
            const start = Math.max(1, total - limit + 1)
            const out = []
            for await (const msg of this.client.fetch(`${start}:*`, query)) {
                out.push(toSummary(msg))
            }
            return out.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit)
        })
    }

    async read(uid, { mailbox = 'INBOX', markSeen = false } = {}) {
        return this._withMailbox(mailbox, async () => {
            const msg = await this.client.fetchOne(String(uid), { source: true, envelope: true, internalDate: true }, { uid: true })
            if (!msg || !msg.source) return null

            const parsed = await simpleParser(msg.source)
            if (markSeen) {
                await this.client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {})
            }
            return {
                uid,
                from: formatAddress(msg.envelope?.from),
                to: formatAddress(msg.envelope?.to),
                date: msg.internalDate || parsed.date || null,
                subject: parsed.subject || msg.envelope?.subject || '(không có tiêu đề)',
                text: parsed.text || '',
                html: typeof parsed.html === 'string' ? parsed.html : ''
            }
        })
    }

    async otp({ mailbox = 'INBOX', minutes = 10, from = [MS_SECURITY_SENDER], regex = /\b(\d{6,8})\b/ } = {}) {
        return this._withMailbox(mailbox, async () => {
            const cutoff = new Date(Date.now() - minutes * 60_000)
            const since = new Date(cutoff)
            since.setHours(0, 0, 0, 0)

            const senders = Array.isArray(from) && from.length ? from : [null]
            const uidSet = new Set()
            for (const sender of senders) {
                const search = { since }
                if (sender) search.from = sender
                const found = await this.client.search(search, { uid: true })
                for (const u of found) uidSet.add(u)
            }
            if (!uidSet.size) return null

            const uids = [...uidSet].sort((a, b) => b - a)
            for (const uid of uids) {
                const msg = await this.client.fetchOne(String(uid), { source: true, envelope: true, internalDate: true }, { uid: true })
                if (!msg || !msg.source) continue

                const when = msg.internalDate || msg.envelope?.date
                if (when && new Date(when) < cutoff) continue

                const parsed = await simpleParser(msg.source)
                const haystack = `${parsed.subject || ''}\n${parsed.text || ''}`
                const match = haystack.match(regex)
                if (match) {
                    return {
                        code: match[1] || match[0],
                        uid,
                        from: formatAddress(msg.envelope?.from),
                        subject: parsed.subject || '(không có tiêu đề)',
                        date: when ? new Date(when) : null
                    }
                }
            }
            return null
        })
    }
}

module.exports = { GmailReader, MS_SECURITY_SENDER }
