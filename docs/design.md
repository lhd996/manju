# AI 漫剧画布 · 接入核实与产品/技术方案

> 状态：设计稿 v0.1
> 三个模型（文本 / 图像 / 视频）的接口信息均按 2026-10 官方文档核实；本文所有请求样例未用真实 Key 跑通，Phase 0 的第一件事就是实测。

---

## 0. 一句话结论

不要把"漫剧画布"做成"聊天框 + 图片瀑布流"。它应该是一张**带依赖关系的生产看板**：
剧本 → 分镜 → 首帧 → 片段 → 成片，每个镜头是一个可寻址、可版本化、可局部重跑的节点，
角色/场景卡是全局引用，改动只"标记过期"而不"自动重跑"。
三个模型分别对应这条产线上的三段：**分镜表（文本）→ 首帧图（图像）→ 镜头片段（视频）**，
它们之间靠**图片 URL**串联，所以"素材必须公开可访问"是整个架构的地基。

---

## 1. 三个模型的接入事实

### 1.1 通用

| 项目 | 值 |
| --- | --- |
| Base URL | `https://apihub.agnes-ai.com/v1` |
| 鉴权 | `Authorization: Bearer YOUR_API_KEY`（Messages API 用 `x-api-key` + `anthropic-version`） |
| 密钥位置 | **只能放服务端**。文档明确要求不要写进前端代码、日志、公开仓库 |
| 免费额度 | 免费用户 **RPM 20**（这一条会决定整个排队设计） |
| 当前价格 | 三个模型目前全部 `$0`（限时免费） |

### 1.2 文本 `agnes-3.0-flash`

| 项目 | 值 |
| --- | --- |
| 端点 | `POST /v1/chat/completions`（OpenAI 兼容）；另有 `/v1/responses`、`/v1/messages`（Anthropic 兼容） |
| 输入 | 文本 + **图像 URL** |
| 输出 | 文本 |
| 上下文 | 512K |
| 最大输出 | 65,536 token |
| 流式 | `stream: true` |
| 工具调用 | `tools` + `tool_choice`，OpenAI 格式 |
| 思考模式 | `chat_template_kwargs: { enable_thinking: true }` |

**关键判断**：512K 上下文意味着**整本剧本 + 全部分镜表 + 角色圣经可以一次性塞进去**，
不需要 RAG。这对"全局一致性"极其有利——模型能在写第 30 镜时看到第 1 镜的设定。

**缺口**：文档没有 `response_format` / JSON mode。要结构化输出，只能用 **function calling 强制 schema**
（定义一个 `emit_storyboard` 工具，`tool_choice` 强制调用），拿到 `tool_calls[].function.arguments` 后自己 `JSON.parse` + zod 校验。

### 1.3 图像 `agnes-image-2.5-flash`

| 项目 | 值 |
| --- | --- |
| 端点 | `POST /v1/images/generations` |
| 必填 | `model`、`prompt`、`size` |
| `size` | 档位 `1K`/`2K`/`3K`/`4K`，兼容 `1024x768` 这类精确值（会被标准化） |
| `ratio` | `1:1`/`3:4`/`4:3`/`16:9`/`9:16`/`2:3`/`3:2`/`21:9` |
| 图生图 / 多图 | `extra_body.image: string[]`（公共 URL 或 Data URI） |
| 输出格式 | `extra_body.response_format: "url" \| "b64_json"`；文生图也可 `return_base64: true` |
| 返回 | `data[0].url` 或 `data[0].b64_json` |
| 耗时 | **同步接口，数秒到几十秒**，官方建议客户端超时 `60s–360s` |

**两个坑（文档明确点名）**：
1. `response_format` **不能放请求体顶层**，必须放 `extra_body` 里。
2. 图生图**不要**传 `tags: ["img2img"]`，只要给 `extra_body.image`。
3. 注意文档自相矛盾：参数表写 `image` 是顶层字段，但所有示例和"重要说明"都用 `extra_body.image`。
   **以示例为准（`extra_body.image`），Phase 0 实测确认。**

**竖屏漫剧的尺寸选择**：

| 用途 | size + ratio | 实际像素 |
| --- | --- | --- |
| 首帧（竖屏） | `2K` + `9:16` | 1472×2624 |
| 首帧（快速草稿） | `1K` + `9:16` | 736×1312 |
| 角色三视图 | `2K` + `3:4` | 1728×2304 |
| 场景概念图 | `2K` + `16:9` | 2624×1472 |

另外：`500` 错误说明里提到"图像生成尺寸必须是 16 的倍数"，所以**只用档位式 size，不要自己算像素**。

### 1.4 视频 `agnes-video-2.5-flash`

| 项目 | 值 |
| --- | --- |
| 创建 | `POST /v1/videos` |
| 查询 | `GET /agnesapi?video_id=<ID>&model_name=agnes-video-2.5-flash` |
| 模式 | `text` / `keyframe` / `reference` |
| 时长 | `seconds` 字符串 `"4"`–`"12"`，默认 `"5"` |
| 分辨率 | `size` **只能 `"720P"`**，其他值 HTTP 400 |
| 画幅 | `aspect_ratio`，9:16 → **720×1280** |
| 参数 | `seed` 可复现；`n` 只能 `1` |

**三种模式是本项目最重要的能力映射**：

| mode | 媒体 | 适合 |
| --- | --- | --- |
| `keyframe` | `first_frame` / `last_frame`（至少一个，公共 URL） | **漫剧主力**：把画好的首帧原样作为视频第一帧，构图不跑 |
| `reference` | `images` ≤ 5、`audios` ≤ 3、不支持 `videos` | 角色/风格参考，但会重新构图 |
| `text` | 无 | 空镜、转场、氛围 |

**异步语义（必须照做）**：
- 创建响应里有 `id`、`task_id`、`video_id`，**轮询要用 `video_id`**。
- 查询**必须带 `model_name`**（`keyframe` / `reference` 模式不带会查不到，只有 `text` 模式能省）。
- `status`：`queued` → `in_progress` → `completed` / `failed`，`progress` 0–100。
- **`internal_status` / `internal_progress` 是内部字段，不能用来判断完成**，只看 `status` 和 `url`。
- 建议 1–2 秒轮询一次，设置最大轮询时长，`429` 指数退避。
- 媒体 URL 必须**公开可访问**，且**在任务完成前保持有效**。
- `expires_at` 字段存在 → 产出的视频 URL **可能会过期，拿到就立刻转存**。

### 1.5 三者的串联关系（这是全案的枢纽）

```
文本模型 ──(分镜表 JSON)──→ 图像模型 ──(首帧图 URL)──→ 视频模型
                              ↑                              │
                              └──────(上一镜尾帧 / 角色卡)─────┘
```

图像模型的输出 URL 会作为视频模型的 `first_frame` 输入，**所以图片必须先落到我们自己的公开存储上**，
不能依赖第三方返回的临时 URL。这一条决定了架构里必须有对象存储 + CDN。

---

## 2. 我对"漫剧画布"的理解

### 2.1 漫剧是什么，决定了工具长什么样

漫剧 = 动态漫短剧：竖屏、单集 1–3 分钟、一季 20–60 集、以**旁白和对白驱动**，
画面是漫画/条漫质感的静帧 + 有限动效（推拉摇移、光效、局部循环），不是全动画。
它的成本结构是：**镜头数量多（单集 30–60 镜）、单镜成本要低、角色必须高度一致**。

这三个特征直接推出产品形态：

| 特征 | 推论 |
| --- | --- |
| 镜头多 | 必须有**批量生成**和**看板式全景**，不能一镜一对话框 |
| 单镜便宜 | 必须能**局部重跑**，不能一改全重来 |
| 角色一致 | 必须把"角色"提升为**一等公民的引用对象**，而不是 prompt 里的一句话 |

### 2.2 为什么必须是画布，而不是聊天框

聊天框的根本问题是**上下文是线性的**：第 30 镜和第 2 镜在界面里距离太远，改一个角色要翻回去改 30 次。
画布的价值不是"看起来高级"，而是三件事：

1. **结构可见**：一屏看到整集的节奏（哪里快、哪里慢、哪里缺镜头）。
2. **引用可见**：这条线连着"角色·林晚 v3"，那条线连着"场景·天台 v2"。
3. **版本可控**：这一镜试了 7 版，第 3 版被选中并锁定，其余不删。

所以画布的**核心机制是一个内容版的车床（build system）**：

```
依赖图（DAG） + 产物版本 + 失效传播
```

改动角色卡 → 所有引用它的镜头标记为"过期"（黄点），**但不自动重跑**。
用户按"重跑所有过期镜头"或逐镜处理。这是刻意的：免费额度 RPM 20，自动重跑会瞬间打爆限流，
而且会覆盖掉已经人工挑选通过的镜头。**"标记但不自动执行"，是画布和玩具的分界线。**

### 2.3 画布的三层，一个平面

不要做三个割裂的页面，做**同一张画布的三个缩放层级**：

| 层 | 内容 | 交互 |
| --- | --- | --- |
| **故事层** | 大纲、分集、场、节拍 | 卡片 + 拖拽排序，先于任何生成就可用 |
| **分镜层**（主战场） | 镜头卡：首帧、描述、台词、景别、运镜、时长、状态 | 网格看板 / 依赖图，两种视图切换 |
| **成片层** | 时间线：视频轨、配音轨、字幕轨、音乐轨 | 粗剪，只做拼接与对齐 |

**关键设计：没生成任何图之前，画布也必须好用。**
它首先是个剧本/分镜写作工具，然后才是生成工具。否则用户一上来就烧额度、看不到价值。

### 2.4 界面布局（具体到栏位）

```
┌─────────────────────────────────────────────────────────────┐
│ 项目 · 画幅9:16 · [剧本|分镜|成片]      队列 ●3  今日 42/∞  [导出] │
├──────────┬──────────────────────────────────────┬───────────┤
│ 结构树    │            画  布                     │  检查器    │
│ EP01     │  ┌────┐ ┌────┐ ┌────┐                │ 镜号 S03-07│
│ ├ 场1 天台│  │ 01 │ │ 02 │ │ 03 │  ← 镜头卡      │ 画面描述   │
│ │ ├ S01-01│  └────┘ └────┘ └────┘                │ [重写]     │
│ │ ├ S01-02│  ┌────┐ ┌────┐                       │ 参考图槽   │
│ │ └ S01-03│  │ 04 │ │ 05 │  ●过期                │ 角色 场景 风格│
│ ├ 场2 街道│  └────┘ └────┘                       │ 参数/seed  │
│ └ ...    │                                       │ 版本历史   │
├──────────┴──────────────────────────────────────┴───────────┤
│ 时间线  ▮▮▮▮▮▮▮▮▯▯▯  视频轨 / 配音轨 / 字幕轨 / 音乐轨            │
└─────────────────────────────────────────────────────────────┘
```

**核心手势**：
- 空格 = 生成 / 重生成当前选中
- 把角色卡拖到镜头 = 建立引用（产生一条边）
- 拖动镜头 = 排序（重排镜号，自动重算时间线）
- `Alt` 悬停 = 版本前后对比
- 多选 + 右键 = 批量生成 / 批量锁定 / 批量重写描述

### 2.5 数据模型（可直接建表）

```
Project(id, title, style_bible, aspect=9:16, fps, target_platform)
Character(id, project_id, name, appearance, personality, ref_images[], locked_version)
Scene(id, project_id, name, time_of_day, description, ref_image)
Episode(id, project_id, index, title, logline, script_text, status)
Shot(id, episode_id, scene_id, index, -- S03-07
     shot_size, camera_move, description, dialogue, narration,
     duration_ms, character_ids[], status, is_locked, updated_at)
Asset(id, project_id, kind[image|video|audio], storage_key,
      width, height, duration_ms, sha256, meta_json)
Generation(id, project_id, target_kind, target_id, model, params_json,
           input_asset_ids[], seed, status, provider_task_id,
           cost_json, output_asset_id, error, attempts, created_at)
TimelineItem(id, episode_id, track, start_ms, end_ms, shot_id, asset_id, meta_json)
Edge(id, from_kind, from_id, to_kind, to_id)   -- 依赖图
```

`Shot.status`：`draft` → `described` → `framed`（有首帧）→ `animated`（有片段）→ `approved`
`Shot.stale`：由 `Edge` + 依赖方版本号计算得出，不落库（或落一个缓存位）。

---

## 3. 流水线：三个模型怎么串成一条产线

### 3.1 五步，每步对应哪个模型

| 步 | 输入 | 模型 | 输出 |
| --- | --- | --- | --- |
| ① 分集与分镜表 | 原著/大纲 + 角色圣经 + 风格指南 | 文本 `agnes-3.0-flash` | 结构化 JSON：场 → 镜 |
| ② 角色卡 / 场景卡 | 角色描述 | 图像 `agnes-image-2.5-flash`（t2i，2K，3:4） | 定妆图，人工确认 |
| ③ 每镜首帧 | 分镜描述 + 角色卡 + 场景卡 + 风格图 | 图像（i2i / 多图合成，2K，9:16） | 1472×2624 静帧 |
| ④ 每镜片段 | 首帧（+ 下一镜首帧） | 视频 `agnes-video-2.5-flash`（`keyframe`，720P，9:16） | 4–12s mp4 |
| ⑤ 合成成片 | 片段 + 配音 + 字幕 + BGM | FFmpeg | 1080×1920 mp4 |

**① 的 schema（强制 function calling）**，这是整条产线的质量源头：

```ts
// tools: [{ type: "function", function: {
//   name: "emit_storyboard",
//   parameters: { type: "object", required: ["episode","shots"], properties: {
//     episode: { type: "object", properties: { title:{type:"string"}, logline:{type:"string"} } },
//     shots: { type: "array", items: { type:"object",
//       required: ["index","scene","shot_size","camera_move","visual","dialogue","duration_s"],
//       properties: {
//         index:{type:"integer"},
//         scene:{type:"string"},
//         shot_size:{type:"string", enum:["远景","全景","中景","近景","特写","大特写"]},
//         camera_move:{type:"string", enum:["固定","推","拉","摇","移","跟","升","降"]},
//         visual:{type:"string"},          // 画面描述，直接喂图像模型
//         dialogue:{type:"string"},        // 台词/旁白
//         emotion:{type:"string"},
//         duration_s:{type:"number", minimum:2, maximum:12}
//       }}}}}
// } }]
// tool_choice: { type: "function", function: { name: "emit_storyboard" } }
```

要点：
- `visual` 字段要写成**图像模型能直接吃的提示词**（主体+场景+风格+光照+构图），
  文档给了推荐结构，让文本模型按这个结构写，能少一道转换。
- `duration_s` 限制在 2–12，因为视频模型只支持 4–12；低于 4 的镜头在导出时裁切。
- 每场镜头数让模型自己定，但**上限写死**（比如 12），避免一次吐 60 镜导致 schema 崩。

### 3.2 一致性策略（这是全项目最难的部分）

三种模型都**没有**角色 LoRA、没有固定人脸、没有 IP-Adapter 之类的身份锁定。
所以一致性只能靠**参考图 + 首帧锁定 + 人工选片**三件事叠出来：

1. **角色卡先行**：先出 3–5 张定妆图，人工挑一张作为 canonical。这张图后续进每个镜头的 `extra_body.image`。
2. **图生图而不是文生图**：同一场的镜头，用**已通过的上一镜首帧**做 i2i 基底，
   prompt 只描述"改什么、保留什么"（文档推荐结构：`[改变要求] + [新风格/场景] + [增删元素] + [需要保留的元素]`）。
   这比纯文生图的一致性高一个量级。
3. **多图合成限定最多 5 张**：角色卡 1 + 场景卡 1 + 风格图 1 + 上一镜 1 = 4，留 1 张余量。
   超过 5 张反而互相干扰。
4. **视频用 `keyframe` 不用 `reference`**：`reference` 会重新构图，人物会飘；
   `keyframe` 把首帧原样作为第一帧，画风不跑。漫剧要的正是"画好的图动起来"。
5. **链式衔接**：镜头 N 的 `last_frame` = 镜头 N+1 的 `first_frame`，
   这样两段拼接处没有跳变，等价于做了"无缝转场"。
6. **固定 seed**：同镜头重试时锁 seed，只改 prompt，才能定位是哪个变量导致的变化。

**诚实预期**：即使全做对，30 个镜头里的脸还是会有 10–20% 的漂移。
所以产品必须把"人工挑选/局部重绘"做成一等公民，而不是假装全自动。
**这个工具的真实定位是"把 30 镜的返工量从 3 小时压到 20 分钟"，不是"一键出片"。**

### 3.3 三个能力缺口，必须现在决定怎么补

| 缺口 | 影响 | 方案 |
| --- | --- | --- |
| **无 TTS** | 漫剧是配音驱动的，没声音等于没做完 | 短期：浏览器/Edge TTS 或用户上传；中期：接一家 TTS（火山/ MiniMax / ElevenLabs）。**架构上把 `audio` 当成独立 Asset 类型，别和视频耦合** |
| **无口型** | 对白镜头会"面瘫" | 用漫剧原生手法规避：旁白驱动 + 局部动效（发丝、光斑、镜头推近），这是行业通行做法，不算缺陷 |
| **单镜 4–12s / 仅 720P** | 长镜头要拼，720P 上 1080 会糊 | 分镜阶段就按 4–8s 切；导出时 lanczos 放大 + 轻锐化；评估是否值得为 2K 换 `agnes-video-2.5`（付费） |

> 视频模型是否输出音轨，文档没写清楚（prompt 里可以描述"自然环境声"，`reference` 模式能吃音频参考）。
> **Phase 0 必须实测**：如果带音轨，混音时要 ducking；如果不带，音效全得自己配。

---

## 4. 系统架构

### 4.1 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 前端 | Next.js (App Router) + TS + Tailwind + shadcn/ui | 一体化，Server Action 天然隔离密钥 |
| 画布 | `@xyflow/react`（图视图）+ 虚拟化网格（板视图） | 图只做"依赖与分支"，主视图用看板，避免节点面条 |
| 客户端状态 | Zustand（画布 UI）+ TanStack Query（服务端数据） | 服务端为唯一真相 |
| 后端 | Next.js Route Handlers + 独立 Worker 进程 | 长任务不能跑在 serverless 请求里 |
| 队列 | BullMQ + Redis（或 Trigger.dev 托管） | 限流、重试、可见进度 |
| DB | Postgres + Prisma | 关系型，依赖图好查 |
| 存储 | S3 / Cloudflare R2 + CDN，**公开桶 + 随机路径** | 视频模型要求公开 URL |
| 媒体 | FFmpeg（worker 内） | 拼接、字幕、混音 |
| 实时 | SSE | 比 WS 简单，够用 |
| 部署 | App 上 Vercel，Worker 上 Fly/Railway；或单机 Docker Compose | 单机更省事（FFmpeg + 轮询常驻） |

### 4.2 请求路径（密钥永不进浏览器）

```
浏览器 ──POST /api/generate──→ Next Route Handler
                                 │ 鉴权 + 参数校验 + 幂等去重
                                 │ 建 Job 行（status=queued）
                                 │ enqueue
                                 ↓
                              BullMQ ──→ Worker
                                           │ 令牌桶限流（18 req/min < RPM 20）
                                           │ 调 Agnes API（服务端持 Key）
                                           │ 图片：同步等待 60–360s
                                           │ 视频：创建 → 轮询 video_id
                                           │ 产物转存 R2 + 写 Asset 行
                                           │ 更新 Job status/progress
                                           ↓
浏览器 ←──GET /api/jobs/:id/stream (SSE)────┘
```

**为什么必须这样**：
- Key 泄露 = 别人用你的额度。
- 图像接口同步几十秒，serverless 函数 10–60s 就超时了 → 必须队列 + 长驻 worker。
- 浏览器关页面会产生 `499`，但**生成还在跑**，所以轮询必须在服务端，且任务要能断点续查。

### 4.3 统一 Job 抽象（图、视频共用一个状态机）

```ts
type Job = {
  id: string
  kind: 'storyboard' | 'image' | 'video' | 'render'
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  progress: number          // 0-100
  providerTaskId?: string   // 视频的 video_id
  input: unknown
  output?: { assetId?: string; json?: unknown }
  error?: { code?: string; message: string }
  attempts: number
  createdAt: string
}
```

视频 worker 的核心循环（务必按文档的坑写）：

```ts
async function runVideo(job: Job) {
  const created = await post('/videos', buildBody(job.input))
  const videoId = created.video_id ?? created.id
  const deadline = Date.now() + 10 * 60_000
  let delay = 1500

  while (Date.now() < deadline) {
    await sleep(delay)
    const r = await get(
      `/agnesapi?video_id=${videoId}&model_name=agnes-video-2.5-flash`
    )
    if (r.status === 'completed') return mirrorToR2(r.url)   // 立刻转存，URL 可能过期
    if (r.status === 'failed') throw new Error(r.error?.message ?? 'failed')
    reportProgress(r.progress)
    delay = Math.min(delay * 1.2, 4000)                      // 退避，别打爆 RPM
  }
  throw new Error('poll timeout')
}
```

### 4.4 存储与公开 URL（地基）

1. 图像模型返回 `data[0].url`（`storage.googleapis.com`）→ **立即下载 → 上传 R2 → 写 Asset**。
2. 所有送进 Agnes 的媒体 URL 都用自己的域名：`https://cdn.example.com/a/<random>/<id>.png`。
   **不要用带签名的临时 URL**，文档要求"任务完成前保持有效"，签名链接会中途失效。
3. 路径用随机不可猜 ID（不是自增），公开桶也要防止被人遍历。
4. 视频完成后的 `url` 同样立即转存；`expires_at` 非空就说明会过期。
5. 本地开发用 `cloudflared tunnel` 暴露公开 URL，否则视频的 `first_frame` 根本传不进去——
   **这是本地开发最容易卡住的一步，提前准备**。

### 4.5 限流与排队（免费额度下的真实体验）

RPM 20 = 平均 3 秒一个请求。一集 40 镜，每镜 1 图 + 1 视频 = 80 个请求
→ **光限流就要 4 分钟**，加上生成时间，单集约 15–25 分钟（并发 2）。

所以：
- 服务端令牌桶（18/min，留余量），**全局单例**，别每个 worker 各自限流。
- 队列对用户可见：卡片上显示"排队中 · 第 3 位"。
- 支持"边生成边审"：先生成前 10 镜，用户在等的同时写后 8 镜的分镜。
- `409 Conflict`（重复提交）→ 用 `hash(prompt+params+refIds)` 去重窗口 60s。
- `429` → 指数退避，不要重试风暴。

---

## 5. 工程陷阱清单

| # | 陷阱 | 处理 |
| --- | --- | --- |
| 1 | 图像 `response_format` 放顶层 | 必须放 `extra_body.response_format` |
| 2 | 图生图传了 `tags:["img2img"]` | 不要传，只给 `extra_body.image` |
| 3 | 视频轮询不带 `model_name` | `keyframe`/`reference` 会查不到，永远带 |
| 4 | 用 `internal_status` 判断完成 | 只看 `status` + `url` |
| 5 | 视频 `size` 传 `"9:16"` 或 `1080P` | Flash 只接受 `"720P"`，画幅走 `aspect_ratio` |
| 6 | `seconds` 传数字 | 必须是字符串 `"5"`，范围 `"4"`–`"12"` |
| 7 | 用第三方返回的图片 URL 当 `first_frame` | 可能过期/防盗链 → 先转存自己的 CDN |
| 8 | 浏览器直接调 API | Key 泄露 + CORS + 超时，必须服务端代理 |
| 9 | 图像请求当普通 HTTP 同步处理 | 几十秒，会被网关超时 → 队列 + SSE |
| 10 | 改角色卡自动重跑全部镜头 | 打爆 RPM、覆盖已通过镜头 → **只标过期** |
| 11 | `size` 写 `1080x1920` | 不是 16 倍数、不被支持 → 用 `2K` + `9:16` |
| 12 | 文本模型指望 `response_format` | 没有 → 用 tool calling 强制 schema |
| 13 | 同一 prompt 重复点击 | `409` + 重复扣费 → 幂等 hash |
| 14 | 前端断开就丢任务 | 轮询在服务端，任务表持久化，重连可恢复 |
| 15 | 免费额度假设无限 | 从第一天记 `Generation.cost_json`（token/秒/张），免费结束才不慌 |

---

## 6. MVP 路线

### Phase 0 · 打通验证（1–2 天，先于任何 UI）

一个 Node 脚本，跑通"一句话 → 一条 8 秒成片"：

```
logline
 → 文本模型：5 镜分镜表（tool calling 强制 schema）
 → 图像模型：1 张角色卡 + 5 张首帧（2K/9:16，i2i 带角色卡）
 → 视频模型：3 段 keyframe（首帧 + 下一镜首帧）
 → FFmpeg：拼接 + 烧字幕 → out.mp4
```

**要测出来的数字**（这些数字决定产品形态，比代码重要）：
- 单张 2K 首帧耗时（P50/P90）
- 单段 5s 视频耗时
- 实际 RPM 上限、`429` 触发阈值
- 视频是否带音轨、码率、实际分辨率
- 同一角色卡喂 5 个不同镜头，脸漂移程度（人工打分）
- `extra_body.image` vs 顶层 `image`，哪个真的生效

**不要跳过这一步。** 上面所有"文档说"的地方，只有真跑过才知道有没有坑。

### Phase 1 · 可用（1–2 周）

- 项目 / 剧集 / 场 / 镜头 CRUD，结构树 + 看板
- 分镜表生成（流式，可编辑，可单镜重写）
- 角色卡 / 场景卡管理（生成、选定、锁定）
- 单镜 / 批量出图，出视频，队列可见，SSE 进度
- 版本历史 + 选中 + 锁定
- 导出单集 mp4（字幕烧录）
- **不做**：图视图、时间线编辑、多人协作、TTS

### Phase 2 · 好用（2–4 周）

- 依赖图视图 + 失效传播（黄点 + "重跑过期"）
- 时间线粗剪（拖拽、配音对齐、BGM ducking）
- 链式首尾帧自动衔接
- 模板（画风预设、分镜节奏预设）
- 成本面板（虚拟计费，映射到免费结束后的真实价格）
- TTS 接入（第 4 个 provider，Asset 层已预留）

### Phase 3 · 产品化

- 多人协作 / 评论 / 审批流
- 多模型路由（同一镜头换模型对比）
- 一键多平台导出（抖音/快手/红果的规格差异）
- **AI 生成内容标识**（国内《人工智能生成合成内容标识办法》要求显式/隐式标识，
  导出时写元数据 + 角标，这个从 Phase 2 就该预留接口）

---

## 7. 风险

| 风险 | 等级 | 应对 |
| --- | --- | --- |
| 角色一致性达不到可发布水准 | **高** | Phase 0 先用真实素材测；不行就转向"强旁白 + 少露脸"的剧本策略，或引入换脸/训练 |
| 免费额度结束 / 突然限流 | 中 | 成本台账从第一天记；模型层做 provider 接口，可切别家 |
| 无 TTS 导致成片不完整 | 中 | Asset 层解耦；先接 Edge TTS 出 demo |
| 720P 上 1080 画质不足 | 中 | Phase 0 看实拍观感；不行就付费上 `agnes-video-2.5` 的 2K |
| 生成内容的版权与合规 | 中 | 素材来源留痕、导出标识、避免真人肖像风格 |
| 单机 worker 挂了任务丢失 | 低 | Job 持久化 + 重启后扫描 `running` 任务续查 `video_id` |

---

## 8. 下一步

1. 你给一个 Agnes API Key（或自己 `export AGNES_API_KEY`），我把 Phase 0 脚本写出来跑一遍，
   拿到真实耗时/画质/限流数据。
2. 数据模型和 API 契约我按上面直接落成 Prisma schema + 三个 provider 的 TS 封装。
3. UI 先做"结构树 + 看板 + 检查器"三栏，不做无限画布——**先证明产线跑得通，再谈画布的手感**。
