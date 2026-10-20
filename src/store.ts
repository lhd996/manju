import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import type {
  AnyNodeData,
  Asset,
  CanvasNode,
  DirectorNodeData,
  Health,
  ImageMode,
  ImageNodeData,
  MediaInput,
  Toast,
  VideoMode,
  VideoNodeData,
} from './types'
import { api } from './api'
import { fileToDataUrl, imageSizeFromDataUrl, sanitizeName, uid } from './lib/media'
import { DEFAULT_DIRECTOR_CAM, defaultDirectorActors } from './lib/director'
import { findUnusableInputs, mentionables, resolveMedia, resolvePrompt } from './lib/prompt'

const STORAGE_KEY = 'manju-canvas:v1'

type MediaField = 'slots' | 'frames' | 'refs' | 'audios'
type MediaTarget = { field: MediaField; index?: number }

interface DirectorState {
  open: boolean
  /** 正在编辑的导演台节点 id */
  nodeId: string | null
}

interface State {
  nodes: CanvasNode[]
  edges: Edge[]
  selectedId: string | null
  health: Health
  settingsOpen: boolean
  director: DirectorState
  toasts: Toast[]

  init: () => Promise<void>
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (conn: Connection) => void
  isValidConnection: (conn: Connection | Edge) => boolean

  addNode: (kind: 'image' | 'video' | 'director', position: { x: number; y: number }) => string
  addImageNodeFromAsset: (asset: Asset, position: { x: number; y: number }) => string
  updateNodeData: (id: string, patch: Record<string, unknown>) => void
  setMode: (id: string, mode: ImageMode | VideoMode) => void
  swapFrames: (id: string) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  duplicateNode: (id: string) => void
  selectNode: (id: string | null) => void
  deselectAll: () => void
  replaceCanvas: (nodes: CanvasNode[], edges: Edge[]) => void

  uploadInto: (nodeId: string, target: MediaTarget, file: File) => Promise<void>
  removeMedia: (nodeId: string, field: MediaField, index: number) => void
  setInputLabel: (nodeId: string, field: MediaField, index: number, label: string) => void
  uploadAudio: (nodeId: string, file: File) => Promise<void>

  runNode: (id: string) => Promise<void>
  applyOutput: (id: string, asset: Asset | undefined, patch?: Record<string, unknown>) => void
  clearOutput: (id: string) => void
  restoreVersion: (id: string, assetId: string) => void
  deleteVersion: (id: string, assetId: string) => void

  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
  setSettingsOpen: (open: boolean) => void
  openDirector: (nodeId: string) => void
  closeDirector: () => void
  updateDirectorNode: (id: string, patch: Record<string, unknown>) => void
}

// ---------------------------------------------------------------- helpers

const dataOf = (n: CanvasNode) => n.data as unknown as AnyNodeData

const emptySlot = (): MediaInput => ({ id: uid('m') })

/** 新产物进版本列表（最新在前，最多保留 24 个） */
function withVersion(prev: Asset[] | undefined, asset: Asset): Asset[] {
  return [asset, ...(prev ?? []).filter((v) => v.id !== asset.id)].slice(0, 24)
}

/** 生成出来的素材直接用「节点标题」当名字（图片 2 → 图片2），和画布上的卡片对得上 */
function assetNameFor(node: CanvasNode | undefined, kind: 'image' | 'video'): string {
  const title = node ? sanitizeName(String(dataOf(node).title ?? '')) : ''
  if (title) return title
  return kind === 'video' ? '视频' : '图片'
}

/** 避免新节点叠在旧节点上（按已测量的真实尺寸判断） */
function freeSpot(nodes: CanvasNode[], pos: { x: number; y: number }) {
  const NW = 320
  const NH = 300
  const GAP = 36
  let p = { ...pos }
  let guard = 0
  const overlaps = (n: CanvasNode) => {
    const w = n.measured?.width ?? NW
    const h = n.measured?.height ?? NH
    return (
      p.x < n.position.x + w + GAP &&
      p.x + NW + GAP > n.position.x &&
      p.y < n.position.y + h + GAP &&
      p.y + NH + GAP > n.position.y
    )
  }
  while (nodes.some(overlaps) && guard++ < 24) {
    p = { x: p.x + 90, y: p.y + 90 }
  }
  return p
}

function resetRunning(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((n) => {
    const d = dataOf(n)
    if (d.status === 'running') {
      return { ...n, data: { ...n.data, status: 'idle', error: '上一次生成被中断（页面刷新）' } }
    }
    return n
  })
}

function loadPersisted(): { nodes: CanvasNode[]; edges: Edge[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (raw && Array.isArray(raw.nodes)) {
      return { nodes: resetRunning(raw.nodes), edges: Array.isArray(raw.edges) ? raw.edges : [] }
    }
  } catch {
    /* ignore */
  }
  return { nodes: [], edges: [] }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const { nodes, edges } = useStore.getState()
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }))
    } catch {
      /* quota */
    }
  }, 400)
}

/** 删除被移除边/节点所占据的输入，保持数据与连线一致 */
function pruneInputs(node: CanvasNode, removedEdgeIds: Set<string>, removedNodeIds: Set<string>): CanvasNode {
  const d = dataOf(node)
  let changed = false

  const prune = (list: MediaInput[]) => {
    const next = list.filter((m) => {
      if (m.edgeId && removedEdgeIds.has(m.edgeId)) return false
      if (m.fromNodeId && removedNodeIds.has(m.fromNodeId)) return false
      return true
    })
    if (next.length !== list.length) changed = true
    return next
  }

  let patch: Record<string, unknown> = {}
  if (d.kind === 'image') {
    const slots = prune(d.slots)
    if (slots !== d.slots) patch.slots = slots
  } else if (d.kind === 'video') {
    const frames = prune(d.frames)
    const refs = prune(d.refs)
    const audios = prune(d.audios)
    if (frames !== d.frames) patch.frames = frames
    if (refs !== d.refs) patch.refs = refs
    if (audios !== d.audios) patch.audios = audios
  }
  if (!changed) return node
  return { ...node, data: { ...node.data, ...patch } }
}

/** 上游产出变化时，把新素材同步给所有引用它的下游输入（保持画布所见即所得） */
function propagateOutput(nodes: CanvasNode[], nodeId: string, asset: Asset | undefined): CanvasNode[] {
  return nodes.map((n) => {
    const d = dataOf(n)
    let changed = false
    const renames: Array<[string, string]> = []
    const fill = (list: MediaInput[]) =>
      list.map((m) => {
        if (m.fromNodeId !== nodeId) return m
        if (asset && m.asset?.id === asset.id) return m
        if (!asset && !m.asset) return m
        const before = m.asset?.name
        if (before && asset?.name && before !== asset.name) renames.push([before, asset.name])
        changed = true
        return { ...m, asset }
      })

    let patch: Record<string, unknown> = {}
    if (d.kind === 'image') {
      const slots = fill(d.slots)
      if (changed) patch.slots = slots
    } else if (d.kind === 'video') {
      const frames = fill(d.frames)
      const refs = fill(d.refs)
      if (changed) {
        patch.frames = frames
        patch.refs = refs
      }
    }

    // 上游改名时，把下游提示词里的 @旧名 一起改成 @新名，避免引用悄悄失效
    if (renames.length) {
      const prompt = String(d.prompt ?? '')
      let next = prompt
      for (const [from, to] of renames) {
        next = next.replace(
          new RegExp(`@${escapeRe(from)}(?=\\s|$|[，。,.!?！？；;：:、）)】\\]])`, 'g'),
          `@${to}`,
        )
      }
      if (next !== prompt) patch.prompt = next
    }

    if (!changed) return n
    return { ...n, data: { ...n.data, ...patch } }
  })
}

function defaultImageData(index: number, ratio: ImageNodeData['ratio'] = '9:16'): ImageNodeData {
  return {
    kind: 'image',
    title: `图片 ${index}`,
    mode: 't2i',
    prompt: '',
    size: '2K',
    ratio,
    slots: [emptySlot()],
    status: 'idle',
  }
}

function defaultVideoData(index: number, ratio: VideoNodeData['ratio'] = '16:9'): VideoNodeData {
  return {
    kind: 'video',
    title: `视频 ${index}`,
    mode: 'text',
    prompt: '',
    ratio,
    seconds: 5,
    frames: [emptySlot(), emptySlot()],
    refs: [],
    audios: [],
    status: 'idle',
  }
}

/** 导演台节点：只有输出（一张渲染图），没有输入 */
function defaultDirectorData(index: number, ratio: VideoNodeData['ratio'] = '9:16'): DirectorNodeData {
  return {
    kind: 'director',
    title: `导演台 ${index}`,
    ratio,
    actors: defaultDirectorActors(),
    cam: { ...DEFAULT_DIRECTOR_CAM },
    status: 'idle',
  }
}

async function uploadFile(file: File, fallbackName = '素材'): Promise<Asset> {
  const dataUrl = await fileToDataUrl(file)
  const dims = await imageSizeFromDataUrl(dataUrl)
  const base = sanitizeName(file.name.replace(/\.[^.]+$/, '')) || fallbackName
  const kind = file.type.startsWith('audio') ? 'audio' : file.type.startsWith('video') ? 'video' : 'image'
  const res = await api.upload(dataUrl, { name: base, kind, width: dims.width, height: dims.height })
  return res.asset
}

const errText = (e: unknown) => (e instanceof Error ? e.message : '未知错误')

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------- store

export const useStore = create<State>()((set, get) => ({
  ...loadPersisted(),
  selectedId: null,
  health: { ok: true, mock: true, hasKey: false, keyHint: '', publicBaseUrl: '' },
  settingsOpen: false,
  director: { open: false, nodeId: null },
  toasts: [],

  init: async () => {
    try {
      const h = await api.health()
      set({ health: { ...h } })
    } catch {
      get().toast('后端服务未启动，先运行 npm run dev', 'error')
    }
  },

  onNodesChange: (changes) => {
    const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
    let nodes = applyNodeChanges(changes, get().nodes)
    let edges = get().edges
    if (removed.size) {
      edges = edges.filter((e) => !removed.has(e.source) && !removed.has(e.target))
      const goneEdges = new Set<string>()
      nodes = nodes.map((n) => pruneInputs(n, goneEdges, removed))
      removed.forEach((id) => stopPoll(id))
    }
    set({ nodes, edges })
    scheduleSave()
  },

  onEdgesChange: (changes) => {
    const removedEdges = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
    const edges = applyEdgeChanges(changes, get().edges)
    let nodes = get().nodes
    if (removedEdges.size) {
      nodes = nodes.map((n) => pruneInputs(n, removedEdges, new Set()))
    }
    set({ nodes, edges })
    scheduleSave()
  },

  isValidConnection: (conn) => {
    const { nodes, edges } = get()
    const source = nodes.find((n) => n.id === conn.source)
    const target = nodes.find((n) => n.id === conn.target)
    if (!source || !target || source.id === target.id) return false
    const sd = dataOf(source)
    const td = dataOf(target)
    if (sd.kind !== 'image' && sd.kind !== 'director') return false
    if (td.kind === 'image') return td.mode === 'ref'
    if (td.mode === 'keyframe') return edges.filter((e) => e.target === target.id).length < 2
    if (td.mode === 'reference') return edges.filter((e) => e.target === target.id).length < 5
    return false
  },

  onConnect: (conn) => {
    const { nodes, edges, toast } = get()
    if (!get().isValidConnection(conn)) return
    const source = nodes.find((n) => n.id === conn.source)!
    const target = nodes.find((n) => n.id === conn.target)!
    const sd = dataOf(source)
    const td = dataOf(target)
    if (edges.some((e) => e.source === conn.source && e.target === conn.target)) return

    const edgeId = uid('e')
    const newEdge: Edge = {
      id: edgeId,
      source: conn.source,
      target: conn.target,
      sourceHandle: conn.sourceHandle ?? null,
      targetHandle: conn.targetHandle ?? null,
      type: 'asset',
      data: { label: sd.title },
    }

    if (td.kind === 'image') {
      const slots = [...td.slots]
      let idx = slots.findIndex((s) => !s.asset && !s.edgeId)
      if (idx < 0) {
        slots.push(emptySlot())
        idx = slots.length - 1
      }
      slots[idx] = { ...slots[idx], edgeId, fromNodeId: conn.source, asset: sd.output }
      // 连上一条上游后，永远留一个空槽位等着下一张
      if (!slots.some((s) => !s.asset && !s.edgeId)) slots.push(emptySlot())
      set({
        edges: addEdge(newEdge, edges),
        nodes: nodes.map((n) => (n.id === target.id ? { ...n, data: { ...n.data, slots } } : n)),
      })
    } else if (td.kind === 'video' && td.mode === 'keyframe') {
      const frames = [...td.frames]
      const idx = frames.findIndex((f) => !f.asset && !f.edgeId)
      if (idx < 0) {
        toast('首尾帧模式最多两个图片输入', 'error')
        return
      }
      frames[idx] = { ...frames[idx], edgeId, fromNodeId: conn.source, asset: sd.output }
      set({
        edges: addEdge(newEdge, edges),
        nodes: nodes.map((n) => (n.id === target.id ? { ...n, data: { ...n.data, frames } } : n)),
      })
    } else if (td.kind === 'video' && td.mode === 'reference') {
      if (td.refs.length >= 5) {
        toast('参考图最多 5 张', 'error')
        return
      }
      const refs = [...td.refs, { id: uid('m'), edgeId, fromNodeId: conn.source, asset: sd.output }]
      set({
        edges: addEdge(newEdge, edges),
        nodes: nodes.map((n) => (n.id === target.id ? { ...n, data: { ...n.data, refs } } : n)),
      })
    }

    // 导演台是胶囊人偶，直接当视频首帧会被原样生成出来
    if (sd.kind === 'director' && td.kind === 'video' && td.mode === 'keyframe') {
      toast('导演台是站位示意图，直接当首帧会把 3D 人偶生成出来。建议先接图片节点出剧照，再拿剧照当首帧', 'info')
    }

    scheduleSave()
  },

  addNode: (kind, position) => {
    const { nodes } = get()
    const count = nodes.filter((n) => dataOf(n).kind === kind).length + 1
    const id = uid('n')
    const data =
      kind === 'image'
        ? defaultImageData(count)
        : kind === 'video'
          ? defaultVideoData(count)
          : defaultDirectorData(count)
    const cleared = nodes.map((n) => (n.selected ? { ...n, selected: false } : n))
    set({
      nodes: [...cleared, { id, type: kind, position: freeSpot(nodes, position), data, selected: true }],
      selectedId: id,
    })
    scheduleSave()
    return id
  },

  addImageNodeFromAsset: (asset, position) => {
    const { nodes } = get()
    const count = nodes.filter((n) => dataOf(n).kind === 'image').length + 1
    const id = uid('n')
    const data: ImageNodeData = {
      ...defaultImageData(count, closestRatio(asset.width, asset.height)),
      prompt: asset.prompt || '',
      output: asset,
      mode: 't2i',
    }
    const cleared = nodes.map((n) => (n.selected ? { ...n, selected: false } : n))
    set({
      nodes: [...cleared, { id, type: 'image', position: freeSpot(nodes, position), data, selected: true }],
      selectedId: id,
    })
    scheduleSave()
    return id
  },

  updateNodeData: (id, patch) =>
    set((s) => {
      const nodes = s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
      let edges = s.edges
      if (typeof patch.title === 'string') {
        edges = edges.map((e) => (e.source === id ? { ...e, data: { ...e.data, label: patch.title } } : e))
      }
      return { nodes, edges }
    }),

  setMode: (id, mode) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    const d = dataOf(node)
    if (d.kind === 'director') return
    // 切模式会改变端口语义与输入含义：清空所有入边与输入，避免脏数据
    const edges = get().edges.filter((e) => e.target !== id)
    let patch: Record<string, unknown> = { mode }
    if (d.kind === 'image') {
      patch = { ...patch, slots: [emptySlot()] }
    } else if (d.kind === 'video') {
      patch = { ...patch, frames: [emptySlot(), emptySlot()], refs: [], audios: [], output: undefined }
    }
    set({
      edges,
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    })
    scheduleSave()
  },

  swapFrames: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    const d = dataOf(node)
    if (d.kind !== 'video') return
    const frames = [d.frames[1], d.frames[0]]
    get().updateNodeData(id, { frames })
  },

  removeNode: (id) => {
    stopPoll(id)
    const edges = get().edges.filter((e) => e.source !== id && e.target !== id)
    const nodes = get()
      .nodes.filter((n) => n.id !== id)
      .map((n) => pruneInputs(n, new Set(), new Set([id])))
    set({ nodes, edges, selectedId: null })
    scheduleSave()
  },

  removeEdge: (id) => {
    const edges = get().edges.filter((e) => e.id !== id)
    const nodes = get().nodes.map((n) => pruneInputs(n, new Set([id]), new Set()))
    set({ edges, nodes })
    scheduleSave()
  },

  duplicateNode: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    const clone = structuredClone(node) as CanvasNode
    clone.id = uid('n')
    clone.position = { x: node.position.x + 48, y: node.position.y + 48 }
    clone.selected = true
    const d = clone.data as unknown as AnyNodeData
    d.title = `${d.title} 副本`
    if (d.status === 'running') d.status = 'idle'
    if (d.kind === 'image') {
      d.slots = d.slots.map((s) => ({ ...s, id: uid('m'), edgeId: undefined, fromNodeId: undefined }))
    } else if (d.kind === 'video') {
      d.frames = d.frames.map((s) => ({ ...s, id: uid('m'), edgeId: undefined, fromNodeId: undefined }))
      d.refs = d.refs.map((s) => ({ ...s, id: uid('m'), edgeId: undefined, fromNodeId: undefined }))
      d.audios = d.audios.map((s) => ({ ...s, id: uid('m'), edgeId: undefined, fromNodeId: undefined }))
    }
    set({ nodes: [...get().nodes, clone], selectedId: clone.id })
    scheduleSave()
  },

  // 注意：这里绝不能改 nodes。onSelectionChange 会回调它，改 nodes 会和 React Flow 的选择监听形成死循环。
  selectNode: (id) => set({ selectedId: id }),

  deselectAll: () =>
    set((s) => ({
      selectedId: null,
      nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
    })),

  replaceCanvas: (nodes, edges) => {
    set({ nodes: resetRunning(nodes), edges, selectedId: null, director: { open: false, nodeId: null } })
    scheduleSave()
  },

  uploadInto: async (nodeId, target, file) => {
    try {
      const asset = await uploadFile(file)
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== nodeId) return n
          const d = dataOf(n)
          const patch: Record<string, unknown> = {}
          if (d.kind === 'image') {
            const slots = [...d.slots]
            const i = target.index ?? slots.findIndex((x) => !x.asset && !x.edgeId)
            slots[i >= 0 ? i : slots.length] = {
              id: slots[i]?.id ?? uid('m'),
              asset,
            }
            if (!slots.some((x) => !x.asset && !x.edgeId)) slots.push(emptySlot())
            patch.slots = slots
          } else if (d.kind === 'video' && target.field === 'frames') {
            const frames = [...d.frames]
            frames[target.index ?? 0] = { id: frames[target.index ?? 0]?.id ?? uid('m'), asset }
            patch.frames = frames
          } else if (d.kind === 'video' && target.field === 'refs') {
            if (d.refs.length >= 5 && target.index === undefined) throw new Error('参考图最多 5 张')
            const refs = [...d.refs]
            if (target.index === undefined) refs.push({ id: uid('m'), asset })
            else refs[target.index] = { id: refs[target.index]?.id ?? uid('m'), asset }
            patch.refs = refs
          } else if (d.kind === 'video' && target.field === 'audios') {
            if (d.audios.length >= 3 && target.index === undefined) throw new Error('参考音频最多 3 段')
            const audios = [...d.audios]
            if (target.index === undefined) audios.push({ id: uid('m'), asset })
            else audios[target.index] = { id: audios[target.index]?.id ?? uid('m'), asset }
            patch.audios = audios
          }
          return { ...n, data: { ...n.data, ...patch } }
        }),
      }))
      scheduleSave()
    } catch (e) {
      get().toast(errText(e), 'error')
    }
  },

  uploadAudio: async (nodeId, file) => {
    await get().uploadInto(nodeId, { field: 'audios' }, file)
  },

  removeMedia: (nodeId, field, index) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return
    const d = dataOf(node)
    const list = (d as any)[field] as MediaInput[]
    const target = list[index]
    if (!target) return
    let edges = get().edges
    if (target.edgeId) edges = edges.filter((e) => e.id !== target.edgeId)
    const next =
      field === 'frames'
        ? list.map((it, i) => (i === index ? { id: uid('m') } : it))
        : list.filter((_, i) => i !== index)
    if (field === 'slots' && next.length === 0) next.push(emptySlot())
    set({
      edges,
      nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, [field]: next } } : n)),
    })
    scheduleSave()
  },

  setInputLabel: (nodeId, field, index, label) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return
    const list = ((node.data as any)[field] as MediaInput[]) || []
    const next = list.map((it, i) => (i === index ? { ...it, label } : it))
    get().updateNodeData(nodeId, { [field]: next })
    scheduleSave()
  },

  applyOutput: (id, asset, patch = {}) => {
    set((s) => {
      const nodes = s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, output: asset, ...patch } } : n,
      )
      return { nodes: propagateOutput(nodes, id, asset) }
    })
    scheduleSave()
  },

  clearOutput: (id) => {
    get().applyOutput(id, undefined, { progress: 0 })
  },

  restoreVersion: (id, assetId) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    const d = dataOf(node)
    const v = (d.versions ?? []).find((a) => a.id === assetId)
    if (!v) return
    get().applyOutput(id, v)
    get().toast('已切换到该版本', 'success')
  },

  deleteVersion: (id, assetId) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    const d = dataOf(node)
    const versions = (d.versions ?? []).filter((a) => a.id !== assetId)
    if (d.output?.id === assetId) {
      get().applyOutput(id, versions[0], { versions })
    } else {
      get().updateNodeData(id, { versions })
    }
  },

  runNode: async (id) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === id)
    if (!node) return
    const d = dataOf(node)
    if (d.kind === 'director') return
    if (d.status === 'running') return

    const items = mentionables(d, state.nodes)
    const prompt = resolvePrompt(d.prompt, items, { kind: d.kind, mode: d.mode }).trim()
    if (!prompt) {
      state.toast('先写提示词；用 @ 可以把素材引用进提示词', 'error')
      return
    }

    if (!state.health.mock) {
      const bad = findUnusableInputs(items, false)
      if (bad.length) {
        state.toast(`「${bad[0].name}」是演示占位素材，真实调用需要上传真实图片`, 'error')
        return
      }
    }

    if (d.kind === 'image') {
      const inputs = d.mode === 'ref' ? items.filter((i) => i.role === 'ref').map((i) => ({ assetId: i.asset.id })) : []
      if (d.mode === 'ref' && inputs.length === 0) {
        state.toast('参考生图至少需要一张参考图（上传或连上游）', 'error')
        return
      }
      get().updateNodeData(id, { status: 'running', error: undefined, resolved: prompt })
      const t0 = Date.now()
      try {
        const res = await api.generateImage({ prompt, size: d.size, ratio: d.ratio, inputs })
        const named = { ...res.asset, name: assetNameFor(get().nodes.find((n) => n.id === id), 'image') }
        const now = get().nodes.find((n) => n.id === id)
        const prev = now ? dataOf(now).versions : undefined
        get().applyOutput(id, named, {
          status: 'idle',
          error: undefined,
          elapsed: res.elapsed ?? Date.now() - t0,
          versions: withVersion(prev, named),
        })
        get().toast('图片生成完成', 'success')
      } catch (e) {
        get().updateNodeData(id, { status: 'error', error: errText(e) })
        get().toast(errText(e), 'error')
      }
      scheduleSave()
      return
    }

    // ---------------- video
    if (d.kind !== 'video') return
    const frames = d.frames.map((f) => resolveMedia(f, state.nodes))
    const refs = d.refs.map((r) => resolveMedia(r, state.nodes)).filter(Boolean) as Asset[]
    const audios = d.audios.map((a) => resolveMedia(a, state.nodes)).filter(Boolean) as Asset[]

    if (d.mode === 'keyframe' && !frames[0] && !frames[1]) {
      state.toast('首尾帧模式至少需要一张图（上传或连上游）', 'error')
      return
    }
    if (d.mode === 'reference' && refs.length === 0 && audios.length === 0) {
      state.toast('参考模式至少需要一个参考素材', 'error')
      return
    }

    const payload = {
      prompt,
      mode: d.mode === 'text' ? ('text' as const) : d.mode === 'keyframe' ? ('keyframe' as const) : ('reference' as const),
      seconds: d.seconds,
      ratio: d.ratio,
      firstFrame: d.mode === 'keyframe' && frames[0] ? { assetId: frames[0].id } : undefined,
      lastFrame: d.mode === 'keyframe' && frames[1] ? { assetId: frames[1].id } : undefined,
      refs: d.mode === 'reference' ? refs.map((a) => ({ assetId: a.id })) : undefined,
      audios: d.mode === 'reference' ? audios.map((a) => ({ assetId: a.id })) : undefined,
    }

    get().updateNodeData(id, { status: 'running', error: undefined, progress: 0, resolved: prompt })
    try {
      const { jobId } = await api.generateVideo(payload)
      get().updateNodeData(id, { jobId })
      startPoll(id, jobId)
    } catch (e) {
      get().updateNodeData(id, { status: 'error', error: errText(e) })
      get().toast(errText(e), 'error')
    }
    scheduleSave()
  },

  toast: (text, kind = 'info') => {
    const id = uid('t')
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  openDirector: (nodeId) => set({ director: { open: true, nodeId } }),

  closeDirector: () => set((s) => ({ director: { ...s.director, open: false } })),

  updateDirectorNode: (id, patch) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    const d = dataOf(node)
    if (d.kind !== 'director') return
    if ('output' in patch) {
      get().applyOutput(id, patch.output as Asset | undefined, patch)
      return
    }
    get().updateNodeData(id, patch)
    scheduleSave()
  },
}))

// ---------------------------------------------------------------- 视频任务轮询

const pollTimers = new Map<string, ReturnType<typeof setInterval>>()
const pollFailures = new Map<string, number>()

function stopPoll(nodeId: string) {
  const timer = pollTimers.get(nodeId)
  if (timer) clearInterval(timer)
  pollTimers.delete(nodeId)
  pollFailures.delete(nodeId)
}

function startPoll(nodeId: string, jobId: string) {
  stopPoll(nodeId)
  const timer = setInterval(async () => {
    try {
      const job = await api.getJob(jobId)
      const s = useStore.getState()
      pollFailures.set(nodeId, 0)
      s.updateNodeData(nodeId, { progress: Math.round(job.progress || 0), note: job.note })
      if (job.status === 'succeeded') {
        stopPoll(nodeId)
        const now = s.nodes.find((n) => n.id === nodeId)
        const prev = now ? dataOf(now).versions : undefined
        const out = job.asset
          ? { ...job.asset, name: assetNameFor(now, 'video') }
          : undefined
        s.applyOutput(nodeId, out, {
          status: 'idle',
          error: undefined,
          progress: 100,
          note: undefined,
          versions: out ? withVersion(prev, out) : prev,
        })
        s.toast('视频生成完成', 'success')
      } else if (job.status === 'failed') {
        stopPoll(nodeId)
        s.updateNodeData(nodeId, { status: 'error', error: job.error || '视频生成失败', note: undefined })
        s.toast(job.error || '视频生成失败', 'error')
      }
    } catch (e) {
      const fails = (pollFailures.get(nodeId) ?? 0) + 1
      pollFailures.set(nodeId, fails)
      if (fails >= 4) {
        stopPoll(nodeId)
        useStore.getState().updateNodeData(nodeId, { status: 'error', error: errText(e) })
      }
    }
  }, 1400)
  pollTimers.set(nodeId, timer)
}

function closestRatio(w: number, h: number): VideoNodeData['ratio'] {
  if (!w || !h) return '16:9'
  const r = w / h
  const cands: Array<[VideoNodeData['ratio'], number]> = [
    ['1:1', 1],
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
  ]
  return cands.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0]
}

useStore.subscribe(() => scheduleSave())
