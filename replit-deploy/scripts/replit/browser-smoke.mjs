import { chromium } from 'patchright'

const browser = await chromium.launch({ headless: true })
try {
    const page = await browser.newPage()
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    console.log(`[replit] Chromium smoke OK: ${await page.title()}`)
} finally {
    await browser.close()
}
