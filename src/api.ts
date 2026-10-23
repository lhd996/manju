import type { Asset } from './types'

export class ClientError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    throw new ClientError('无法连接到本地服务（server 是否在运行？）')
  }
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    throw new ClientError(data?.error || `请求失败（HTTP ${res.status}）`, res.status)
  }
  return data as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export interface JobView {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'pending'
  progress: number
  error?: string
  note?: string
  asset?: Asset | null
  mock?: boolean
}

export const api = {
  health: () =>
    jsonFetch<{
      ok: boolean
      mock: boolean
      hasKey: boolean
      keyHint: string
      publicBaseUrl: string
      proxy?: string
      proxyActive?: boolean
    }>('/api/health'),

  saveConfig: (patch: { apiKey?: string; publicBaseUrl?: string }) =>
    jsonFetch<{ hasKey: boolean; keyHint: string; publicBaseUrl: string }>('/api/config', json(patch)),

  upload: (dataUrl: string, meta: { name: string; kind?: string; width?: number; height?: number; duration?: number }) =>
    jsonFetch<{ asset: Asset }>('/api/assets', json({ dataUrl, ...meta })),

  optimizePrompt: (body: {
    prompt: string
    kind: string
    mode: string
    ratio: string
    seconds?: number
    tokens: string[]
  }) => jsonFetch<{ prompt: string; elapsed?: number }>('/api/optimize-prompt', json(body)),

  generateImage: (body: {
    prompt: string
    size: string
    ratio: string
    inputs: Array<{ assetId: string } | { url: string }>
  }) => jsonFetch<{ asset: Asset; resolvedPrompt: string; mock?: boolean; elapsed?: number }>('/api/generate/image', json(body)),

  generateVideo: (body: {
    prompt: string
    mode: 'text' | 'keyframe' | 'reference'
    seconds: number
    ratio: string
    firstFrame?: { assetId: string }
    lastFrame?: { assetId: string }
    refs?: Array<{ assetId: string }>
    audios?: Array<{ assetId: string }>
  }) => jsonFetch<{ jobId: string; mock?: boolean }>('/api/generate/video', json(body)),

  getJob: (id: string) => jsonFetch<JobView>(`/api/jobs/${id}`),

  /** 继续查询：复用平台单号，不重新下单 */
  resumeJob: (id: string) => jsonFetch<JobView & { resumed?: boolean }>(`/api/jobs/${id}/resume`, { method: 'POST' }),
}
