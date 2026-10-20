import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await fetch('http://127.0.0.1:8787/api/assets').then((r) => r.json())
const img = list.assets.find((a) => a.kind === 'image')
if (!img) {
  console.error('没有可用素材')
  process.exit(1)
}
const seed = {
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
        prompt: '',
        size: '2K',
        ratio: '9:16',
        slots: [{ id: 'm1', asset: img }, { id: 'm2' }],
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
await page.evaluateOnNewDocument((s) => localStorage.setItem('manju-canvas:v1', JSON.stringify(s)), seed)
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(1200)

// 场景 1：中文紧贴 @（"画面@"），这是之前触发不了的写法
const r1 = await page.evaluate(() => {
  const el = document.querySelector('.prompt__input')
  el.focus()
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, '生成他们战斗的画面@')
  el.setSelectionRange(el.value.length, el.value.length)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return el.value
})
await sleep(400)
const pop1 = await page.evaluate(() => ({
  open: !!document.querySelector('.mention'),
  items: document.querySelectorAll('.mention__item').length,
}))
console.log('中文紧贴 @ ->', JSON.stringify(pop1), 'value:', r1)
await page.screenshot({ path: 'shots/24-at-after-chinese.png' })

// 点选插入
if (pop1.items) {
  await page.click('.mention__item')
  await sleep(400)
}
const after = await page.evaluate(() => ({
  value: document.querySelector('.prompt__input')?.value,
  tags: Array.from(document.querySelectorAll('.prompt__mirror .mtag')).map((t) => t.textContent),
}))
console.log('插入后 ->', JSON.stringify(after))

await browser.close()
