const useColor = process.stdout.isTTY && !process.env.NO_COLOR

const wrap = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))

export const c = {
    dim: s => wrap('2', s),
    bold: s => wrap('1', s),
    cyan: s => wrap('36', s),
    green: s => wrap('32', s),
    yellow: s => wrap('33', s),
    red: s => wrap('31', s),
    magenta: s => wrap('35', s)
}

/** Truncate to width, adding an ellipsis; pad-right to exactly width. */
export function cell(value, width) {
    let s = value == null ? '' : String(value).replace(/\s+/g, ' ').trim()
    if (s.length > width) s = s.slice(0, Math.max(0, width - 1)) + '…'
    return s.padEnd(width)
}

/** Local, sortable timestamp: YYYY-MM-DD HH:MM */
export function fmtDate(date) {
    if (!date) return ''
    const d = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Render a list of message summaries as an aligned table. */
export function renderList(messages) {
    if (!messages.length) return c.dim('  (không có mail nào khớp)')

    const header =
        '  ' +
        c.dim(cell('#', 3)) +
        c.dim(cell('UID', 8)) +
        c.dim(cell('NGÀY', 17)) +
        c.dim(cell('TỪ', 32)) +
        c.dim('TIÊU ĐỀ')

    const rows = messages.map((m, i) => {
        const idx = cell(i + 1, 3)
        const uid = cell(m.uid, 8)
        const date = cell(fmtDate(m.date), 17)
        const from = cell(m.from, 32)
        const subject = cell(m.subject, 60)
        const line = '  ' + idx + uid + date + from + subject
        return m.seen ? line : c.bold(line)
    })

    return [header, ...rows].join('\n')
}
