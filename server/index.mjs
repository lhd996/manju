import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { nanoid } from 'nanoid'
import {
  ASSETS_DIR,
  DATA_DIR,
  ROOT,
  createAssetFromBuffer,
  createAssetFromDataUrl,
  createAssetFromUrl,
  getAsset,
  getConfig,
  listAssets,
  loadAssets,
  loadConfig,
  nextAssetName,
  publicConfig,
  readAssetAsDataUrl,
  assetSize,
  saveConfig,
} from './store.mjs'
import { ApiError, chat, createVideo, generateImage, pollVideo } from './agnes.mjs'
import { mockImageSvg, mockVideoPosterSvg } from './mock.mjs'

const PORT = Number(process.env.PORT || 8787)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 平台偶发 "image queue is full, please retry later" / 429 时自动退避重试。
 * 这类错误发生在任务入队前，重试不会重复计费。
 */
async function withRetry(fn, { tries = 3, base = 5000 } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      const msg = String(err?.message || '')
      const retryable =
        err?.status === 429 ||
        /queue is full|too many requests|temporarily|busy|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|连接 .* 失败/i.test(
          msg,
        )
      if (!retryable || i === tries - 1) throw err
      console.warn(`[retry ${i + 1}/${tries - 1}] ${msg}`)
      await sleep(base * (i + 1))
    }
  }
  throw last
}

/**
 * 视频创建只试一次：队列满就立刻报错，让用户自己决定什么时候重跑。
 * 平台队列经常一满就是几分钟，自动等待反而让人以为卡住了。
 */
function createVideoOnce(payload) {
  return gate(() => createVideo(payload)).catch((err) => {
    const msg = String(err?.message || '')
    if (/queue is full|queue_full|too many requests|temporarily|unavailable/i.test(msg) || err?.status === 503) {
      throw new ApiError(503, '平台视频队列已满，请稍后手动点「重跑」再试')
    }
    throw err
  })
}

// ------------------------------------------------------------------ 基础
await loadConfig()
await loadAssets()

const app = express()
app.use(cors())
app.use(express.json({ limit: '48mb' }))
app.use('/assets', express.static(ASSETS_DIR))
app.use(express.static(path.join(ROOT, 'dist')))

// ------------------------------------------------------------------ 限流闸门
// 免费账户 RPM 20，默认按 18 留余量。批量的“丝滑”必须建立在诚实排队上。
const RPM = Number(process.env.AGNES_RPM || 18)
const MIN_GAP = Math.max(0, Math.ceil(60_000 / Math.max(1, RPM)))
let gateChain = Promise.resolve()
let lastCall = 0

function gate(fn) {
  const run = async () => {
    const wait = MIN_GAP - (Date.now() - lastCall)
    if (wait > 0) await sleep(wait)
    lastCall = Date.now()
    return fn()
  }
  const p = gateChain.then(run, run)
  gateChain = p.catch(() => {})
  return p
}

// 状态查询单独限速：平台对 status 查询的频率限制比创建任务更严，
// 实测 1.4 秒一次会在十几秒内被 "too many video status queries" 拦下。
const POLL_GAP = Number(process.env.AGNES_POLL_GAP_MS || 6000)
let pollChain = Promise.resolve()
let lastPoll = 0

function pollGate(fn) {
  const run = async () => {
    const wait = POLL_GAP - (Date.now() - lastPoll)
    if (wait > 0) await sleep(wait)
    lastPoll = Date.now()
    return fn()
  }
  const p = pollChain.then(run, run)
  pollChain = p.catch(() => {})
  return p
}

// ------------------------------------------------------------------ 配置
app.get('/api/health', (_req, res) => {
  const cfg = getConfig()
  res.json({
    ok: true,
    mock: !cfg.apiKey,
    ...publicConfig(),
    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '',
    proxyActive: process.env.NODE_USE_ENV_PROXY === '1',
  })
})

app.get('/api/config', (_req, res) => {
  res.json(publicConfig())
})

app.post('/api/config', async (req, res) => {
  try {
    const { apiKey, publicBaseUrl } = req.body || {}
    const patch = {}
    if (typeof apiKey === 'string') patch.apiKey = apiKey.trim()
    if (typeof publicBaseUrl === 'string') patch.publicBaseUrl = publicBaseUrl.trim().replace(/\/$/, '')
    await saveConfig(patch)
    res.json(publicConfig())
  } catch (err) {
    sendError(res, err)
  }
})

// ------------------------------------------------------------------ 素材
app.get('/api/assets', (_req, res) => {
  res.json({ assets: listAssets() })
})

app.post('/api/assets', async (req, res) => {
  try {
    const { dataUrl, name, kind, width, height, duration } = req.body || {}
    if (!dataUrl) return res.status(400).json({ error: '缺少 dataUrl' })
    const asset = await createAssetFromDataUrl(dataUrl, {
      name: name || '上传素材',
      kind: kind || 'image',
      width: Number(width) || 0,
      height: Number(height) || 0,
      duration: Number(duration) || 0,
    })
    res.json({ asset })
  } catch (err) {
    sendError(res, err)
  }
})

app.delete('/api/assets/:id', async (req, res) => {
  const asset = getAsset(req.params.id)
  if (!asset) return res.status(404).json({ error: '素材不存在' })
  try {
    await fsp.unlink(path.join(ASSETS_DIR, asset.file))
  } catch {
    /* ignore */
  }
  res.json({ ok: true })
})

// ------------------------------------------------------------------ 图像生成
const IMAGE_DIMS = {
  '1K': { '1:1': [1024, 1024], '16:9': [1312, 736], '9:16': [736, 1312] },
  '2K': { '1:1': [2048, 2048], '16:9': [2624, 1472], '9:16': [1472, 2624] },
  '3K': { '1:1': [3072, 3072], '16:9': [3936, 2208], '9:16': [2208, 3936] },
  '4K': { '1:1': [4096, 4096], '16:9': [5248, 2944], '9:16': [2944, 5248] },
}

function imagePreviewDims(size, ratio) {
  return IMAGE_DIMS[size]?.[ratio] || [1024, 1024]
}

async function resolveImageInput(input) {
  if (!input) throw new ApiError(400, '非法的参考图')
  if (input.url) return input.url
  const asset = getAsset(input.assetId)
  if (!asset) throw new ApiError(400, '引用的素材不存在（可能已被删除）')
  // 优先用公网 URL：避免大图 base64 触发 413
  if (asset.remoteUrl) return asset.remoteUrl
  const size = await assetSize(asset)
  if (size > 5.5 * 1024 * 1024) {
    throw new ApiError(413, `「${asset.name}」超过 5MB 且没有公网地址，无法作为参考图提交`)
  }
  return readAssetAsDataUrl(asset)
}

app.post('/api/generate/image', async (req, res) => {
  const started = Date.now()
  try {
    const { prompt, size = '2K', ratio = '1:1', inputs = [] } = req.body || {}
    const text = String(prompt || '').trim()
    if (!text) return res.status(400).json({ error: '提示词不能为空' })
    if (!IMAGE_DIMS[size]) return res.status(400).json({ error: `不支持的清晰度：${size}` })
    if (!['1:1', '16:9', '9:16'].includes(ratio)) return res.status(400).json({ error: `不支持的画幅：${ratio}` })
    if (inputs.length > 8) return res.status(400).json({ error: '参考图最多 8 张' })

    const cfg = getConfig()
    const [w, h] = imagePreviewDims(size, ratio)
    const mode = inputs.length ? 'ref' : 't2i'

    if (!cfg.apiKey) {
      await sleep(500 + Math.random() * 700)
      const svg = mockImageSvg({ prompt: text, ratio, size })
      const asset = await createAssetFromBuffer(Buffer.from(svg, 'utf8'), {
        kind: 'image',
        ext: 'svg',
        name: nextAssetName('image'),
        width: w,
        height: h,
        prompt: text,
        mock: true,
        params: { size, ratio, mode },
      })
      return res.json({ asset, resolvedPrompt: text, mock: true, elapsed: Date.now() - started })
    }

    const images = []
    for (const input of inputs) images.push(await resolveImageInput(input))

    const out = await withRetry(() => gate(() => generateImage({ prompt: text, size, ratio, images })))
    const meta = {
      kind: 'image',
      name: nextAssetName('image'),
      width: w,
      height: h,
      prompt: text,
      params: { size, ratio, mode },
    }
    const asset = out.url
      ? await createAssetFromUrl(out.url, meta)
      : await createAssetFromDataUrl(`data:image/png;base64,${out.base64}`, meta)

    res.json({ asset, resolvedPrompt: text, elapsed: Date.now() - started })
  } catch (err) {
    sendError(res, err)
  }
})

// ------------------------------------------------------------------ 视频生成
async function resolvePublicMedia(input) {
  if (!input) throw new ApiError(400, '非法的媒体参数')
  if (input.url) return input.url
  const asset = getAsset(input.assetId)
  if (!asset) throw new ApiError(400, '引用的素材不存在（可能已被删除）')
  if (asset.remoteUrl) return asset.remoteUrl
  const base = getConfig().publicBaseUrl
  if (base) return `${base}${asset.url}`

  // 平台其实接受 data: URI（实测 1.7MB base64 也能过校验），
  // 所以本地素材直接内联，不强制用户配公网地址。
  const size = await assetSize(asset)
  if (size > 8 * 1024 * 1024) {
    throw new ApiError(
      413,
      `「${asset.name}」有 ${(size / 1024 / 1024).toFixed(1)}MB，超过内联上限（8MB）。请在「设置」里填一个公网可访问的地址，或换一张小一点的图。`,
    )
  }
  return readAssetAsDataUrl(asset)
}

// ------------------------------------------------------------------ 视频任务
// 任务记录落盘：关掉服务、重启、换机器都不至于把平台单号（providerId）弄丢。
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json')
const jobs = new Map()
let jobsReady = false
let persistTimer = null

function schedulePersist() {
  if (!jobsReady || persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    const list = [...jobs.values()]
    fsp
      .writeFile(JOBS_PATH, JSON.stringify(list, null, 2))
      .catch((e) => console.warn('[jobs] 保存失败', e.message))
  }, 400)
}

async function loadJobs() {
  try {
    const raw = JSON.parse(await fsp.readFile(JOBS_PATH, 'utf8'))
    if (Array.isArray(raw)) {
      for (const j of raw) {
        if (!j?.id) continue
        delete j.polling
        jobs.set(j.id, j)
      }
    }
    if (jobs.size) console.log(`[jobs] 恢复 ${jobs.size} 条任务记录`)
  } catch {
    /* 首次运行没有这个文件 */
  }
  jobsReady = true
}

function newJob(partial) {
  const job = {
    id: `job_${nanoid(8)}`,
    kind: 'video',
    status: 'queued',
    progress: 0,
    createdAt: Date.now(),
    ...partial,
  }
  jobs.set(job.id, job)
  schedulePersist()
  return job
}

/** 15 分钟太短了：720P 在国内版经常要 10 分钟以上，超时就判死会白丢片子 */
const VIDEO_DEADLINE_MIN = () => Math.max(5, Number(process.env.VIDEO_DEADLINE_MIN || 45) || 45)
/** 单次查询连续出错的容忍次数（网络抖动、平台 5xx 不该直接判失败） */
const POLL_MAX_ERRORS = 6

function metaOf(job) {
  return {
    kind: 'video',
    name: nextAssetName('video'),
    width: job.width,
    height: job.height,
    duration: job.seconds,
    prompt: job.prompt,
    params: { mode: job.mode, ratio: job.ratio, seconds: job.seconds },
  }
}

/**
 * 轮询一个已下单的任务。可以重复调用（resume / 重启后恢复）。
 * 到截止时间不判失败，而是转成 pending：单号还在，随时能接着查。
 */
async function pollJob(job) {
  if (!job || job.polling || !job.providerId) return
  job.polling = true
  job.status = 'running'
  job.note = undefined
  schedulePersist()

  const deadline = Date.now() + VIDEO_DEADLINE_MIN() * 60_000
  let delay = 6000
  let errors = 0

  try {
    while (Date.now() < deadline) {
      await sleep(delay)
      if (!jobs.has(job.id)) return

      let r
      try {
        r = await pollGate(() => pollVideo(job.providerId))
        job.note = undefined
        errors = 0
      } catch (err) {
        const msg = String(err?.message || '')
        const throttled = err?.status === 429 || /too many|rate limit|frequen/i.test(msg)
        if (throttled) {
          delay = Math.min(Math.round(delay * 2), 30000)
          job.note = `平台限制了查询频率，${Math.round(delay / 1000)}s 后再查（任务仍在跑，不影响出片）`
          schedulePersist()
          continue
        }
        errors += 1
        if (errors >= POLL_MAX_ERRORS) throw err
        delay = Math.min(Math.round(delay * 1.5), 30000)
        job.note = `查询出错 ${errors}/${POLL_MAX_ERRORS}，${Math.round(delay / 1000)}s 后重试`
        console.warn(`[video poll] ${job.id} error ${errors}: ${msg.slice(0, 80)}`)
        schedulePersist()
        continue
      }

      if (typeof r.progress === 'number') job.progress = r.progress
      if (r.status === 'completed') {
        if (!r.url) throw new ApiError(502, '任务完成但没有返回视频地址')
        const asset = await createAssetFromUrl(r.url, metaOf(job))
        job.status = 'succeeded'
        job.progress = 100
        job.assetId = asset.id
        job.note = undefined
        job.finishedAt = Date.now()
        schedulePersist()
        return
      }
      if (r.status === 'failed') throw new ApiError(502, r.error?.message || '视频生成失败')
      delay = Math.min(Math.round(delay * 1.5), 20000)
      schedulePersist()
    }

    job.status = 'pending'
    job.note = `平台超过 ${VIDEO_DEADLINE_MIN()} 分钟仍在生成，任务还在平台上跑；点「继续查询」接着等，不会丢`
    schedulePersist()
    console.log(`[video job] ${job.id} pending (${job.providerId})`)
  } catch (err) {
    job.status = 'failed'
    job.error = err?.message || '视频生成失败'
    job.note = undefined
    job.finishedAt = Date.now()
    schedulePersist()
    console.error('[video job]', job.id, job.error)
  } finally {
    job.polling = false
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.polling) continue
    const age = now - (job.createdAt || 0)
    const ttl =
      job.status === 'succeeded' || job.status === 'failed'
        ? 24 * 3600_000
        : 7 * 24 * 3600_000 // pending / 未完成：留久一点
    if (age > ttl) jobs.delete(id)
  }
  schedulePersist()
}, 10 * 60_000).unref?.()

await loadJobs()

// 重启后自动接着查没跑完的任务（错开 1.5s，避免同时打平台）
setTimeout(() => {
  let n = 0
  for (const job of jobs.values()) {
    if (!job.providerId || job.polling) continue
    if (!['running', 'pending', 'queued'].includes(job.status)) continue
    if (Date.now() - (job.createdAt || 0) > 24 * 3600_000) {
      job.status = 'failed'
      job.error = '任务超过 24 小时仍未完成，已停止自动续查'
      continue
    }
    n += 1
    setTimeout(() => pollJob(job), n * 1500)
  }
  if (n) console.log(`[jobs] 自动续查 ${n} 个未完成任务`)
  schedulePersist()
}, 2500).unref?.()

app.post('/api/generate/video', async (req, res) => {
  try {
    const {
      prompt = '',
      mode = 'text',
      seconds = 5,
      ratio = '16:9',
      firstFrame,
      lastFrame,
      refs = [],
      audios = [],
    } = req.body || {}

    const text = String(prompt).trim()
    if (!text) return res.status(400).json({ error: '提示词不能为空' })
    if (!['text', 'keyframe', 'reference'].includes(mode)) return res.status(400).json({ error: '不支持的模式' })
    if (!['1:1', '16:9', '9:16'].includes(ratio)) return res.status(400).json({ error: `不支持的画幅：${ratio}` })
    const sec = Number(seconds)
    if (!Number.isFinite(sec) || sec < 4 || sec > 12) return res.status(400).json({ error: '时长需在 4–12 秒之间' })
    if (mode === 'keyframe' && !firstFrame && !lastFrame) {
      return res.status(400).json({ error: '首尾帧模式至少需要一张图片' })
    }
    if (mode === 'reference') {
      if (refs.length > 5) return res.status(400).json({ error: '参考图片最多 5 张' })
      if (audios.length > 3) return res.status(400).json({ error: '参考音频最多 3 段' })
      if (refs.length + audios.length > 8) return res.status(400).json({ error: '参考素材总数超出限制' })
      if (!refs.length && !audios.length) return res.status(400).json({ error: '参考模式至少需要一个参考素材' })
    }

    const cfg = getConfig()
    const [w, h] = ratio === '9:16' ? [720, 1280] : ratio === '16:9' ? [1280, 720] : [720, 720]

    if (!cfg.apiKey) {
      const job = newJob({ status: 'running', mock: true, mode, seconds: sec, ratio, prompt: text, width: w, height: h })
      let progress = 0
      const timer = setInterval(async () => {
        progress = Math.min(100, progress + 6 + Math.random() * 12)
        job.progress = Math.round(progress)
        if (progress >= 100) {
          clearInterval(timer)
          const svg = mockVideoPosterSvg({ prompt: text, ratio, seconds: sec })
          const asset = await createAssetFromBuffer(Buffer.from(svg, 'utf8'), {
            kind: 'video',
            ext: 'svg',
            name: nextAssetName('video'),
            width: w,
            height: h,
            duration: sec,
            prompt: text,
            mock: true,
            params: { mode, ratio, seconds: sec },
          })
          job.status = 'succeeded'
          job.progress = 100
          job.assetId = asset.id
          job.finishedAt = Date.now()
          schedulePersist()
        }
      }, 550)
      return res.json({ jobId: job.id, mock: true })
    }

    const payload = { prompt: text, mode, seconds: sec, ratio }
    if (mode === 'keyframe') {
      payload.firstFrame = firstFrame ? await resolvePublicMedia(firstFrame) : undefined
      payload.lastFrame = lastFrame ? await resolvePublicMedia(lastFrame) : undefined
    }
    if (mode === 'reference') {
      payload.images = []
      for (const r of refs) payload.images.push(await resolvePublicMedia(r))
      payload.audios = []
      for (const a of audios) payload.audios.push(await resolvePublicMedia(a))
    }

    const job = newJob({
      status: 'queued',
      mode,
      seconds: sec,
      ratio,
      prompt: text,
      width: w,
      height: h,
    })

    ;(async () => {
      try {
        const { videoId } = await createVideoOnce(payload)
        job.providerId = videoId
        schedulePersist()
        await pollJob(job)
      } catch (err) {
        job.status = 'failed'
        job.error = err?.message || '视频生成失败'
        job.finishedAt = Date.now()
        schedulePersist()
        console.error('[video job]', job.id, job.error)
      }
    })()

    res.json({ jobId: job.id })
  } catch (err) {
    sendError(res, err)
  }
})

function viewJob(job) {
  const { polling, ...rest } = job
  return rest
}

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: '任务不存在或已过期' })
  const asset = job.assetId ? getAsset(job.assetId) : null
  res.json({ ...viewJob(job), asset })
})

/** 继续查询：复用原来的 providerId，不重新下单、不重复扣额度 */
app.post('/api/jobs/:id/resume', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: '任务不存在或已过期' })
  if (job.status === 'succeeded') {
    const asset = job.assetId ? getAsset(job.assetId) : null
    return res.json({ ...viewJob(job), asset })
  }
  if (!job.providerId) {
    return res.status(400).json({ error: '这个任务还没有拿到平台单号（下单阶段就中断了），需要重新生成' })
  }
  if (!job.polling) {
    pollJob(job).catch((e) => console.warn('[video job] resume failed', e?.message))
  }
  res.json({ ...viewJob(job), resumed: true })
})

// ------------------------------------------------------------------ 提示词优化
const IMAGE_PROMPT_SYS = `你是漫剧分镜的提示词编辑。把用户给的描述改写成可以直接喂给图像生成模型的中文提示词。
规则：
1. 只输出改写后的提示词本身：不要解释、不要分条、不要加引号、不要写"提示词："。
2. 原文中的 @ 引用（例如 @钢铁侠、@导演台1）必须原样保留，一个字符都不要改。
3. 按这个顺序组织：主体与外貌 → 动作与姿态 → 场景与环境 → 光线与氛围 → 镜头景别与角度 → 画面风格与画质。
4. 具体、可视觉化，避免抽象词堆砌；总长控制在 160 字以内。
5. 不要输出"参考图N是示意图"这类使用说明，那部分由系统另外处理。`

const VIDEO_PROMPT_SYS = `你是漫剧分镜的提示词编辑，负责写图生视频的镜头描述。把用户给的描述改写成可以直接喂给视频生成模型的中文提示词。
规则：
1. 只输出改写后的提示词本身：不要解释、不要分条、不要加引号。
2. 原文中的 @ 引用（例如 @钢铁侠）必须原样保留，一个字符都不要改。
3. 按顺序写：主体动作 → 镜头运动（推拉摇移跟）→ 环境动态（雨、风、烟尘）→ 光线变化 → 节奏与氛围。
4. 内容要能被 4–12 秒的单个镜头拍完，不要出现场景切换；控制在 120 字以内。`

app.post('/api/optimize-prompt', async (req, res) => {
  const started = Date.now()
  try {
    const { prompt, kind = 'image', mode = '', ratio = '9:16', seconds = 5, tokens = [] } = req.body || {}
    const text = String(prompt || '').trim()
    if (!text) return res.status(400).json({ error: '先写点内容再优化' })
    if (!getConfig().apiKey) {
      return res.status(400).json({ error: '未配置 API Key，提示词优化要调用文本模型 agnes-3.0-flash' })
    }

    const isVideo = kind === 'video'
    const list = Array.isArray(tokens) ? tokens.filter(Boolean) : []
    const tokenHint = list.length
      ? `\n必须原样保留这些 @ 引用，不许改写/翻译/加空格：${list.map((t) => `@${t}`).join('、')}`
      : ''
    const user = `画幅：${ratio}${isVideo ? `；时长：${seconds} 秒；生成模式：${mode}` : `；生成模式：${mode}`}
用户描述：${text}${tokenHint}`

    const out = await withRetry(() =>
      gate(() =>
        chat(
          [
            { role: 'system', content: isVideo ? VIDEO_PROMPT_SYS : IMAGE_PROMPT_SYS },
            { role: 'user', content: user },
          ],
          { temperature: 0.7, maxTokens: 800 },
        ),
      ),
    )

    if (!out) throw new ApiError(502, '文本模型没有返回内容')
    const cleaned = out.trim().replace(/^["“]|["”]$/g, '').trim()

    const missing = list.filter((t) => text.includes(`@${t}`) && !cleaned.includes(`@${t}`))
    if (missing.length) {
      return res.status(422).json({
        error: `优化结果把引用弄丢了：${missing.map((t) => `@${t}`).join('、')}，已放弃这次优化`,
      })
    }

    res.json({ prompt: cleaned, elapsed: Date.now() - started })
  } catch (err) {
    sendError(res, err)
  }
})

// ------------------------------------------------------------------ 兜底
function sendError(res, err) {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500
  if (status >= 500) console.error('[api]', status, err?.message)
  res.status(status).json({ error: err?.message || '服务异常', detail: err?.payload })
}

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: '接口不存在' })
  res.sendFile(path.join(ROOT, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  const cfg = getConfig()
  fs.mkdirSync(DATA_DIR, { recursive: true })
  console.log(`\n  漫剧画布 API  →  http://127.0.0.1:${PORT}`)
  console.log(`  模式：${cfg.apiKey ? '真实调用 Agnes' : '演示模式（未配置 API Key）'}`)
  console.log(`  限流：${RPM} RPM\n`)
})
