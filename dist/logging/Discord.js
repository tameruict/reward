"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDiscord = sendDiscord;
exports.flushDiscordQueue = flushDiscordQueue;
const Http_1 = require("../util/Http");
const p_queue_1 = __importDefault(require("p-queue"));
const DISCORD_LIMIT = 2000;
const discordQueue = new p_queue_1.default({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
});
function truncate(text) {
    return text.length <= DISCORD_LIMIT ? text : text.slice(0, DISCORD_LIMIT - 14) + ' …(truncated)';
}
// Embed accent colour by severity so errors/warnings stand out in the channel
const LEVEL_COLOR = {
    error: 0xed4245, // red
    warn: 0xfee75c, // amber
    info: 0x5865f2, // blurple
    debug: 0x4f545c // grey
};
async function sendDiscord(discordUrl, content, level) {
    if (!discordUrl)
        return;
    const request = {
        method: 'POST',
        url: discordUrl,
        headers: { 'Content-Type': 'application/json' },
        data: {
            embeds: [{ description: truncate(content), color: LEVEL_COLOR[level] ?? LEVEL_COLOR.info }],
            allowed_mentions: { parse: [] }
        },
        timeout: 10000
    };
    await discordQueue.add(async () => {
        try {
            await (0, Http_1.httpRequest)(request);
        }
        catch (err) {
            const status = err?.response?.status;
            if (status === 429)
                return;
            // Surface delivery failures (e.g. revoked/invalid webhook URL) instead
            // of silently dropping them — otherwise alerts go invisibly to zero.
            console.warn(`[Webhook:Discord] delivery failed${status ? ` (HTTP ${status})` : ''}: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
}
async function flushDiscordQueue(timeoutMs = 5000) {
    let timer;
    await Promise.race([
        discordQueue.onIdle(),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('discord flush timeout')), timeoutMs);
        })
    ]).catch(() => { });
    if (timer)
        clearTimeout(timer);
}
//# sourceMappingURL=Discord.js.map