import type { Ratio } from '../types'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function uid(prefix = 'n') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** 节点媒体区尺寸：统一塞进 430 的方框里，保持真实画幅比例 */
export function mediaBox(ratio: Ratio, max = 430) {
  const [a, b] = ratio.split(':').map(Number)
  const aspect = a / b
  let w = max
  let h = max / aspect
  if (h > max) {
    h = max
    w = max * aspect
  }
  return { w: Math.round(w), h: Math.round(h) }
}

export function sanitizeName(name: string) {
  return (name || '')
    .replace(/[\s，。,.!?！？、；;：:（）()【】[\]"'`<>·]/g, '')
    .trim()
    .slice(0, 24)
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export function imageSizeFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = dataUrl
  })
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

export function formatDuration(ms: number) {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}
