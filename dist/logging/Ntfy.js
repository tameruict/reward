"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNtfy = sendNtfy;
exports.flushNtfyQueue = flushNtfyQueue;
const Http_1 = require("../util/Http");
const p_queue_1 = __importDefault(require("p-queue"));
const ntfyQueue = new p_queue_1.default({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
});
async function sendNtfy(config, content, level) {
    if (!config?.url)
        return;
    switch (level) {
        case 'error':
            config.priority = 5; // Highest
            break;
        case 'warn':
            config.priority = 4;
            break;
        default:
            break;
    }
    const headers = { 'Content-Type': 'text/plain' };
    if (config.title)
        headers['Title'] = config.title;
    if (config.tags?.length)
        headers['Tags'] = config.tags.join(',');
    if (config.priority)
        headers['Priority'] = String(config.priority);
    if (config.token)
        headers['Authorization'] = `Bearer ${config.token}`;
    const url = config.topic ? `${config.url}/${config.topic}` : config.url;
    const request = {
        method: 'POST',
        url: url,
        headers,
        data: content,
        timeout: 10000
    };
    await ntfyQueue.add(async () => {
        try {
            await (0, Http_1.httpRequest)(request);
        }
        catch (err) {
            const status = err?.response?.status;
            if (status === 429)
                return;
            console.warn(`[Webhook:Ntfy] delivery failed${status ? ` (HTTP ${status})` : ''}: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
}
async function flushNtfyQueue(timeoutMs = 5000) {
    let timer;
    await Promise.race([
        ntfyQueue.onIdle(),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('ntfy flush timeout')), timeoutMs);
        })
    ]).catch(() => { });
    if (timer)
        clearTimeout(timer);
}
//# sourceMappingURL=Ntfy.js.map