import { httpRequest } from '../util/Http'
import type { HttpRequestConfig } from '../util/Http'
import PQueue from 'p-queue'
import type { WebhookTelegramConfig } from '../interface/Config'
import type { LogLevel } from './Logger'

const telegramQueue = new PQueue({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
})

function getTelegramEmoji(level: LogLevel): string {
    switch (level) {
        case 'error':
            return '❌'
        case 'warn':
            return '⚠️'
        case 'info':
            return 'ℹ️'
        case 'debug':
            return '🐛'
        default:
            return '📝'
    }
}

export async function sendTelegram(config: WebhookTelegramConfig, content: string, level: LogLevel): Promise<void> {
    if (!config?.botToken || !config?.chatId) return

    const emoji = getTelegramEmoji(level)
    const message = `${emoji}\n\`\`\`\n${content}\n\`\`\``

    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`

    const request: HttpRequestConfig = {
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json' },
        data: {
            chat_id: config.chatId,
            text: message,
            parse_mode: 'MarkdownV2',
            disable_notification: level === 'debug'
        },
        timeout: 10000
    }

    await telegramQueue.add(async () => {
        try {
            await httpRequest(request)
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status
            if (status === 429) return
            // 401/403 usually mean a revoked bot token or wrong chat_id — the exact
            // failure that otherwise silently disables all Telegram alerts.
            console.warn(
                `[Webhook:Telegram] delivery failed${status ? ` (HTTP ${status})` : ''}: ${err instanceof Error ? err.message : String(err)}`
            )
        }
    })
}

export async function flushTelegramQueue(timeoutMs = 5000): Promise<void> {
    let timer: NodeJS.Timeout | undefined
    await Promise.race([
        telegramQueue.onIdle(),
        new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error('telegram flush timeout')), timeoutMs)
        })
    ]).catch(() => {})
    if (timer) clearTimeout(timer)
}
