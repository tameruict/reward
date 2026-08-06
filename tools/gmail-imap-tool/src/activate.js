'use strict'

const { BrowserWindow, session } = require('electron')

const APP_PW_URL = 'https://myaccount.google.com/apppasswords'
const IMAP_SETTINGS_URL = 'https://mail.google.com/mail/u/0/#settings/fwdandpop'
// A normal desktop Chrome UA reduces Google's "browser may not be secure" blocks.
const CHROME_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
// Google shows a freshly created app password as 4 groups of 4 lowercase letters.
const APP_PW_REGEX = /\b([a-z]{4}\s[a-z]{4}\s[a-z]{4}\s[a-z]{4})\b/

function partitionFor(email) {
    return `persist:gmail-${encodeURIComponent(String(email || 'default').toLowerCase())}`
}

/**
 * Open a login window in a per-email persistent session. The user signs in
 * manually (password + 2FA + captcha), then creates an app password on Google's
 * page. We poll the DOM and capture the 16-char password when it appears.
 *
 * @returns {Promise<{ok:boolean, appPassword?:string, display?:string, cancelled?:boolean, error?:string}>}
 */
function activateAccount({ email, parent, onStatus }) {
    const partition = partitionFor(email)
    const ses = session.fromPartition(partition)
    try {
        ses.setUserAgent(CHROME_UA)
    } catch {
        /* ignore */
    }

    const win = new BrowserWindow({
        width: 1000,
        height: 820,
        parent: parent || undefined,
        title: `Đăng nhập & kích hoạt: ${email || ''}`,
        autoHideMenuBar: true,
        webPreferences: {
            partition,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    onStatus?.('Đang mở trang App Password. Hãy đăng nhập Gmail trong cửa sổ vừa mở…')
    win.loadURL(APP_PW_URL).catch(() => {})

    return new Promise(resolve => {
        let done = false
        let lastHint = ''

        const finish = result => {
            if (done) return
            done = true
            clearInterval(timer)
            resolve(result)
        }

        win.on('closed', () => finish({ ok: false, cancelled: true, error: 'Cửa sổ đã đóng trước khi lấy được App Password.' }))

        const timer = setInterval(async () => {
            if (win.isDestroyed()) return
            let text = ''
            let url = ''
            try {
                url = win.webContents.getURL()
                text = await win.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true)
            } catch {
                return
            }

            const m = text.match(APP_PW_REGEX)
            if (m) {
                onStatus?.('✓ Đã bắt được App Password!')
                finish({ ok: true, appPassword: m[1].replace(/\s+/g, ''), display: m[1] })
                return
            }

            let hint = ''
            if (/myaccount\.google\.com\/apppasswords/.test(url)) {
                hint = 'Đã tới trang App Password. Nhập tên bất kỳ rồi bấm "Create" — mã sẽ tự được lấy.'
            } else if (/accounts\.google\.com|signin|ServiceLogin|challenge/.test(url)) {
                hint = 'Hãy hoàn tất đăng nhập (mật khẩu + 2FA) trong cửa sổ…'
            }
            if (hint && hint !== lastHint) {
                lastHint = hint
                onStatus?.(hint)
            }
        }, 1500)
    })
}

/** Open Gmail POP/IMAP settings so the user can verify IMAP is on. */
function openImapSettings({ email, parent }) {
    const partition = partitionFor(email)
    try {
        session.fromPartition(partition).setUserAgent(CHROME_UA)
    } catch {
        /* ignore */
    }
    const win = new BrowserWindow({
        width: 1000,
        height: 820,
        parent: parent || undefined,
        title: `Cài đặt IMAP: ${email || ''}`,
        autoHideMenuBar: true,
        webPreferences: { partition, contextIsolation: true, nodeIntegration: false }
    })
    win.loadURL(IMAP_SETTINGS_URL).catch(() => {})
    return { ok: true }
}

module.exports = { activateAccount, openImapSettings }
