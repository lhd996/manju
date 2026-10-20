import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1500, height: 940 },
})
const page = await browser.newPage()

// 拦截生成接口，避免真实调用；返回一个"名字来自提示词"的假资产
await page.evaluateOnNewDocument(() => {
  const orig = window.fetch
  window.__call = 0
  window.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/api/generate/image')) {
      window.__call = (window.__call || 0) + 1
      return new Response(
        JSON.stringify({
          asset: {
            id: `fake_${window.__call}`,
            kind: 'image',
            url: '/favicon.svg',
            name: '雨夜街道银发少女',
            width: 1472,
            height: 2624,
            prompt: '雨夜街道，银发少女回眸',
            createdAt: Date.now(),
          },
          resolvedPrompt: 'x',
          elapsed: 1200,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return orig(input, init)
  }
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(900)
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.empty__actions .btn')).find((b) => b.textContent?.includes('图片节点'))?.click()
})
await sleep(500)
await page.$eval('.prompt__input', (el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, '雨夜街道，银发少女回眸')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(300)

// 连点两次生成
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => document.querySelector('.insp__actions .btn')?.click())
  await sleep(900)
}

const names = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('manju-canvas:v1') || '{}')
  return (raw.nodes || []).map((n) => n.data?.output?.name).filter(Boolean)
})
console.log('生成的素材默认名:', JSON.stringify(names))

// 看看 @ 弹窗里显示什么名字
const popNames = await page.evaluate(() => {
  // 直接把最后一个产物塞进一个 ref 节点的槽里，验证 @ 显示名
  const raw = JSON.parse(localStorage.getItem('manju-canvas:v1') || '{}')
  const asset = raw.nodes[0]?.data?.output
  return asset ? asset.name : null
})
console.log('asset.name:', popNames)

await page.screenshot({ path: 'shots/19-default-name.png' })
await browser.close()
