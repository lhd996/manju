import puppeteer from 'puppeteer-core'

const API = 'http://127.0.0.1:8787'
const list = await fetch(`${API}/api/assets`).then((r) => r.json())
const imgs = list.assets.filter((a) => a.kind === 'image').slice(0, 2)
if (imgs.length < 2) {
  console.error('素材不足，先跑一次生成')
  process.exit(1)
}
console.log('using:', imgs.map((a) => a.name).join(' / '))

const [a1, a2] = imgs
const prompt = `@${a1.name} 站在天台上回头望，@${a2.name}，背后是雨夜的城市灯海`

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
        prompt,
        size: '2K',
        ratio: '9:16',
        slots: [
          { id: 'm1', asset: a1 },
          { id: 'm2', asset: a2 },
          { id: 'm3' },
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
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)))
await page.evaluateOnNewDocument((s) => {
  localStorage.setItem('manju-canvas:v1', JSON.stringify(s))
}, state)
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))

await page.screenshot({ path: 'shots/12-mention-colors.png' })

const info = await page.evaluate(() => {
  const tags = Array.from(document.querySelectorAll('.prompt__mirror .mtag'))
  return {
    tagCount: tags.length,
    colors: tags.map((t) => getComputedStyle(t).color),
    mirrorText: document.querySelector('.prompt__mirror')?.textContent?.slice(0, 80),
    resolved: document.querySelector('.resolved')?.textContent,
    textareaColor: getComputedStyle(document.querySelector('.prompt__input')).color,
    dots: Array.from(document.querySelectorAll('.media-row__dot')).map((d) => getComputedStyle(d).backgroundColor),
  }
})
console.log(JSON.stringify(info, null, 2))

await browser.close()
