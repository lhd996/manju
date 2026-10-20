import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1680, height: 1000 },
})
const page = await browser.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200))
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)))
page.on('request', (r) => {
  if (r.url().includes('/api/')) console.log('[req]', r.method(), r.url().replace('http://127.0.0.1:5173', ''))
})
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText))
page.on('response', (r) => {
  if (r.url().includes('/api/generate')) console.log('[res]', r.status())
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(900)

await page.evaluate(() => {
  Array.from(document.querySelectorAll('.empty__actions .btn')).find((b) => b.textContent?.includes('图片节点'))?.click()
})
await sleep(600)

const hasTextarea = await page.evaluate(() => !!document.querySelector('.prompt__input'))
console.log('textarea exists:', hasTextarea)

await page.$eval('.prompt__input', (el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, '雨夜街道，银发少女回眸')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(400)

const pre = await page.evaluate(() => ({
  value: document.querySelector('.prompt__input')?.value,
  mirror: document.querySelector('.prompt__mirror')?.textContent,
  resolved: document.querySelector('.resolved')?.textContent,
  btnText: document.querySelector('.insp__actions .btn')?.textContent,
  btnDisabled: document.querySelector('.insp__actions .btn')?.disabled,
}))
console.log('pre:', JSON.stringify(pre))

await page.evaluate(() => document.querySelector('.insp__actions .btn')?.click())
await sleep(2500)

const post = await page.evaluate(() => ({
  toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent),
  img: !!document.querySelector('.node--image .media__img'),
  status: document.querySelector('.node--image .badge')?.textContent,
  err: document.querySelector('.insp__error')?.textContent,
}))
console.log('post:', JSON.stringify(post))
await page.screenshot({ path: 'shots/16-debug-image.png' })
await browser.close()
