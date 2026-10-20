import type { Edge, Node } from '@xyflow/react'

export type Ratio = '1:1' | '16:9' | '9:16'
export type ImageSize = '1K' | '2K' | '3K' | '4K'
export type MediaKind = 'image' | 'video' | 'audio'

export interface Asset {
  id: string
  kind: MediaKind
  url: string
  remoteUrl?: string
  name: string
  width: number
  height: number
  duration?: number
  prompt?: string
  mock?: boolean
  createdAt: number
}

/** 一路输入：要么来自上传的素材，要么来自上游节点（edgeId 可溯源） */
export interface MediaInput {
  id: string
  asset?: Asset
  edgeId?: string
  fromNodeId?: string
  /** 用户给这一路输入起的名字，会成为 @ 引用的名字 */
  label?: string
}

export type ImageMode = 't2i' | 'ref'
export type VideoMode = 'text' | 'keyframe' | 'reference'

export interface ImageNodeData {
  kind: 'image'
  title: string
  mode: ImageMode
  prompt: string
  size: ImageSize
  ratio: Ratio
  slots: MediaInput[]
  output?: Asset
  /** 历史版本，最新的在前；output 是当前选中的那一个 */
  versions?: Asset[]
  status: 'idle' | 'running' | 'error'
  error?: string
  resolved?: string
  elapsed?: number
  [key: string]: unknown
}

export interface VideoNodeData {
  kind: 'video'
  title: string
  mode: VideoMode
  prompt: string
  ratio: Ratio
  seconds: number
  frames: MediaInput[]
  refs: MediaInput[]
  audios: MediaInput[]
  output?: Asset
  versions?: Asset[]
  status: 'idle' | 'running' | 'error'
  progress?: number
  /** 运行中的附加说明，例如"平台队列已满，20s 后自动重试" */
  note?: string
  error?: string
  jobId?: string
  resolved?: string
  elapsed?: number
  [key: string]: unknown
}

export interface DirectorActor {
  id: string
  x: number
  z: number
  rotY: number
  scale: number
  color: string
}

export interface DirectorCam {
  az: number
  dist: number
  height: number
  fov: number
  targetY: number
}

/** 导演台节点：没有输入，只有一张渲染出来的参考图作为输出 */
export interface DirectorNodeData {
  kind: 'director'
  title: string
  ratio: Ratio
  actors: DirectorActor[]
  cam: DirectorCam
  output?: Asset
  versions?: Asset[]
  status: 'idle' | 'rendering'
  [key: string]: unknown
}

export type AnyNodeData = ImageNodeData | VideoNodeData | DirectorNodeData
export type CanvasNode = Node
export type CanvasEdge = Edge

export interface Health {
  ok: boolean
  mock: boolean
  hasKey: boolean
  keyHint: string
  publicBaseUrl: string
  proxy?: string
  proxyActive?: boolean
}

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'error' | 'success'
}
