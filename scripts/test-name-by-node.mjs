import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OLD = { id: 'old1', kind: 'image', url: '/favicon.svg', name: '图片9', width: 736, height: 1312, createdAt: 1 }

const state = {
  nodes: [
    {
      id: 'n1',
      type: 'image',
      position: { x: 0, y: 0 },
      selected: true,
      data: {
        kind: 'image',
        title: '图片 1', // 注意：标题带空格，对齐实际默认标题
        mode: 't2i',
        prompt: '测试画面',
        size: '2K',
        ratio: '9:16',
        slots: [{ id: 's1' }],
        output: OLD,
        status: 'idle',
      },
    },
    {
      id: 'n2',
      type: 'video',
      position: { x: 500, y: 0 },
      data: {
        kind: 'video',
        title: '视频 1',
        mode: 'keyframe',
        prompt: '@图片9 战斗',
        ratio: '16:9',
        seconds: 5,
        frames: [{ id: 'f1', asset: OLD, fromNodeId: 'n1', edgeId: 'e1' }, { id: 'f2' }],
        refs: [],
        audios: [],
        status: 'idle',
      },
    },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2', type: 'asset', data: { label: '图片 1' } }],
}

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1500, height: 940 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)))

await page.evaluateOnNewDocument(() => {
  const orig = window.fetch
  window.fetch = async (input, init) => {
    if (String(input).includes('/api/generate/image')) {
      return new Response(
        JSON.stringify({
          asset: {
            id: 'new1',
            kind: 'image',
            url: '/favicon.svg?v=new',
            name: '随机名',
            width: 736,
            height: 1312,
            prompt: '测试画面',
            createdAt: Date.now(),
          },
          resolvedPrompt: '测试画面',
          elapsed: 600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return orig(input, init)
  }
})

await page.evaluateOnNewDocument((s) => localStorage.setItem('manju-canvas:v1', JSON.stringify(s)), state)
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(1200)

const before = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('manju-canvas:v1'))
  return { out: s.nodes[0].data.output.name, prompt: s.nodes[1].data.prompt, frame: s.nodes[1].data.frames[0].asset.name }
})
console.log('before:', JSON.stringify(before))

// 点第一个节点的"重跑"
await page.evaluate(() => document.querySelector('.node--image .btn--run')?.click())
await sleep(1500)

const after = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('manju-canvas:v1'))
  const n1 = s.nodes.find((n) => n.id === 'n1')
  const n2 = s.nodes.find((n) => n.id === 'n2')
  return {
    assetName: n1.data.output?.name,
    downstreamPrompt: n2.data.prompt,
    downstreamFrame: n2.data.frames[0].asset?.name,
  }
})
console.log('after:', JSON.stringify(after, null, 2))
await page.screenshot({ path: 'shots/23-name-fix.png' })
await browser.close()
