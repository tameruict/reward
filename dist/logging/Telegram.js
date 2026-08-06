"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegram = sendTelegram;
exports.flushTelegramQueue = flushTelegramQueue;
const Http_1 = require("../util/Http");
const p_queue_1 = __importDefault(require("p-queue"));
const telegramQueue = new p_queue_1.default({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
});
function getTelegramEmoji(level) {
    switch (level) {
        case 'error':
            return '❌';
        case 'warn':
            return '⚠️';
        case 'info':
            return 'ℹ️';
        case 'debug':
            return '🐛';
        default:
            return '📝';
    }
}
async function sendTelegram(config, content, level) {
    if (!config?.botToken || !config?.chatId)
        return;
    const emoji = getTelegramEmoji(level);
    const message = `${emoji}\n\`\`\`\n${content}\n\`\`\``;
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const request = {
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
    };
    await telegramQueue.add(async () => {
        try {
            await (0, Http_1.httpRequest)(request);
        }
        catch (err) {
            const status = err?.response?.status;
            if (status === 429)
                return;
            // 401/403 usually mean a revoked bot token or wrong chat_id — the exact
            // failure that otherwise silently disables all Telegram alerts.
            console.warn(`[Webhook:Telegram] delivery failed${status ? ` (HTTP ${status})` : ''}: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
}
async function flushTelegramQueue(timeoutMs = 5000) {
    let timer;
    await Promise.race([
        telegramQueue.onIdle(),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('telegram flush timeout')), timeoutMs);
        })
    ]).catch(() => { });
    if (timer)
        clearTimeout(timer);
}
//# sourceMappingURL=Telegram.js.map