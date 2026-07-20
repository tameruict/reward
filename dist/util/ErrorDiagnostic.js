"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorDiagnostic = errorDiagnostic;
exports.unknownPageDiagnostic = unknownPageDiagnostic;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
function safePathSegment(value, fallback) {
    const sanitized = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return sanitized || fallback;
}
function unknownPageOutputDir(rawUrl, capturedAt, platform) {
    let hostname = 'unknown-host';
    let pathname = 'root';
    try {
        const url = new URL(rawUrl);
        hostname = safePathSegment(url.hostname, hostname);
        pathname = safePathSegment(url.pathname, pathname);
    }
    catch {
        pathname = safePathSegment(rawUrl, 'unknown-page');
    }
    const urlHash = (0, crypto_1.createHash)('sha256').update(rawUrl).digest('hex').slice(0, 12);
    const urlFolder = `${pathname}-${urlHash}`;
    const captureFolder = `${capturedAt.replace(/[:.]/g, '-')}-${platform}`;
    return path_1.default.join(process.cwd(), 'diagnostics', 'unknown-login-pages', hostname, urlFolder, captureFolder);
}
async function errorDiagnostic(page, error) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const folderName = `error-${timestamp}`;
        const outputDir = path_1.default.join(process.cwd(), 'diagnostics', folderName);
        if (!page) {
            return;
        }
        if (page.isClosed()) {
            return;
        }
        // Error log content
        const errorLog = `
Name: ${error.name}
Message: ${error.message}
Timestamp: ${new Date().toISOString()}
---------------------------------------------------
Stack Trace:
${error.stack || 'No stack trace available'}
        `.trim();
        const [htmlContent, screenshotBuffer] = await Promise.all([
            page.content(),
            page.screenshot({ fullPage: true, type: 'png' })
        ]);
        await promises_1.default.mkdir(outputDir, { recursive: true });
        await Promise.all([
            promises_1.default.writeFile(path_1.default.join(outputDir, 'dump.html'), htmlContent),
            promises_1.default.writeFile(path_1.default.join(outputDir, 'screenshot.png'), screenshotBuffer),
            promises_1.default.writeFile(path_1.default.join(outputDir, 'error.txt'), errorLog)
        ]);
        console.log(`Diagnostics saved to: ${outputDir}`);
    }
    catch (error) {
        console.error('Unable to create error diagnostics:', error);
    }
}
async function unknownPageDiagnostic(page, { platform }) {
    if (!page || page.isClosed())
        return null;
    const capturedAt = new Date().toISOString();
    const rawUrl = page.url();
    const outputDir = unknownPageOutputDir(rawUrl, capturedAt, platform);
    try {
        await promises_1.default.mkdir(outputDir, { recursive: true });
        const [htmlResult, screenshotResult] = await Promise.allSettled([
            page.content(),
            page.screenshot({ fullPage: true, type: 'png' })
        ]);
        const metadata = {
            url: rawUrl,
            capturedAt,
            platform,
            htmlCaptured: htmlResult.status === 'fulfilled',
            screenshotCaptured: screenshotResult.status === 'fulfilled',
            errors: [
                htmlResult.status === 'rejected'
                    ? `HTML: ${htmlResult.reason instanceof Error ? htmlResult.reason.message : String(htmlResult.reason)}`
                    : null,
                screenshotResult.status === 'rejected'
                    ? `Screenshot: ${screenshotResult.reason instanceof Error ? screenshotResult.reason.message : String(screenshotResult.reason)}`
                    : null
            ].filter((error) => error !== null)
        };
        const writes = [
            promises_1.default.writeFile(path_1.default.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
        ];
        if (htmlResult.status === 'fulfilled') {
            writes.push(promises_1.default.writeFile(path_1.default.join(outputDir, 'page.html'), htmlResult.value));
        }
        if (screenshotResult.status === 'fulfilled') {
            writes.push(promises_1.default.writeFile(path_1.default.join(outputDir, 'screenshot.png'), screenshotResult.value));
        }
        await Promise.all(writes);
        console.log(`Unknown login page diagnostics saved to: ${outputDir}`);
        return outputDir;
    }
    catch (error) {
        console.error('Unable to create unknown login page diagnostics:', error);
        return null;
    }
}
//# sourceMappingURL=ErrorDiagnostic.js.map