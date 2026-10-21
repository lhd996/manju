import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const a1 = { id: 'a1', kind: 'image', url: '/favicon.svg', name: '钢铁侠', width: 736, height: 1312, createdAt: 1 }
const a2 = { id: 'a2', kind: 'image', url: '/favicon.svg?2', name: '奇异博士', width: 736, height: 1312, createdAt: 1 }

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
        prompt: '',
        size: '2K',
        ratio: '16:9',
        slots: [{ id: 's1', asset: a1 }, { id: 's2', asset: a2 }, { id: 's3' }],
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
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)))
await page.evaluateOnNewDocument((s) => localStorage.setItem('manju-canvas:v1', JSON.stringify(s)), state)
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(1200)

await page.click('.prompt__input')
await sleep(200)

for (let i = 0; i < 3; i++) {
  await page.keyboard.type('@')
  await sleep(350)
  await page.click('.mention__item')
  await sleep(350)
  const st = await page.evaluate(() => {
    const el = document.querySelector('.prompt__input')
    return {
      value: el.value,
      caret: el.selectionStart,
      len: el.value.length,
      focused: document.activeElement === el,
    }
  })
  console.log(`第${i + 1}次:`, JSON.stringify(st))
}

const metrics = await page.evaluate(() => {
  const el = document.querySelector('.prompt__input')
  const mirror = document.querySelector('.prompt__mirror')
  const tag = document.querySelector('.mtag')
  return {
    textareaFont: getComputedStyle(el).fontWeight,
    mirrorFont: getComputedStyle(mirror).fontWeight,
    tagFont: tag ? getComputedStyle(tag).fontWeight : 'no-tag',
    textareaScrollW: el.scrollWidth,
    mirrorScrollW: mirror.scrollWidth,
  }
})
console.log('font/width:', JSON.stringify(metrics))
await page.screenshot({ path: 'shots/34-mention-caret.png' })
await browser.close()
