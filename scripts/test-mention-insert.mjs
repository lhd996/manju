import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await fetch('http://127.0.0.1:8787/api/assets').then((r) => r.json())
const imgs = list.assets.filter((a) => a.kind === 'image').slice(0, 2)
const [a1, a2] = imgs

// 纯本地播种：不调用任何生成接口
const state = {
  nodes: [
    {
      id: 'n_ref',
      type: 'image',
      position: { x: 0, y: 0 },
      selected: true,
      data: {
        kind: 'image',
        title: '镜头 12',
        mode: 'ref',
        prompt: '',
        size: '2K',
        ratio: '9:16',
        slots: [{ id: 'm1', asset: a1 }, { id: 'm2', asset: a2 }, { id: 'm3' }],
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

await page.click('.prompt__input')
await page.keyboard.type('@')
await sleep(400)
const pop = await page.evaluate(() => ({
  open: !!document.querySelector('.mention'),
  items: document.querySelectorAll('.mention__item').length,
  rect: (() => {
    const m = document.querySelector('.mention')
    if (!m) return null
    const r = m.getBoundingClientRect()
    return { top: Math.round(r.top), h: Math.round(r.height) }
  })(),
}))
console.log('popover:', JSON.stringify(pop))
await page.screenshot({ path: 'shots/17-popover.png' })

if (pop.items) {
  await page.click('.mention__item')
  await sleep(400)
}
const after = await page.evaluate(() => ({
  value: document.querySelector('.prompt__input')?.value,
  tags: Array.from(document.querySelectorAll('.prompt__mirror .mtag')).map((t) => ({
    text: t.textContent,
    color: getComputedStyle(t).color,
  })),
  popClosed: !document.querySelector('.mention'),
  resolved: document.querySelector('.resolved')?.textContent,
}))
console.log('after insert:', JSON.stringify(after, null, 2))
await page.screenshot({ path: 'shots/18-inserted.png' })

await browser.close()
