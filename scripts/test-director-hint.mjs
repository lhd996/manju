import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mk = (id, name) => ({ id, kind: 'image', url: '/favicon.svg', name, width: 736, height: 1312, createdAt: 1 })
const a1 = mk('a1', '钢铁侠')
const a2 = mk('a2', '奇异博士')
const dir = mk('d1', '导演台1')

const state = {
  nodes: [
    {
      id: 'n0',
      type: 'director',
      position: { x: -400, y: 0 },
      data: {
        kind: 'director',
        title: '导演台 1',
        ratio: '16:9',
        actors: [
          { id: 'a', x: -0.85, z: 0, rotY: 0, scale: 1, color: '#8b6cff' },
          { id: 'b', x: 0.9, z: 0, rotY: 0, scale: 1, color: '#22d3ee' },
        ],
        cam: { az: 0, dist: 6.2, height: 1.55, fov: 40, targetY: 1.15 },
        output: dir,
        status: 'idle',
      },
    },
    {
      id: 'n1',
      type: 'image',
      position: { x: 0, y: 0 },
      selected: true,
      data: {
        kind: 'image',
        title: '图片 2',
        mode: 'ref',
        prompt: '生成@钢铁侠 与 @奇异博士 战斗的图片，人物站位参考@导演台1',
        size: '2K',
        ratio: '16:9',
        slots: [
          { id: 's1', asset: a1 },
          { id: 's2', asset: a2 },
          { id: 's3', asset: dir, fromNodeId: 'n0', edgeId: 'e1' },
          { id: 's4' },
        ],
        status: 'idle',
      },
    },
  ],
  edges: [{ id: 'e1', source: 'n0', target: 'n1', type: 'asset', data: { label: '导演台 1' } }],
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
console.log('resolved:\n' + out.resolved)
console.log('legend:', JSON.stringify(out.map))
await page.screenshot({ path: 'shots/29-director-hint.png' })
await browser.close()
