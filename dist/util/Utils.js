"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBrowserClosedError = isBrowserClosedError;
const ms_1 = __importDefault(require("ms"));
function isBrowserClosedError(error) {
    const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
    if (!msg)
        return false;
    return (msg.includes('has been closed') ||
        msg.includes('target closed') ||
        msg.includes('target page, context or browser') ||
        msg.includes('browser has disconnected') ||
        msg.includes('browser closed') ||
        msg.includes('connection closed') ||
        msg.includes('session closed') ||
        msg.includes('page closed') ||
        msg.includes('websocket connection closed'));
}
class Util {
    async wait(time) {
        if (typeof time === 'string') {
            time = this.stringToNumber(time);
        }
        return new Promise(resolve => {
            setTimeout(resolve, time);
        });
    }
    getFormattedDate(ms = Date.now()) {
        const today = new Date(ms);
        const month = String(today.getMonth() + 1).padStart(2, '0'); // January is 0
        const day = String(today.getDate()).padStart(2, '0');
        const year = today.getFullYear();
        return `${month}/${day}/${year}`;
    }
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const a = array[i];
            const b = array[j];
            if (a === undefined || b === undefined)
                continue;
            array[i] = b;
            array[j] = a;
        }
        return array;
    }
    randomNumber(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    chunkArray(arr, numChunks) {
        const chunkSize = Math.ceil(arr.length / numChunks);
        const chunks = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize);
            chunks.push(chunk);
        }
        return chunks;
    }
    stringToNumber(input) {
        if (typeof input === 'number') {
            return input;
        }
        const value = input.trim();
        const milisec = (0, ms_1.default)(value);
        if (milisec === undefined) {
            throw new Error(`The input provided (${input}) cannot be parsed to a valid time! Use a format like "1 min", "1m" or "1 minutes"`);
        }
        return milisec;
    }
    normalizeString(string) {
        return string
            .normalize('NFD')
            .trim()
            .toLowerCase()
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/[?!]/g, '');
    }
    getEmailUsername(email) {
        return email.split('@')[0] ?? 'Unknown';
    }
    randomDelay(min, max) {
        const minMs = typeof min === 'number' ? min : this.stringToNumber(min);
        const maxMs = typeof max === 'number' ? max : this.stringToNumber(max);
        return Math.floor(this.randomNumber(minMs, maxMs));
    }
    serverActionAcknowledged(response) {
        const text = typeof response === 'string' ? response : String(response ?? '');
        return /^\d+:true\s*$/m.test(text);
    }
}
exports.default = Util;
//# sourceMappingURL=Utils.js.map