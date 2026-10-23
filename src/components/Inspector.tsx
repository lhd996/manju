import { useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import type { AnyNodeData, DirectorNodeData, ImageNodeData, VideoNodeData } from '../types'
import { mentionColor, mentionables, resolvePrompt, type Mentionable } from '../lib/prompt'
import { PromptEditor } from './PromptEditor'
import { AssetThumb, Field, Icon, Segmented, Spinner } from './ui'
import { cx } from '../lib/media'

const ROLE_LABEL: Record<string, string> = {
  ref: '参考',
  first: '首帧',
  last: '尾帧',
  image: '参考图',
  audio: '音频',
}

/** 「最终提交」下面那行映射说明：让用户一眼看出 图N 对应哪个素材 */
function mapLabel(item: Mentionable, index: number, data: AnyNodeData, items: Mentionable[]) {
  if (data.kind === 'image') return `图${index + 1} = ${item.name}`
  if (data.kind === 'director') return item.name
  if (data.mode === 'keyframe') return `${item.role === 'first' ? '首帧' : '尾帧'} = ${item.name}`
  const images = items.filter((i) => i.role !== 'audio')
  const audios = items.filter((i) => i.role === 'audio')
  return item.role === 'audio'
    ? `Audio${audios.indexOf(item) + 1} = ${item.name}`
    : `Picture${images.indexOf(item) + 1} = ${item.name}`
}

export function Inspector() {
  const selectedId = useStore((s) => s.selectedId)
  const data = useStore((s) => {
    if (!s.selectedId) return null
    const node = s.nodes.find((n) => n.id === s.selectedId)
    return node ? (node.data as unknown as AnyNodeData) : null
  })

  const [optimizing, setOptimizing] = useState(false)

  if (!selectedId || !data) return <Empty />
  if (data.kind === 'director') return <DirectorInspector id={selectedId} data={data} />

  const nodes = useStore.getState().nodes
  const items = mentionables(data, nodes)
  const resolved = resolvePrompt(data.prompt, items, { kind: data.kind, mode: data.mode })
  const running = data.status === 'running'

  return (
    <aside className="insp">
      <div className="insp__head">
        <span className={cx('kind-dot', data.kind === 'image' ? 'kind-dot--image' : 'kind-dot--video')} />
        <input
          className="insp__title"
          value={data.title}
          onChange={(e) => useStore.getState().updateNodeData(selectedId, { title: e.target.value })}
          spellCheck={false}
        />
        <button type="button" className="btn btn--icon" onClick={() => useStore.getState().deselectAll()}>
          <Icon name="close" />
        </button>
      </div>

      <div className="insp__body">
        <Field label="模式">
          {data.kind === 'image' ? (
            <Segmented
              value={(data as ImageNodeData).mode}
              onChange={(v) => useStore.getState().setMode(selectedId, v)}
              options={[
                { value: 't2i', label: '文生图' },
                { value: 'ref', label: '参考生图' },
              ]}
            />
          ) : (
            <Segmented
              value={(data as VideoNodeData).mode}
              onChange={(v) => useStore.getState().setMode(selectedId, v)}
              options={[
                { value: 'text', label: '文生视频' },
                { value: 'keyframe', label: '首尾帧' },
                { value: 'reference', label: '参考' },
              ]}
            />
          )}
        </Field>

        <Field label="提示词" hint={data.kind === 'image' ? '图像模型' : '视频模型'}>
          <div className="prompt-tools">
            <span className="prompt-tools__tip">用 agnes-3.0-flash 把描述改写成更完整的提示词</span>
            <button
              type="button"
              className="mini mini--spark"
              disabled={optimizing || running}
              onClick={async () => {
                const raw = String(data.prompt ?? '').trim()
                if (!raw) {
                  useStore.getState().toast('先写点内容再优化', 'error')
                  return
                }
                setOptimizing(true)
                try {
                  const res = await api.optimizePrompt({
                    prompt: raw,
                    kind: data.kind,
                    mode: String((data as ImageNodeData | VideoNodeData).mode ?? ''),
                    ratio: String((data as ImageNodeData | VideoNodeData).ratio ?? '9:16'),
                    seconds: data.kind === 'video' ? (data as VideoNodeData).seconds : undefined,
                    tokens: items.map((i) => i.name),
                  })
                  useStore.getState().updateNodeData(selectedId, { prompt: res.prompt })
                  useStore.getState().toast('提示词已优化', 'success')
                } catch (e) {
                  useStore.getState().toast(e instanceof Error ? e.message : '优化失败', 'error')
                } finally {
                  setOptimizing(false)
                }
              }}
            >
              {optimizing ? '优化中…' : '✨ 优化提示词'}
            </button>
          </div>
          <PromptEditor
            value={data.prompt}
            onChange={(v) => useStore.getState().updateNodeData(selectedId, { prompt: v })}
            items={items}
            placeholder={
              data.kind === 'image'
                ? '日出时分薄雾峡谷上方的浮空城市，电影级写实，广角构图，柔光……'
                : '镜头缓慢推近，人物从画面左侧走向窗边，光线从侧后方打来……'
            }
          />
        </Field>

        <Field label="被引用的素材" hint={`${items.length} 个`}>
          {items.length === 0 ? (
            <div className="hintbox">
              {data.kind === 'image'
                ? '参考生图模式才需要素材：上传图片，或从左侧连入一张图片节点的输出。'
                : '当前模式不需要额外素材。'}
            </div>
          ) : (
            <div className="media-list">
              {items.map((item) => (
                <div className="media-row" key={item.key}>
                  <AssetThumb asset={item.asset} size={30} />
                  <span className="media-row__dot" style={{ background: mentionColor(item.asset.id).fg }} />
                  <input
                    className="input input--xs media-row__name"
                    value={item.input.label ?? ''}
                    placeholder={item.asset.name}
                    onChange={(e) =>
                      useStore
                        .getState()
                        .setInputLabel(selectedId, item.field, item.index, e.target.value)
                    }
                    title="给这一路素材起个名字，@ 的时候用它"
                  />
                  <span className="tag">{ROLE_LABEL[item.role] ?? item.role}</span>
                  <button
                    type="button"
                    className="mini mini--at"
                    title={`插入 @${item.name}`}
                    style={{
                      color: mentionColor(item.asset.id).fg,
                      borderColor: mentionColor(item.asset.id).line,
                    }}
                    onClick={() =>
                      useStore
                        .getState()
                        .updateNodeData(selectedId, { prompt: `${data.prompt}@${item.name} `.trimStart() })
                    }
                  >
                    @
                  </button>
                  <button
                    type="button"
                    className="mini mini--danger"
                    title="移除这一路素材"
                    onClick={() => useStore.getState().removeMedia(selectedId, item.field, item.index)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>

        <Field label="参数">
          {data.kind === 'image' ? (
            <div className="param-grid">
              <label className="param">
                <span>画幅</span>
                <Segmented
                  size="xs"
                  value={(data as ImageNodeData).ratio}
                  onChange={(v) => useStore.getState().updateNodeData(selectedId, { ratio: v })}
                  options={[
                    { value: '1:1', label: '1:1' },
                    { value: '16:9', label: '16:9' },
                    { value: '9:16', label: '9:16' },
                  ]}
                />
              </label>
              <label className="param">
                <span>清晰度</span>
                <Segmented
                  size="xs"
                  value={(data as ImageNodeData).size}
                  onChange={(v) => useStore.getState().updateNodeData(selectedId, { size: v })}
                  options={[
                    { value: '1K', label: '1K' },
                    { value: '2K', label: '2K' },
                    { value: '3K', label: '3K' },
                    { value: '4K', label: '4K' },
                  ]}
                />
              </label>
            </div>
          ) : (
            <>
              <label className="param param--row">
                <span>画幅</span>
                <Segmented
                  size="xs"
                  value={(data as VideoNodeData).ratio}
                  onChange={(v) => useStore.getState().updateNodeData(selectedId, { ratio: v })}
                  options={[
                    { value: '1:1', label: '1:1' },
                    { value: '16:9', label: '16:9' },
                    { value: '9:16', label: '9:16' },
                  ]}
                />
              </label>
              <div className="param param--row">
                <span>时长</span>
                <input
                  type="range"
                  min={4}
                  max={12}
                  step={1}
                  value={(data as VideoNodeData).seconds}
                  onChange={(e) =>
                    useStore
                      .getState()
                      .updateNodeData(selectedId, { seconds: Number(e.target.value) })
                  }
                />
                <b className="mono">{(data as VideoNodeData).seconds}s</b>
              </div>
              <div className="hintbox">
                视频固定 720P（Flash 限制）。首尾帧模式最多两张图；参考模式 图片≤5、音频≤3、合计≤8。
              </div>
            </>
          )}
        </Field>

        <Field label="最终提交" hint="@ → 位置占位">
          <pre className="resolved">{resolved || '—'}</pre>
          {items.length > 0 && (
            <div className="resolved-map">
              {items.map((it, i) => (
                <span key={it.key}>{mapLabel(it, i, data, items)}</span>
              ))}
            </div>
          )}
        </Field>

        <div className="insp__actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={running}
            onClick={() => useStore.getState().runNode(selectedId)}
          >
            {running ? (
              <>
                <Spinner /> 生成中…
              </>
            ) : (
              <>
                <Icon name="play" /> {data.output ? '重新生成' : '生成'}
              </>
            )}
          </button>
          {data.elapsed ? <div className="insp__elapsed">上次耗时 {(data.elapsed / 1000).toFixed(1)}s</div> : null}
        </div>

        {running && data.kind === 'video' && (
          <>
            <div className="progress progress--block">
              <i style={{ width: `${Math.round((data as VideoNodeData).progress ?? 0)}%` }} />
            </div>
            {(data as VideoNodeData).note && (
              <div className="insp__note">{(data as VideoNodeData).note}</div>
            )}
          </>
        )}

        {data.status === 'error' && data.error && (
          <div className="insp__error">
            <strong>生成失败</strong>
            <span>{data.error}</span>
            {data.kind === 'video' && (data as VideoNodeData).jobId && (
              <button
                type="button"
                className="mini"
                onClick={() => useStore.getState().resumeJob(selectedId)}
                title="复用平台单号继续查，不会重新下单"
              >
                继续查询
              </button>
            )}
          </div>
        )}

        {data.kind === 'video' && data.status === 'pending' && (
          <div className="insp__pending">
            <strong>平台还在生成</strong>
            <span>{(data as VideoNodeData).note || '任务没有丢，可以继续查询'}</span>
            <button
              type="button"
              className="mini"
              onClick={() => useStore.getState().resumeJob(selectedId)}
              title="复用平台单号继续查，不会重新下单"
            >
              继续查询
            </button>
          </div>
        )}

        {(data.versions?.length ?? 0) > 0 && (
          <Field label="版本" hint={`${data.versions!.length} 个 · 点击切换`}>
            <div className="versions">
              {data.versions!.map((v, i) => (
                <div
                  key={v.id}
                  role="button"
                  tabIndex={0}
                  className={cx('version', data.output?.id === v.id && 'is-current')}
                  title={v.name}
                  onClick={() => useStore.getState().restoreVersion(selectedId, v.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') useStore.getState().restoreVersion(selectedId, v.id)
                  }}
                >
                  {v.kind === 'video' && !v.mock && !v.url.endsWith('.svg') ? (
                    <video src={v.url} muted playsInline preload="metadata" />
                  ) : (
                    <img src={v.url} alt={v.name} />
                  )}
                  <span className="version__idx">v{data.versions!.length - i}</span>
                  <button
                    type="button"
                    className="version__x"
                    title="删除这个版本"
                    onClick={(e) => {
                      e.stopPropagation()
                      useStore.getState().deleteVersion(selectedId, v.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </Field>
        )}

        {data.output && (
          <Field label="输出">
            <div className="output">
              {data.output.kind === 'video' && !data.output.mock && !data.output.url.endsWith('.svg') ? (
                <video src={data.output.url} controls loop playsInline />
              ) : (
                <img src={data.output.url} alt={data.output.name} />
              )}
              <div className="output__meta">
                <span className="mono">
                  {data.output.width}×{data.output.height}
                </span>
                {data.output.mock && <span className="tag tag--warn">演示占位</span>}
                <a className="mini" href={data.output.url} target="_blank" rel="noreferrer">
                  打开
                </a>
                <button
                  type="button"
                  className="mini mini--danger"
                  onClick={() => useStore.getState().clearOutput(selectedId)}
                >
                  清空
                </button>
              </div>
            </div>
          </Field>
        )}
      </div>
    </aside>
  )
}

function DirectorInspector({ id, data }: { id: string; data: DirectorNodeData }) {  return (
    <aside className="insp">
      <div className="insp__head">
        <span className="kind-dot kind-dot--director" />
        <input
          className="insp__title"
          value={data.title}
          onChange={(e) => useStore.getState().updateNodeData(id, { title: e.target.value })}
          spellCheck={false}
        />
        <button type="button" className="btn btn--icon" onClick={() => useStore.getState().deselectAll()}>
          <Icon name="close" />
        </button>
      </div>

      <div className="insp__body">
        <Field label="源节点">
          <div className="hintbox">
            导演台只有输出、没有输入。摆好人和机位后渲染成一张参考图，把右侧端口连到图片 / 视频节点即可。
          </div>
        </Field>

        <Field label="画幅" hint={data.ratio}>
          <div className="hintbox">在导演台里切换画幅，参考图的尺寸会一起变。</div>
        </Field>

        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => useStore.getState().openDirector(id)}
        >
          <Icon name="director" /> 打开 3D 导演台
        </button>

        {data.output ? (
          <Field label="参考图">
            <div className="output">
              <img src={data.output.url} alt={data.output.name} />
              <div className="output__meta">
                <span className="mono">
                  {data.output.width}×{data.output.height}
                </span>
                <a className="mini" href={data.output.url} target="_blank" rel="noreferrer">
                  打开
                </a>
                <button
                  type="button"
                  className="mini mini--danger"
                  onClick={() => useStore.getState().clearOutput(id)}
                >
                  清空
                </button>
              </div>
            </div>
          </Field>
        ) : (
          <div className="hintbox">还没有渲染过参考图。</div>
        )}

        <button type="button" className="btn btn--block" onClick={() => useStore.getState().removeNode(id)}>
          <Icon name="trash" /> 删除这个节点
        </button>
      </div>
    </aside>
  )
}

function Empty() {
  const count = useStore((s) => s.nodes.length)
  return (
    <aside className="insp insp--empty">
      <div className="insp__empty">
        <h4>未选中节点</h4>
        <p>在画布上点一下节点，这里会出现提示词、参考素材和参数。</p>
        <ul>
          <li>
            右键空白处 → 添加图片 / 视频节点
          </li>
          <li>
            拖动图片节点右侧的圆点 → 连到下游，成为它的参考图
          </li>
          <li>
            提示词里输入 <kbd>@</kbd> 选择素材，提交时自动替换成真实素材名
          </li>
          <li>图片节点：文生图不接受上游；参考生图才接受</li>
        </ul>
        <div className="insp__stat">
          当前画布 <b>{count}</b> 个节点
        </div>
      </div>
    </aside>
  )
}
