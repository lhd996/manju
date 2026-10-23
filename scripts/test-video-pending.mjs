import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const state = {
  nodes: [
    {
      id: 'n1',
      type: 'video',
      position: { x: 0, y: 0 },
      selected: true,
      data: {
        kind: 'video',
        title: '视频 1',
        mode: 'text',
        prompt: '镜头缓慢推近',
        ratio: '9:16',
        seconds: 5,
        frames: [],
        refs: [],
        audios: [],
        status: 'pending',
        jobId: 'job_testpend',
        progress: 42,
        note: '平台超过 45 分钟仍在生成，任务还在平台上跑；点「继续查询」接着等，不会丢',
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
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)))
await page.evaluateOnNewDocument((s) => localStorage.setItem('manju-canvas:v1', JSON.stringify(s)), state)
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(1200)

const out = await page.evaluate(() => ({
  pendingBox: !!document.querySelector('.insp__pending'),
  pendingText: document.querySelector('.insp__pending')?.textContent?.slice(0, 120),
  buttons: Array.from(document.querySelectorAll('.insp__pending button, .insp__error button')).map((b) => b.textContent),
}))
console.log(JSON.stringify(out, null, 2))
await page.screenshot({ path: 'shots/35-video-pending.png' })
await browser.close()
