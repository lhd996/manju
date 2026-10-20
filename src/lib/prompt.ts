import type { CSSProperties } from 'react'
import type { AnyNodeData, Asset, CanvasNode, ImageNodeData, MediaInput, VideoNodeData } from '../types'
import { sanitizeName } from './media'

export type MediaRole = 'ref' | 'first' | 'last' | 'image' | 'audio'
export type MediaField = 'slots' | 'frames' | 'refs' | 'audios'

export interface MediaEntry {
  field: MediaField
  index: number
  role: MediaRole
  input: MediaInput
  asset: Asset
  /** 这一路来自导演台（3D 站位示意） */
  fromDirector: boolean
}

export interface Mentionable {
  key: string
  name: string
  asset: Asset
  role: MediaRole
  field: MediaField
  index: number
  input: MediaInput
  /** 这一路来自导演台（3D 站位示意），需要特殊提示 */
  fromDirector: boolean
}

/** 把一路输入解析成真实素材：直接上传的，或者上游节点传下来的 */
export function resolveMedia(input: MediaInput | undefined, nodes: CanvasNode[]): Asset | undefined {
  if (!input) return undefined
  if (input.asset) return input.asset
  if (!input.fromNodeId) return undefined
  const source = nodes.find((n) => n.id === input.fromNodeId)
  const data = source?.data as unknown as AnyNodeData | undefined
  return data?.output
}

/** 当前节点实际引用的所有素材，顺序即提交给模型的顺序 */
export function mediaEntries(data: AnyNodeData, nodes: CanvasNode[]): MediaEntry[] {
  const out: MediaEntry[] = []
  const push = (field: MediaField, index: number, input: MediaInput, role: MediaRole) => {
    const asset = resolveMedia(input, nodes)
    if (!asset) return
    const source = input.fromNodeId ? nodes.find((n) => n.id === input.fromNodeId) : undefined
    const fromDirector = (source?.data as unknown as AnyNodeData | undefined)?.kind === 'director'
    out.push({ field, index, role, input, asset, fromDirector })
  }

  if (data.kind === 'image') {
    if (data.mode === 'ref') data.slots.forEach((s, i) => push('slots', i, s, 'ref'))
    return out
  }
  // 导演台没有输入，只有一张渲染出来的参考图
  if (data.kind === 'director') return out

  if (data.mode === 'keyframe') {
    push('frames', 0, data.frames[0], 'first')
    push('frames', 1, data.frames[1], 'last')
  } else if (data.mode === 'reference') {
    data.refs.forEach((r, i) => push('refs', i, r, 'image'))
    data.audios.forEach((a, i) => push('audios', i, a, 'audio'))
  }
  return out
}

/** 可被 @ 引用的素材列表，名字在当前节点内保证唯一 */
export function mentionables(data: AnyNodeData, nodes: CanvasNode[]): Mentionable[] {
  const entries = mediaEntries(data, nodes)
  const counter = new Map<string, number>()
  return entries.map((e, i) => {
    const base = sanitizeName(e.input.label || e.asset.name) || '素材'
    const n = (counter.get(base) ?? 0) + 1
    counter.set(base, n)
    return {
      key: `${e.asset.id}:${e.index}:${i}`,
      name: n === 1 ? base : `${base}-${n}`,
      asset: e.asset,
      role: e.role,
      field: e.field,
      index: e.index,
      input: e.input,
      fromDirector: e.fromDirector,
    }
  })
}

export interface ResolveOptions {
  kind: 'image' | 'video'
  mode: string
}

/**
 * @ 引用在提交前必须变成模型能看懂的真实素材名：
 * - 参考生图：替换为素材名（图像接口没有占位符语法，靠名字描述素材之间的关系）
 * - 参考生视频：替换为 `素材名（<Picture N>）` / `素材名（<Audio N>）`，与数组顺序严格对应
 * - 首尾帧：替换为素材名
 *
 * 只匹配"确实存在的素材名"，所以 `@林晚，抬头` 这种后面紧跟标点也能正确解析。
 */
export function resolvePrompt(raw: string, items: Mentionable[], opts: ResolveOptions): string {
  if (!raw) return ''
  const pattern = namePattern(items)
  if (!pattern) return raw

  const byName = new Map(items.map((i) => [i.name, i]))
  const images = items.filter((i) => i.role !== 'audio')
  const audios = items.filter((i) => i.role === 'audio')
  const re = new RegExp(`@(${pattern})`, 'g')

  let result = raw.replace(re, (whole, name: string) => {
    const hit = byName.get(name)
    if (!hit) return whole

    // 统一策略：只回填"位置占位"，不把素材名写进提示词
    // —— 名字是节点标题（图片1/图片3），写进去对模型没意义，还容易和附图顺序对不上

    // 参考生视频：平台有 <Picture N> / <Audio N> 占位符语法
    if (opts.kind === 'video' && opts.mode === 'reference') {
      if (hit.role === 'audio') {
        const n = audios.indexOf(hit) + 1
        return n > 0 ? `<Audio ${n}>` : hit.name
      }
      const n = images.indexOf(hit) + 1
      return n > 0 ? `<Picture ${n}>` : hit.name
    }

    // 参考生图：模型按附图顺序理解，所以直接写"图N"
    if (opts.kind === 'image' && opts.mode === 'ref') {
      const n = images.indexOf(hit) + 1
      return n > 0 ? `图${n}` : hit.name
    }

    // 首尾帧：标出角色，模型才知道哪张是第一帧
    if (opts.kind === 'video' && opts.mode === 'keyframe') {
      return hit.role === 'first' ? '首帧' : '尾帧'
    }

    return hit.name
  })

  return result
}

// ---------------------------------------------------------------- 着色 / 分段

export interface MentionColor {
  fg: string
  bg: string
  line: string
}

/** 8 个在深色背景上互相区分度高、且不与主题色撞车的颜色 */
const MENTION_PALETTE: MentionColor[] = [
  { fg: '#c4b5fd', bg: 'rgba(139,108,255,0.16)', line: 'rgba(139,108,255,0.5)' },
  { fg: '#67e8f9', bg: 'rgba(34,211,238,0.14)', line: 'rgba(34,211,238,0.48)' },
  { fg: '#fda4af', bg: 'rgba(251,113,133,0.14)', line: 'rgba(251,113,133,0.48)' },
  { fg: '#fcd34d', bg: 'rgba(250,204,21,0.13)', line: 'rgba(250,204,21,0.45)' },
  { fg: '#86efac', bg: 'rgba(52,211,153,0.13)', line: 'rgba(52,211,153,0.45)' },
  { fg: '#93c5fd', bg: 'rgba(96,165,250,0.14)', line: 'rgba(96,165,250,0.48)' },
  { fg: '#f0abfc', bg: 'rgba(232,121,249,0.13)', line: 'rgba(232,121,249,0.45)' },
  { fg: '#fdba74', bg: 'rgba(251,146,60,0.13)', line: 'rgba(251,146,60,0.45)' },
]

function hashName(name: string) {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0
  return h
}

/** 颜色跟着素材走：同一个素材在任何节点、改名前后都是同一个颜色 */
export function mentionColor(assetId: string): MentionColor {
  return MENTION_PALETTE[hashName(assetId) % MENTION_PALETTE.length]
}

export function mentionStyle(assetId: string): CSSProperties {
  const c = mentionColor(assetId)
  return { color: c.fg, background: c.bg, boxShadow: `inset 0 -1px 0 ${c.line}` }
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 用"已知素材名"拼正则，长名优先，避免短名先匹配掉长名 */
export function namePattern(items: Mentionable[]): string | null {
  const names = [...new Set(items.map((i) => i.name).filter(Boolean))]
  if (!names.length) return null
  return names.sort((a, b) => b.length - a.length).map(escapeRe).join('|')
}

export interface MentionSegment {
  text: string
  item?: Mentionable
}

export function splitMentions(text: string, items: Mentionable[]): MentionSegment[] {
  if (!text) return []
  const pattern = namePattern(items)
  if (!pattern) return [{ text }]

  const byName = new Map(items.map((i) => [i.name, i]))
  const re = new RegExp(`@(${pattern})`, 'g')
  const out: MentionSegment[] = []
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    const item = byName.get(m[1])
    out.push({ text: m[0], item })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}


/** 真实调用时，演示占位素材不能作为参考输入 */
export function findUnusableInputs(items: Mentionable[], mockMode: boolean): Mentionable[] {
  if (mockMode) return []
  return items.filter((i) => i.asset.mock)
}

export function isImageData(data: AnyNodeData): data is ImageNodeData {
  return data.kind === 'image'
}

export function isVideoData(data: AnyNodeData): data is VideoNodeData {
  return data.kind === 'video'
}
