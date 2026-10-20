// 演示模式素材生成：不依赖任何外部服务，直接产出 SVG。
// 目的：没有 API Key 时整条画布链路依然可用、可演示。

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function ratioDims(ratio) {
  switch (ratio) {
    case '16:9':
      return { width: 1280, height: 720 }
    case '9:16':
      return { width: 720, height: 1280 }
    default:
      return { width: 1024, height: 1024 }
  }
}

function wrap(text, maxChars, maxLines) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ['（空提示词）']
  const lines = []
  let cur = ''
  for (const ch of clean) {
    cur += ch
    if (cur.length >= maxChars) {
      lines.push(cur)
      cur = ''
      if (lines.length >= maxLines) break
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  if (lines.length === maxLines && clean.length > lines.join('').length) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…'
  }
  return lines
}

export function mockImageSvg({ prompt = '', ratio = '1:1', size = '2K', tag = 'MOCK IMAGE' } = {}) {
  const { width: w, height: h } = ratioDims(ratio)
  const seed = hash(prompt + ratio + size)
  const h1 = seed % 360
  const h2 = (h1 + 58) % 360
  const base = Math.min(w, h)
  const fs1 = base * 0.033
  const fs2 = base * 0.021
  const lines = wrap(prompt, Math.max(10, Math.floor((w * 0.82) / (fs2 * 0.62))), 7)
  const cx = w / 2
  const cy = h / 2
  const r = base * 0.26

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h1} 42% 13%)"/>
      <stop offset="0.55" stop-color="hsl(${h2} 38% 9%)"/>
      <stop offset="1" stop-color="hsl(${(h1 + 20) % 360} 45% 6%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="52%">
      <stop offset="0" stop-color="hsl(${h2} 90% 62%)" stop-opacity="0.34"/>
      <stop offset="1" stop-color="hsl(${h2} 90% 62%)" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="${base * 0.06}" height="${base * 0.06}" patternUnits="userSpaceOnUse">
      <path d="M ${base * 0.06} 0 L 0 0 0 ${base * 0.06}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy - base * 0.04}" r="${r}" fill="none" stroke="hsl(${h2} 85% 70%)" stroke-opacity="0.45" stroke-width="${base * 0.004}"/>
  <circle cx="${cx}" cy="${cy - base * 0.04}" r="${r * 0.62}" fill="hsl(${h2} 85% 62%)" fill-opacity="0.10"/>
  <path d="M ${cx - r * 0.9} ${cy - base * 0.04} A ${r * 0.9} ${r * 0.9} 0 0 1 ${cx + r * 0.9} ${cy - base * 0.04}"
        fill="none" stroke="hsl(${h2} 90% 76%)" stroke-opacity="0.30" stroke-width="${base * 0.005}"/>
  <path d="M ${cx - r * 0.62} ${cy - base * 0.04 + r * 0.2} A ${r * 0.62} ${r * 0.62} 0 0 1 ${cx + r * 0.62} ${cy - base * 0.04 + r * 0.2}"
        fill="none" stroke="hsl(${h2} 90% 80%)" stroke-opacity="0.18" stroke-width="${base * 0.004}"/>
  <circle cx="${cx + r * 0.52}" cy="${cy - base * 0.04 - r * 0.52}" r="${base * 0.012}" fill="hsl(${h2} 95% 84%)" fill-opacity="0.7"/>
  <g font-family="'Inter','PingFang SC','Microsoft YaHei',sans-serif" fill="#ffffff">
    <text x="${w * 0.06}" y="${h * 0.085}" font-size="${fs1}" font-weight="700" letter-spacing="${base * 0.004}" opacity="0.92">${esc(tag)}</text>
    <text x="${w * 0.06}" y="${h * 0.085 + fs1 * 1.15}" font-size="${fs2 * 0.92}" opacity="0.55">${esc(ratio)} · ${esc(size)} · 演示占位图</text>
  </g>
  <g font-family="'Inter','PingFang SC','Microsoft YaHei',sans-serif" fill="#ffffff" opacity="0.88">
    ${lines
      .map(
        (line, i) =>
          `<text x="${w * 0.06}" y="${h - h * 0.06 - (lines.length - 1 - i) * fs2 * 1.5}" font-size="${fs2}" opacity="${0.9 - i * 0.06}">${esc(line)}</text>`,
      )
      .join('\n    ')}
  </g>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
</svg>`
}

export function mockVideoPosterSvg({ prompt = '', ratio = '16:9', seconds = 5, tag = 'MOCK VIDEO' } = {}) {
  const { width: w, height: h } = ratioDims(ratio)
  const seed = hash(prompt + 'video' + seconds)
  const h1 = seed % 360
  const base = Math.min(w, h)
  const fs2 = base * 0.021
  const lines = wrap(prompt, Math.max(10, Math.floor((w * 0.8) / (fs2 * 0.62))), 4)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="v" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="hsl(${h1} 46% 10%)"/>
      <stop offset="1" stop-color="hsl(${(h1 + 42) % 360} 52% 7%)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#v)"/>
  <g opacity="0.30" stroke="hsl(${(h1 + 30) % 360} 90% 66%)" fill="none" stroke-width="${base * 0.006}">
    <circle cx="${w / 2}" cy="${h / 2}" r="${base * 0.19}"/>
  </g>
  <path d="M ${w / 2 - base * 0.05} ${h / 2 - base * 0.08} L ${w / 2 + base * 0.09} ${h / 2} L ${w / 2 - base * 0.05} ${h / 2 + base * 0.08} Z" fill="#fff" fill-opacity="0.92"/>
  <g font-family="'Inter','PingFang SC','Microsoft YaHei',sans-serif" fill="#fff">
    <text x="${w * 0.06}" y="${h * 0.1}" font-size="${base * 0.032}" font-weight="700" opacity="0.9">${esc(tag)}</text>
    <text x="${w * 0.06}" y="${h * 0.1 + base * 0.05}" font-size="${fs2 * 0.9}" opacity="0.55">${esc(ratio)} · ${esc(String(seconds))}s · 演示占位</text>
    ${lines
      .map(
        (line, i) =>
          `<text x="${w * 0.06}" y="${h - h * 0.07 - (lines.length - 1 - i) * fs2 * 1.5}" font-size="${fs2}" opacity="0.8">${esc(line)}</text>`,
      )
      .join('\n    ')}
  </g>
</svg>`
}
