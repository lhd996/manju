import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1680, height: 1000 },
})
const page = await browser.newPage()
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 400)))
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack).slice(0, 800)))
page.on('requestfailed', (r) => console.log('[reqfail]', r.url().slice(0, 120), r.failure()?.errorText))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 2500))
await page.screenshot({ path: 'shots/debug.png' })
console.log('body text:', (await page.evaluate(() => document.body.innerText)).slice(0, 500))
console.log('nodes:', await page.evaluate(() => document.querySelectorAll('.react-flow__node').length))
await browser.close()
