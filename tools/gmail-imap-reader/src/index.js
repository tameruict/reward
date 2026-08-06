#!/usr/bin/env node
import { resolveCredentials, listConfiguredAccounts } from './config.js'
import { GmailReader, MS_SECURITY_SENDER } from './imap.js'
import { c, renderList, fmtDate } from './format.js'

function parseArgs(argv) {
    const _ = []
    const flags = {}
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a.startsWith('--')) {
            const key = a.slice(2)
            const next = argv[i + 1]
            if (next === undefined || next.startsWith('--')) {
                flags[key] = true
            } else {
                flags[key] = next
                i++
            }
        } else {
            _.push(a)
        }
    }
    return { _, flags }
}

const HELP = `
${c.bold('gmail-imap-reader')} — đọc Gmail qua IMAP (tool độc lập)

${c.bold('Cách dùng:')}
  node src/index.js <lệnh> [tuỳ chọn]

${c.bold('Lệnh:')}
  ${c.cyan('list')}                Liệt kê mail gần nhất
  ${c.cyan('read <uid>')}          Đọc nội dung 1 mail theo UID
  ${c.cyan('search')}             Tìm mail theo bộ lọc
  ${c.cyan('otp')}                Lấy mã xác minh (OTP) mới nhất
  ${c.cyan('mailboxes')}          Liệt kê thư mục/nhãn
  ${c.cyan('accounts')}           Xem các account đã cấu hình
  ${c.cyan('help')}               Hiện trợ giúp này

${c.bold('Chọn account (nếu có nhiều):')}
  --account <label>     Chọn theo nhãn trong accounts.json
  --user <email>        Chọn theo email (accounts.json/.env) hoặc dùng chung với --pass
  --pass "<app pass>"   App Password trực tiếp (không khuyến khích, lộ trong lịch sử lệnh)

${c.bold('Tuỳ chọn theo lệnh:')}
  list      --limit <n> (20)  --unread  --from <email>  --mailbox <tên> (INBOX)
  search    --from <email>  --subject <chuỗi>  --text <chuỗi>  --unread  --since <ngày>  --limit <n>
  read      --html            In bản HTML thay vì text   --mark-seen  Đánh dấu đã đọc
  otp       --minutes <m> (10)  --from <email>  --any  --regex <mẫu>  --wait <giây>

${c.bold('Ví dụ:')}
  node src/index.js list --limit 10
  node src/index.js list --unread --from ${MS_SECURITY_SENDER}
  node src/index.js read 1234
  node src/index.js otp --minutes 5
  node src/index.js otp --wait 60          # chờ tối đa 60s cho tới khi có mã
  node src/index.js search --subject "security code" --since 3
`

function printMessageBody(msg, wantHtml) {
    console.log(c.dim('─'.repeat(60)))
    console.log(c.bold('Từ:      ') + msg.from)
    if (msg.to) console.log(c.bold('Đến:     ') + msg.to)
    console.log(c.bold('Ngày:    ') + fmtDate(msg.date))
    console.log(c.bold('Tiêu đề: ') + msg.subject)
    console.log(c.dim('─'.repeat(60)))
    if (wantHtml && msg.html) {
        console.log(msg.html)
    } else {
        console.log(msg.text || c.dim('(không có nội dung text; thử --html)'))
    }
    console.log(c.dim('─'.repeat(60)))
}

async function main() {
    const { _, flags } = parseArgs(process.argv.slice(2))
    const command = _[0] || 'help'

    if (command === 'help' || flags.help) {
        console.log(HELP)
        return
    }

    if (command === 'accounts') {
        const accounts = listConfiguredAccounts()
        if (!accounts.length) {
            console.log(c.yellow('Chưa cấu hình account nào. Tạo .env hoặc accounts.json (xem *.example).'))
            return
        }
        console.log(c.bold('\nCác account đã cấu hình:'))
        for (const a of accounts) {
            const pass = a.hasPass ? c.green('có app password') : c.red('THIẾU app password')
            const label = a.label && a.label !== a.user ? c.dim(`[${a.label}] `) : ''
            console.log(`  ${label}${a.user}  ${c.dim('(' + a.source + ')')}  ${pass}`)
        }
        console.log('')
        return
    }

    // Everything else needs a live connection.
    const creds = resolveCredentials(flags)
    const reader = new GmailReader(creds)

    try {
        console.error(c.dim(`Đang kết nối ${creds.user} @ ${creds.host}:${creds.port} …`))
        await reader.connect()
        console.error(c.green('✓ Kết nối thành công') + c.dim(` (account: ${creds.label})`))

        switch (command) {
            case 'mailboxes': {
                const boxes = await reader.listMailboxes()
                console.log(c.bold('\nThư mục / nhãn:'))
                for (const b of boxes) console.log('  ' + b)
                console.log('')
                break
            }

            case 'list': {
                const messages = await reader.list({
                    mailbox: flags.mailbox,
                    limit: Number(flags.limit) || 20,
                    unread: Boolean(flags.unread),
                    from: typeof flags.from === 'string' ? flags.from : undefined
                })
                console.log('')
                console.log(renderList(messages))
                console.log(c.dim(`\n  ${messages.length} mail (in đậm = chưa đọc). Dùng: read <uid>`))
                console.log('')
                break
            }

            case 'search': {
                const messages = await reader.search({
                    mailbox: flags.mailbox,
                    limit: Number(flags.limit) || 20,
                    from: typeof flags.from === 'string' ? flags.from : undefined,
                    subject: typeof flags.subject === 'string' ? flags.subject : undefined,
                    text: typeof flags.text === 'string' ? flags.text : undefined,
                    unread: Boolean(flags.unread),
                    sinceDays: Number(flags.since) || undefined
                })
                console.log('')
                console.log(renderList(messages))
                console.log(c.dim(`\n  ${messages.length} kết quả.`))
                console.log('')
                break
            }

            case 'read': {
                const uid = Number(_[1] || flags.uid)
                if (!uid) {
                    console.error(c.red('Thiếu UID. Ví dụ: node src/index.js read 1234'))
                    process.exitCode = 2
                    break
                }
                const msg = await reader.read(uid, { mailbox: flags.mailbox, markSeen: Boolean(flags['mark-seen']) })
                if (!msg) {
                    console.error(c.yellow(`Không tìm thấy mail UID ${uid}.`))
                    process.exitCode = 1
                    break
                }
                printMessageBody(msg, Boolean(flags.html))
                break
            }

            case 'otp': {
                let regex
                if (typeof flags.regex === 'string') {
                    try {
                        regex = new RegExp(flags.regex)
                    } catch (e) {
                        console.error(c.red(`--regex không hợp lệ: ${e.message}`))
                        process.exitCode = 2
                        break
                    }
                }
                const from = flags.any ? null : typeof flags.from === 'string' ? [flags.from] : undefined
                const opts = {
                    mailbox: flags.mailbox,
                    minutes: Number(flags.minutes) || 10,
                    ...(from !== undefined ? { from } : {}),
                    ...(regex ? { regex } : {})
                }

                const waitSeconds = Number(flags.wait) || 0
                const hit = waitSeconds
                    ? await reader.waitForOtp({ ...opts, timeoutMs: waitSeconds * 1000 })
                    : await reader.otp(opts)

                if (!hit) {
                    console.error(c.yellow('Không tìm thấy mã OTP nào phù hợp.'))
                    process.exitCode = 1
                    break
                }
                // Mã in ra stdout (dễ pipe), thông tin phụ ra stderr.
                console.error(c.dim(`Từ: ${hit.from} | ${fmtDate(hit.date)} | "${hit.subject}"`))
                console.log(c.green(c.bold(hit.code)))
                break
            }

            default:
                console.error(c.red(`Lệnh không hợp lệ: "${command}"`))
                console.log(HELP)
                process.exitCode = 2
        }
    } finally {
        await reader.close()
    }
}

main().catch(err => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('\n' + c.red('Lỗi: ') + msg)
    if (/auth|credential|login|invalid/i.test(msg)) {
        console.error(
            c.dim(
                '  Gợi ý: Gmail cần App Password (16 ký tự) + bật xác minh 2 bước.\n' +
                    '  Tạo tại https://myaccount.google.com/apppasswords'
            )
        )
    }
    process.exitCode = 1
})
