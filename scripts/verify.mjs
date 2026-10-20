import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'shots'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1680, height: 1000, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
page.setDefaultTimeout(20000)
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300))
})
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.message).slice(0, 300)))

const clickByText = async (selector, text) => {
  const ok = await page.evaluate(
    (sel, t) => {
      const el = Array.from(document.querySelectorAll(sel)).find((e) => e.textContent?.includes(t))
      if (el) {
        el.click()
        return true
      }
      return false
    },
    selector,
    text,
  )
  if (!ok) throw new Error(`未找到 ${selector} 包含 "${text}"`)
  await sleep(350)
}

const clickNode = async (selector, dx = 40, dy = 14) => {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, selector)
  if (!box) throw new Error('node not found ' + selector)
  await page.mouse.click(box.x + dx, box.y + dy)
  await sleep(300)
}

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2', timeout: 60000 })
await sleep(1000)
await page.screenshot({ path: `${OUT}/01-empty.png` })

// 1) 图片节点 + 生成
await clickByText('.empty__actions .btn', '图片节点')
await sleep(500)
await page.$eval('.prompt__input', (el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, '雨夜霓虹街道，银发少女回眸，电影感打光，湿润地面反光')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(200)
await clickByText('.insp__actions .btn', '生成')
await page.waitForSelector('.media__img', { timeout: 20000 })
await sleep(600)
await page.screenshot({ path: `${OUT}/02-image-ok.png` })

// 2) 视频节点，先切首尾帧再连线
await clickByText('.topbar__group .btn', '视频')
await sleep(500)
await clickNode('.node--video', 40, 14)
await clickByText('.node--video .seg__btn', '首尾帧')
await sleep(400)

const ports = await page.evaluate(() => {
  const out = document.querySelector('.node--image .port--out')
  const inn = document.querySelector('.node--video .port--in')
  const c = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }
  return { out: out ? c(out) : null, inn: inn ? c(inn) : null }
})
console.log('ports', JSON.stringify(ports))

if (ports.out && ports.inn) {
  await page.mouse.move(ports.out.x, ports.out.y)
  await sleep(100)
  await page.mouse.down()
  await sleep(100)
  await page.mouse.move((ports.out.x + ports.inn.x) / 2, (ports.out.y + ports.inn.y) / 2 - 40, { steps: 14 })
  await page.mouse.move(ports.inn.x, ports.inn.y, { steps: 14 })
  await sleep(120)
  await page.mouse.up()
  await sleep(700)
}
const edgeCount = await page.evaluate(() => document.querySelectorAll('.edge__line').length)
const slotFilled = await page.evaluate(() => document.querySelectorAll('.node--video .kf__slot img').length)
console.log('edges:', edgeCount, 'keyframe slots filled:', slotFilled)
await page.click('[title="适应画布"]')
await sleep(700)
await page.screenshot({ path: `${OUT}/03-connected.png` })

// 3) @ 引用测试
await clickNode('.node--video', 40, 14)
await page.click('.prompt__input')
await page.type('.prompt__input', '@')
await sleep(400)
const mentionVisible = await page.evaluate(() => !!document.querySelector('.mention'))
const mentionCount = await page.evaluate(() => document.querySelectorAll('.mention__item').length)
await page.screenshot({ path: `${OUT}/04-mention.png` })
if (mentionVisible && mentionCount) {
  await page.click('.mention__item')
  await sleep(300)
}
const promptValue = await page.$eval('.prompt__input', (el) => el.value)
const resolved = await page.$eval('.resolved', (el) => el.textContent)
console.log('mention popover:', mentionVisible, 'items:', mentionCount)
console.log('prompt:', JSON.stringify(promptValue))
console.log('resolved:', JSON.stringify(resolved))

// 4) 生成视频（演示模式）
await clickByText('.insp__actions .btn', '生成')
await page.waitForSelector('.node--video .media__img', { timeout: 25000 })
await sleep(600)
await page.screenshot({ path: `${OUT}/05-video-ok.png` })

// 5) 导演台
await clickByText('.topbar__group .btn', '导演台')
await sleep(2200)
await page.screenshot({ path: `${OUT}/06-director.png` })
await clickByText('.director__foot-actions .btn', '发布为图片节点')
await sleep(1200)
await page.click('[title="适应画布"]')
await sleep(900)
await page.screenshot({ path: `${OUT}/07-published.png` })

const final = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.react-flow__node').length,
  edges: document.querySelectorAll('.edge__line').length,
  images: document.querySelectorAll('.node--image .media__img').length,
}))
console.log('final', JSON.stringify(final))

// 6) 右键菜单添加节点
await page.mouse.click(300, 760, { button: 'right' })
await sleep(500)
const menuOpen = await page.evaluate(() => !!document.querySelector('.menu'))
await page.screenshot({ path: `${OUT}/08-contextmenu.png` })
if (menuOpen) {
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.menu__item')).find((b) =>
      b.textContent?.includes('图片节点'),
    )
    item?.click()
  })
  await sleep(600)
}
const afterMenu = await page.evaluate(() => document.querySelectorAll('.react-flow__node').length)
console.log('context menu:', menuOpen, 'nodes after add:', afterMenu)

// 7) 刷新后持久化
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
const afterReload = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.react-flow__node').length,
  edges: document.querySelectorAll('.edge__line').length,
}))
console.log('after reload', JSON.stringify(afterReload))
await page.screenshot({ path: `${OUT}/09-reload.png` })

console.log('ERRORS:', errors.length)
errors.slice(0, 10).forEach((e) => console.log(' -', e))

await browser.close()
