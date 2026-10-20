import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1680, height: 1000 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message)))
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 800))

// 添加一个图片节点
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('.empty__actions .btn')).find((b) =>
    b.textContent?.includes('图片节点'),
  )
  btn?.click()
})
await new Promise((r) => setTimeout(r, 600))

const box0 = await page.evaluate(() => {
  const r = document.querySelector('.node--image').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})

// 从标题栏拖动
await page.mouse.move(box0.x + 120, box0.y + 16)
await page.mouse.down()
const t0 = Date.now()
for (let i = 1; i <= 20; i++) {
  await page.mouse.move(box0.x + 120 + i * 8, box0.y + 16 + i * 5)
  await new Promise((r) => setTimeout(r, 12))
}
await page.mouse.up()
const dragMs = Date.now() - t0
await new Promise((r) => setTimeout(r, 300))

const box1 = await page.evaluate(() => {
  const r = document.querySelector('.node--image').getBoundingClientRect()
  return { x: r.x, y: r.y }
})

// 从画面区域拖动
await page.mouse.move(box1.x + 120, box1.y + 220)
await page.mouse.down()
for (let i = 1; i <= 15; i++) {
  await page.mouse.move(box1.x + 120 - i * 6, box1.y + 220 + i * 4)
  await new Promise((r) => setTimeout(r, 12))
}
await page.mouse.up()
await new Promise((r) => setTimeout(r, 300))

const box2 = await page.evaluate(() => {
  const r = document.querySelector('.node--image').getBoundingClientRect()
  return { x: r.x, y: r.y }
})

console.log('start ', JSON.stringify(box0))
console.log('after header drag', JSON.stringify(box1), 'moved:', Math.round(box1.x - box0.x), Math.round(box1.y - box0.y), `${dragMs}ms`)
console.log('after media drag ', JSON.stringify(box2), 'moved:', Math.round(box2.x - box1.x), Math.round(box2.y - box1.y))

await page.screenshot({ path: 'shots/10-drag.png' })
await browser.close()
