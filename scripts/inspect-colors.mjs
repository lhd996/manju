import puppeteer from 'puppeteer-core'

const API = 'http://127.0.0.1:8787'
const list = await fetch(`${API}/api/assets`).then((r) => r.json())
const imgs = list.assets.filter((a) => a.kind === 'image').slice(0, 2)
const [a1, a2] = imgs
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
        prompt: `@${a1.name} 站在天台上回头望，@${a2.name}，背后是雨夜的城市灯海`,
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
await new Promise((r) => setTimeout(r, 1600))

const info = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.media-row'))
  return {
    rowCount: rows.length,
    rows: rows.map((r) => ({
      html: r.innerHTML.slice(0, 220),
      dot: r.querySelector('.media-row__dot')
        ? getComputedStyle(r.querySelector('.media-row__dot')).backgroundColor
        : 'no-dot',
      at: r.querySelector('.mini--at') ? getComputedStyle(r.querySelector('.mini--at')).color : 'no-at',
    })),
    tags: Array.from(document.querySelectorAll('.prompt__mirror .mtag')).map((t) => ({
      text: t.textContent,
      color: getComputedStyle(t).color,
      bg: getComputedStyle(t).backgroundColor,
    })),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
