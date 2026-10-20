import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1500, height: 940 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160))
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(900)

// 1) 用工具栏新建导演台节点
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.topbar__group .btn')).find((b) => b.textContent?.includes('导演台'))?.click()
})
await sleep(2500)

const created = await page.evaluate(() => ({
  node: !!document.querySelector('.node--director'),
  modal: !!document.querySelector('.director__card'),
  hasInputPort: !!document.querySelector('.node--director .port--in'),
  hasOutputPort: !!document.querySelector('.node--director .port--out'),
  canvas: (() => {
    const c = document.querySelector('.director__stage canvas')
    return c ? `${c.width}x${c.height}` : 'none'
  })(),
}))
console.log('创建:', JSON.stringify(created))
await page.screenshot({ path: 'shots/25-director-node-edit.png' })

// 2) 保存 → 渲染成参考图
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.director__foot-actions .btn')).find((b) => b.textContent?.includes('保存'))?.click()
})
await sleep(2500)

const saved = await page.evaluate(() => {
  const n = document.querySelector('.node--director')
  return {
    modalClosed: !document.querySelector('.director__card'),
    hasImage: !!n?.querySelector('.media__img'),
    badge: n?.querySelector('.badge')?.textContent,
  }
})
console.log('保存:', JSON.stringify(saved))
await page.screenshot({ path: 'shots/26-director-node-saved.png' })

// 3) 加一个参考生图节点并连线
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.topbar__group .btn')).find((b) => b.textContent?.includes('图片'))?.click()
})
await sleep(500)
await page.evaluate(() => {
  const nodes = document.querySelectorAll('.node--image')
  const node = nodes[nodes.length - 1]
  Array.from(node.querySelectorAll('.seg__btn')).find((b) => b.textContent?.includes('参考'))?.click()
})
await sleep(400)

const ports = await page.evaluate(() => {
  const src = document.querySelector('.node--director .port--out').getBoundingClientRect()
  const nodes = document.querySelectorAll('.node--image')
  const dst = nodes[nodes.length - 1].querySelector('.port--in').getBoundingClientRect()
  return {
    a: { x: src.x + src.width / 2, y: src.y + src.height / 2 },
    b: { x: dst.x + dst.width / 2, y: dst.y + dst.height / 2 },
  }
})
await page.mouse.move(ports.a.x, ports.a.y)
await page.mouse.down()
await page.mouse.move((ports.a.x + ports.b.x) / 2, ports.a.y - 40, { steps: 10 })
await page.mouse.move(ports.b.x, ports.b.y, { steps: 10 })
await page.mouse.up()
await sleep(800)

const linked = await page.evaluate(() => {
  const imgs = document.querySelectorAll('.node--image')
  const ref = imgs[imgs.length - 1]
  const raw = JSON.parse(localStorage.getItem('manju-canvas:v1') || '{}')
  const refNode = (raw.nodes || []).find((n) => n.id === ref?.getAttribute('data-id'))
  return {
    edges: document.querySelectorAll('.edge__line').length,
    imageNodes: imgs.length,
    slotImg: ref?.querySelectorAll('.slots img').length ?? 0,
    storedSlotAsset: refNode?.data?.slots?.[0]?.asset?.name ?? null,
  }
})
console.log('连线:', JSON.stringify(linked))
await page.screenshot({ path: 'shots/27-director-link.png' })

await browser.close()
