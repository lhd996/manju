// Agnes AI 接入层。所有 API Key 只存在于服务端。
import { getConfig } from './store.mjs'

export const BASE = process.env.AGNES_BASE_URL || 'https://api.agnes-ai.cn/v1'
export const ORIGIN = new URL(BASE).origin
export const IMAGE_MODEL = 'agnes-image-2.5-flash'
export const VIDEO_MODEL = 'agnes-video-2.5-flash'

export class ApiError extends Error {
  constructor(status, message, payload) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

function errorMessage(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') return payload
  if (payload.detail) return typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
  if (payload.error?.message) return payload.error.message
  if (typeof payload.error === 'string') return payload.error
  // 平台有些错误是 { code, message, data } 这种平铺结构
  if (typeof payload.message === 'string') return payload.message
  try {
    return JSON.stringify(payload).slice(0, 500)
  } catch {
    return String(payload)
  }
}

async function request(pathname, { method = 'GET', body, timeout = 120_000, origin = BASE } = {}) {
  const { apiKey } = getConfig()
  if (!apiKey) throw new ApiError(401, '未配置 API Key')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(origin + pathname, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text }
    }
    if (!res.ok) {
      const fallback =
        res.status === 503
          ? '平台服务暂时不可用（503），通常是队列/容量问题，稍后自动重试'
          : res.status === 502
            ? '平台网关错误（502）'
            : `HTTP ${res.status}`
      throw new ApiError(res.status, errorMessage(json) || fallback, json)
    }
    return json
  } catch (err) {
    if (err?.name === 'AbortError') throw new ApiError(504, '请求超时（模型侧未在预期时间内返回）')
    if (err instanceof ApiError) throw err
    // fetch 在连接层失败时只会抛 "fetch failed"，真正的原因在 err.cause 里
    const cause = err?.cause
    const code = cause?.code || cause?.errno || ''
    const detail = cause?.message || err?.message || '网络异常'
    const where = new URL(origin).host
    throw new ApiError(
      502,
      `连接 ${where} 失败${code ? `（${code}）` : ''}：${detail}。通常是网络瞬断或平台侧拥塞，稍后重试即可。`,
      { code },
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 文生图 / 参考生图（多图合成）
 * @param {{prompt:string,size:string,ratio:string,images?:string[],responseFormat?:'url'|'b64_json'}} p
 */
export async function generateImage({ prompt, size = '2K', ratio = '1:1', images = [] }) {
  const extra = { response_format: 'url' }
  if (images.length) extra.image = images

  const body = {
    model: IMAGE_MODEL,
    prompt,
    size,
    ratio,
    extra_body: extra,
  }

  const json = await request('/images/generations', {
    method: 'POST',
    body,
    timeout: 360_000,
  })

  const item = json?.data?.[0]
  if (!item) throw new ApiError(502, '图像接口返回为空')
  if (item.url) return { url: item.url }
  if (item.b64_json) return { base64: item.b64_json }
  throw new ApiError(502, '图像接口未返回 url 或 b64_json')
}

/**
 * 创建视频任务
 * @param {{prompt:string,mode:'text'|'keyframe'|'reference',seconds:number,ratio:string,
 *          firstFrame?:string,lastFrame?:string,images?:string[],audios?:string[]}} p
 */
export async function createVideo(p) {
  const body = {
    model: VIDEO_MODEL,
    prompt: p.prompt,
    mode: p.mode,
    seconds: String(p.seconds),
    size: '720P', // Flash 只接受 720P
    aspect_ratio: p.ratio,
  }
  if (p.mode === 'keyframe') {
    if (p.firstFrame) body.first_frame = p.firstFrame
    if (p.lastFrame) body.last_frame = p.lastFrame
  }
  if (p.mode === 'reference') {
    if (p.images?.length) body.images = p.images
    if (p.audios?.length) body.audios = p.audios
  }

  const json = await request('/videos', { method: 'POST', body, timeout: 90_000 })
  const videoId = json?.video_id || json?.id
  if (!videoId) throw new ApiError(502, '视频接口未返回 video_id')
  return { videoId, raw: json }
}

/** 查询视频任务。必须带 model_name，否则 keyframe/reference 查不到。 */
export async function pollVideo(videoId) {
  const qs = new URLSearchParams({ video_id: videoId, model_name: VIDEO_MODEL })
  return request(`/agnesapi?${qs.toString()}`, { timeout: 30_000, origin: ORIGIN })
}

/** 文本模型（agnes-3.0-flash）：提示词优化这类轻量任务 */
export async function chat(messages, { temperature = 0.7, maxTokens = 900 } = {}) {
  const json = await request('/chat/completions', {
    method: 'POST',
    body: {
      model: 'agnes-3.0-flash',
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    },
    timeout: 120_000,
  })
  const content = json?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

export async function ping() {
  const { apiKey } = getConfig()
  if (!apiKey) return { ok: false, reason: 'no-key' }
  try {
    await request('/models', { timeout: 15_000 })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err?.message || 'unknown', status: err?.status }
  }
}
