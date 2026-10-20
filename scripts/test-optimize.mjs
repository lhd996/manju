import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const a1 = { id: 'a1', kind: 'image', url: '/favicon.svg', name: '钢铁侠', width: 736, height: 1312, createdAt: 1 }

const state = {
  nodes: [
    {
      id: 'n1',
      type: 'image',
      position: { x: 0, y: 0 },
      selected: true,
      data: {
        kind: 'image',
        title: '图片 1',
        mode: 'ref',
        prompt: '@钢铁侠 在废墟里挥拳，画面要燃',
        size: '2K',
        ratio: '16:9',
        slots: [{ id: 's1', asset: a1 }, { id: 's2' }],
        status: 'idle',
      },
    },
  ],
  edges: [],
}

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1500, height: 940 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)))
page.on('response', async (r) => {
  if (r.url().includes('/api/optimize-prompt')) {
    let t = ''
    try {
      t = (await r.text()).slice(0, 200)
    } catch {}
    console.log('[api]', r.status(), t)
  }
})

await page.evaluateOnNewDocument((s) => localStorage.setItem('manju-canvas:v1', JSON.stringify(s)), state)
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(1200)

const before = await page.$eval('.prompt__input', (el) => el.value)
console.log('before:', before)

const hasBtn = await page.evaluate(() => !!document.querySelector('.mini--spark'))
console.log('button:', hasBtn)

await page.evaluate(() => document.querySelector('.mini--spark')?.click())
// 文本模型一般几秒内返回
for (let i = 0; i < 40; i++) {
  await sleep(1000)
  const busy = await page.evaluate(() => document.querySelector('.mini--spark')?.textContent?.includes('优化中'))
  if (!busy) break
}

const after = await page.$eval('.prompt__input', (el) => el.value)
const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent))
console.log('after :', after)
console.log('keeps @token:', after.includes('@钢铁侠'))
console.log('toasts:', JSON.stringify(toasts))
await page.screenshot({ path: 'shots/30-optimize.png' })
await browser.close()
