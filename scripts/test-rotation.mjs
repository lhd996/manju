import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1500, height: 940 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)))
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' })
await sleep(800)
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.topbar__group .btn')).find((b) => b.textContent?.includes('导演台'))?.click()
})
await sleep(2500)

const setRot = async (deg) => {
  await page.evaluate((v) => {
    const rows = Array.from(document.querySelectorAll('.slider'))
    const row = rows.find((el) => el.textContent?.includes('朝向'))
    const input = row?.querySelector('input')
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, String(v))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, deg)
  await sleep(700)
}

await setRot(90)
console.log('rot label:', await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.slider'))
  return rows.find((el) => el.textContent?.includes('朝向'))?.textContent
}))
await page.screenshot({ path: 'shots/31-rot90.png' })

await setRot(-90)
await page.screenshot({ path: 'shots/32-rot-90.png' })

// 顺便看下最终的镜头描述
console.log('brief:', await page.$eval('.brief', (el) => el.textContent?.split('\n')[1]))
await browser.close()
