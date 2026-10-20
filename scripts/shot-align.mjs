import puppeteer from 'puppeteer-core'

const list = await fetch('http://127.0.0.1:8787/api/assets').then((r) => r.json())
const imgs = list.assets.filter((a) => a.kind === 'image').slice(0, 3)
console.log('assets:', imgs.map((a) => a.name))

const slots = imgs.map((a, i) => ({ id: `m${i}`, asset: a }))
slots.push({ id: 'mempty' })
const prompt = imgs.map((a) => `@${a.name}`).join(' 和 ') + ' 站在天台上，镜头缓慢推近，雨夜霓虹'

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
        slots,
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
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: 'shots/13-mention-3colors.png' })

// 对齐检测：把 textarea 文字染成半透明红，若与镜像文字完全重合说明逐像素对齐
await page.addStyleTag({
  content:
    '.prompt__input{color:rgba(255,60,60,.85) !important;-webkit-text-fill-color:rgba(255,60,60,.85) !important;}',
})
await new Promise((r) => setTimeout(r, 300))
await page.screenshot({ path: 'shots/14-align-check.png' })

// 键盘输入：验证输入后背层同步、光标可用
await page.click('.prompt__input')
await page.keyboard.press('End')
await page.keyboard.type('，雨丝打湿衣角')
await new Promise((r) => setTimeout(r, 500))
const after = await page.evaluate(() => ({
  mirror: document.querySelector('.prompt__mirror')?.textContent?.slice(-30),
  value: document.querySelector('.prompt__input')?.value.slice(-30),
  tags: document.querySelectorAll('.prompt__mirror .mtag').length,
}))
console.log(JSON.stringify(after, null, 2))
await page.screenshot({ path: 'shots/15-after-typing.png' })

await browser.close()
