import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1500, height: 940 },
})
const page = await browser.newPage()
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1200))
await page.click('[title="设置"]')
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: 'shots/11-settings.png' })
const hint = await page.evaluate(() => {
  const input = document.querySelector('.modal__body .input')
  return input ? input.getAttribute('placeholder') : 'not found'
})
console.log('key placeholder:', hint)
await browser.close()
