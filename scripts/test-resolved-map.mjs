import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mk = (id, name) => ({ id, kind: 'image', url: '/favicon.svg', name, width: 736, height: 1312, createdAt: 1 })
const a1 = mk('a1', '图片1')
const a2 = mk('a2', '图片3')
const a3 = mk('a3', '导演台1')

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
        prompt: '生成@图片1 与 @图片3 战斗的图片 人物站位参考@导演台1',
        size: '2K',
        ratio: '16:9',
        slots: [
          { id: 's1', asset: a1 },
          { id: 's2', asset: a2 },
          { id: 's3', asset: a3 },
          { id: 's4' },
        ],
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
await page.evaluateOnNewDocument((s) => localStorage.setItem('manju-canvas:v1', JSON.stringify(s)), state)
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(1200)

const out = await page.evaluate(() => ({
  resolved: document.querySelector('.resolved')?.textContent,
  map: Array.from(document.querySelectorAll('.resolved-map span')).map((s) => s.textContent),
}))
console.log('resolved:', out.resolved)
console.log('legend  :', JSON.stringify(out.map))
await page.screenshot({ path: 'shots/28-resolved-map.png' })
await browser.close()
