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
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300))
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)))
page.on('response', async (r) => {
  if (r.url().includes('/api/generate/')) {
    let body = ''
    try {
      body = (await r.text()).slice(0, 300)
    } catch {}
    console.log('[api]', r.status(), r.url().replace('http://127.0.0.1:5173', ''), body)
  }
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(800)

// 图片节点 + 生成
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.empty__actions .btn')).find((b) => b.textContent?.includes('图片节点'))?.click()
})
await sleep(500)
await page.$eval('.prompt__input', (el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, '雨夜街道，银发少女回眸')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(200)
await page.evaluate(() => {
  document.querySelector('.insp__actions .btn')?.click()
})
await page.waitForSelector('.media__img', { timeout: 15000 })
await sleep(500)

// 视频节点 → 首尾帧 → 连线
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.topbar__group .btn')).find((b) => b.textContent?.includes('视频'))?.click()
})
await sleep(500)
const vbox = await page.evaluate(() => {
  const r = document.querySelector('.node--video').getBoundingClientRect()
  return { x: r.x + 40, y: r.y + 14 }
})
await page.mouse.click(vbox.x, vbox.y)
await sleep(300)
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.node--video .seg__btn')).find((b) => b.textContent?.includes('首尾帧'))?.click()
})
await sleep(400)
console.log('inspector title:', await page.$eval('.insp__title', (el) => el.value))

const ports = await page.evaluate(() => {
  const o = document.querySelector('.node--image .port--out').getBoundingClientRect()
  const i = document.querySelector('.node--video .port--in').getBoundingClientRect()
  return { o: { x: o.x + o.width / 2, y: o.y + o.height / 2 }, i: { x: i.x + i.width / 2, y: i.y + i.height / 2 } }
})
await page.mouse.move(ports.o.x, ports.o.y)
await page.mouse.down()
await page.mouse.move((ports.o.x + ports.i.x) / 2, ports.o.y - 40, { steps: 10 })
await page.mouse.move(ports.i.x, ports.i.y, { steps: 10 })
await page.mouse.up()
await sleep(600)

// 写视频提示词并生成
await page.click('.prompt__input')
await page.keyboard.type('镜头缓慢推近，雨丝落下')
await sleep(300)
const before = await page.evaluate(() => ({
  title: document.querySelector('.insp__title')?.value,
  prompt: document.querySelector('.prompt__input')?.value,
  btn: document.querySelector('.insp__actions .btn')?.textContent,
  resolved: document.querySelector('.resolved')?.textContent,
}))
console.log('before run:', JSON.stringify(before))

await page.evaluate(() => document.querySelector('.insp__actions .btn')?.click())
await sleep(4000)

const after = await page.evaluate(() => ({
  toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent),
  err: document.querySelector('.insp__error')?.textContent,
  nodeErr: document.querySelector('.node--video .node__error')?.textContent,
  status: document.querySelector('.node--video .badge')?.textContent,
  hasImg: !!document.querySelector('.node--video .media__img'),
}))
console.log('after run:', JSON.stringify(after))
await page.screenshot({ path: 'shots/16-debug-video.png' })
await browser.close()
