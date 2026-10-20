import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1500, height: 940 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)))

// 假生成接口：每次返回不同 id，避免真实调用
await page.evaluateOnNewDocument(() => {
  const orig = window.fetch
  window.__n = 0
  window.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/api/generate/image')) {
      window.__n += 1
      const n = window.__n
      return new Response(
        JSON.stringify({
          asset: {
            id: `fake_${n}`,
            kind: 'image',
            url: `/favicon.svg?v=${n}`,
            name: '提示词派生名',
            width: 736,
            height: 1312,
            prompt: '测试',
            createdAt: Date.now(),
          },
          resolvedPrompt: '测试',
          elapsed: 800,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return orig(input, init)
  }
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(900)

// 图片节点 + 连续生成两次
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.empty__actions .btn')).find((b) => b.textContent?.includes('图片节点'))?.click()
})
await sleep(400)
await page.$eval('.prompt__input', (el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, '测试画面')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(250)
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => document.querySelector('.insp__actions .btn')?.click())
  await sleep(1000)
}

const v1 = await page.evaluate(() => ({
  count: document.querySelectorAll('.version').length,
  currentSrc: document.querySelector('.output img')?.getAttribute('src'),
  currentIdx: Array.from(document.querySelectorAll('.version')).findIndex((v) => v.classList.contains('is-current')),
  badge: document.querySelector('.node--image .badge:not(.badge--ok):not(.badge--err)')?.textContent,
}))
console.log('versions:', JSON.stringify(v1))
await page.screenshot({ path: 'shots/20-versions.png' })

// 切换到第 2 个（v1）
if (v1.count > 1) {
  await page.evaluate(() => {
    const items = document.querySelectorAll('.version')
    items[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await sleep(500)
}
const v2 = await page.evaluate(() => ({
  currentSrc: document.querySelector('.output img')?.getAttribute('src'),
  currentIdx: Array.from(document.querySelectorAll('.version')).findIndex((v) => v.classList.contains('is-current')),
  toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent),
}))
console.log('after restore:', JSON.stringify(v2))

// 加一个参考图节点并连线
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.topbar__group .btn')).find((b) => b.textContent?.includes('图片'))?.click()
})
await sleep(500)
await page.evaluate(() => {
  const node = document.querySelectorAll('.node--image')[1]
  Array.from(node.querySelectorAll('.seg__btn')).find((b) => b.textContent?.includes('参考'))?.click()
})
await sleep(400)

const ports = await page.evaluate(() => {
  const o = document.querySelectorAll('.node--image')[0].querySelector('.port--out').getBoundingClientRect()
  const i = document.querySelectorAll('.node--image')[1].querySelector('.port--in').getBoundingClientRect()
  return { o: { x: o.x + o.width / 2, y: o.y + o.height / 2 }, i: { x: i.x + i.width / 2, y: i.y + i.height / 2 } }
})
await page.mouse.move(ports.o.x, ports.o.y)
await page.mouse.down()
await page.mouse.move((ports.o.x + ports.i.x) / 2, ports.o.y - 30, { steps: 8 })
await page.mouse.move(ports.i.x, ports.i.y, { steps: 8 })
await page.mouse.up()
await sleep(700)

const linked = await page.evaluate(() => ({
  edges: document.querySelectorAll('.edge__line').length,
  slotImg: document.querySelectorAll('.node--image')[1]?.querySelectorAll('.slots img').length,
}))
console.log('linked:', JSON.stringify(linked))

// 悬停到连线上（用命中区反查屏幕坐标）
const hitPoint = await page.evaluate(() => {
  const hit = document.querySelector('.edge__hit')
  if (!hit) return null
  const r = hit.getBoundingClientRect()
  for (let y = Math.max(0, r.top); y < Math.min(window.innerHeight, r.bottom); y += 4) {
    for (let x = Math.max(0, r.left); x < Math.min(window.innerWidth, r.right); x += 4) {
      if (document.elementFromPoint(x, y) === hit) return { x, y }
    }
  }
  return null
})
console.log('hit point:', JSON.stringify(hitPoint))

if (hitPoint) {
  await page.mouse.move(hitPoint.x, hitPoint.y)
  await sleep(350)
  const cutBox = await page.evaluate(() => {
    const b = document.querySelector('.edge__cut')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  console.log('cut button:', JSON.stringify(cutBox))
  await page.screenshot({ path: 'shots/21-edge-hover.png' })
  if (cutBox) {
    await page.mouse.click(cutBox.x, cutBox.y)
    await sleep(700)
  }
}

const afterCut = await page.evaluate(() => ({
  edges: document.querySelectorAll('.edge__line').length,
  slotImg: document.querySelectorAll('.node--image')[1]?.querySelectorAll('.slots img').length,
}))
console.log('after cut:', JSON.stringify(afterCut))
await page.screenshot({ path: 'shots/22-edge-cut.png' })

await browser.close()
