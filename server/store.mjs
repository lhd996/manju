import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nanoid } from 'nanoid'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const ASSETS_DIR = path.join(DATA_DIR, 'assets')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const INDEX_PATH = path.join(DATA_DIR, 'assets.json')

// ---------------------------------------------------------------- config

let config = {
  apiKey: process.env.AGNES_API_KEY || '',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
}

export async function loadConfig() {
  try {
    const raw = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'))
    config = { ...config, ...raw }
  } catch {
    /* first run */
  }
  return config
}

export function getConfig() {
  return config
}

export async function saveConfig(patch) {
  config = { ...config, ...patch }
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
  return config
}

export function publicConfig() {
  const k = config.apiKey || ''
  return {
    hasKey: Boolean(k),
    keyHint: k ? `${k.slice(0, 4)}···${k.slice(-4)}` : '',
    publicBaseUrl: config.publicBaseUrl || '',
  }
}

// ---------------------------------------------------------------- assets

/** @type {Record<string, any>} */
let assets = {}
let saveTimer = null

export async function loadAssets() {
  try {
    assets = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'))
  } catch {
    assets = {}
  }
  await fs.mkdir(ASSETS_DIR, { recursive: true })
}

function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(async () => {
    saveTimer = null
    try {
      await fs.writeFile(INDEX_PATH, JSON.stringify(assets, null, 2))
    } catch (err) {
      console.error('save assets failed', err)
    }
  }, 200)
}

export function getAsset(id) {
  return assets[id] || null
}

/** 生成类素材的默认名字：图片1 / 视频1（按已有编号递增），不再用提示词缩写 */
export function nextAssetName(kind = 'image') {
  const prefix = kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '图片'
  const re = new RegExp(`^${prefix}(\\d+)$`)
  let max = 0
  for (const a of Object.values(assets)) {
    const m = re.exec(a.name || '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${max + 1}`
}

export function listAssets() {
  return Object.values(assets).sort((a, b) => b.createdAt - a.createdAt)
}

export function assetFilePath(asset) {
  return path.join(ASSETS_DIR, asset.file)
}

export async function createAssetFromBuffer(buf, meta) {
  const id = meta.id || `a_${nanoid(10)}`
  const ext = meta.ext || 'png'
  const file = `${id}.${ext}`
  await fs.mkdir(ASSETS_DIR, { recursive: true })
  await fs.writeFile(path.join(ASSETS_DIR, file), buf)
  const asset = {
    id,
    file,
    kind: meta.kind || 'image',
    url: `/assets/${file}`,
    remoteUrl: meta.remoteUrl || undefined,
    name: meta.name || '未命名素材',
    width: meta.width || 0,
    height: meta.height || 0,
    duration: meta.duration || 0,
    prompt: meta.prompt || '',
    mock: Boolean(meta.mock),
    params: meta.params || undefined,
    createdAt: Date.now(),
  }
  assets[id] = asset
  scheduleSave()
  return asset
}

export async function createAssetFromDataUrl(dataUrl, meta) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '')
  if (!match) throw new Error('无效的数据格式')
  const mime = match[1] || 'image/png'
  const isBase64 = Boolean(match[2])
  const buf = isBase64 ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]))
  const ext =
    mime.includes('png') ? 'png'
    : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
    : mime.includes('webp') ? 'webp'
    : mime.includes('svg') ? 'svg'
    : mime.includes('mp4') ? 'mp4'
    : mime.includes('mpeg') ? 'mp3'
    : mime.includes('wav') ? 'wav'
    : 'bin'
  return createAssetFromBuffer(buf, { ...meta, ext })
}

export async function createAssetFromUrl(url, meta) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载素材失败：HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || ''
  const ext =
    ct.includes('png') ? 'png'
    : ct.includes('jpeg') ? 'jpg'
    : ct.includes('webp') ? 'webp'
    : ct.includes('mp4') ? 'mp4'
    : ct.includes('mpeg') ? 'mp3'
    : path.extname(new URL(url).pathname).replace('.', '') || 'bin'
  return createAssetFromBuffer(buf, { ...meta, ext, remoteUrl: meta.remoteUrl ?? url })
}

export async function readAssetAsDataUrl(asset) {
  const buf = await fs.readFile(assetFilePath(asset))
  const ext = asset.file.split('.').pop() || 'png'
  const mime =
    ext === 'svg' ? 'image/svg+xml'
    : ext === 'jpg' ? 'image/jpeg'
    : ext === 'webp' ? 'image/webp'
    : ext === 'mp4' ? 'video/mp4'
    : ext === 'mp3' ? 'audio/mpeg'
    : ext === 'wav' ? 'audio/wav'
    : 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

export async function assetSize(asset) {
  try {
    const st = await fs.stat(assetFilePath(asset))
    return st.size
  } catch {
    return 0
  }
}
