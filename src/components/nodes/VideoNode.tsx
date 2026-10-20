import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useStore } from '../../store'
import type { VideoNodeData } from '../../types'
import { cx, mediaBox, pickFile } from '../../lib/media'
import { mentionables } from '../../lib/prompt'
import { AssetThumb, Segmented, Spinner } from '../ui'
import { PromptText } from '../PromptText'

const fillable = (slot: { asset?: unknown; edgeId?: string }) => !slot.asset && !slot.edgeId

export const VideoNode = memo(function VideoNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as VideoNodeData
  const update = useStore((s) => s.updateNodeData)
  const box = mediaBox(d.ratio)
  const width = Math.max(box.w + 26, 300)
  const running = d.status === 'running'
  const out = d.output
  const isMockVideo = Boolean(out && (out.mock || out.url.endsWith('.svg')))
  const progress = Math.round(d.progress ?? 0)

  const hasInputPort = d.mode !== 'text'

  return (
    <div className={cx('node', 'node--video', selected && 'is-selected', running && 'is-running')} style={{ width }}>
      <Handle
        type="target"
        position={Position.Left}
        className="port port--in"
        isConnectable={hasInputPort}
        style={{
          opacity: hasInputPort ? 1 : 0,
          pointerEvents: hasInputPort ? 'all' : 'none',
          top: 112,
        }}
      />

      <header className="node__head">
        <span className="kind-dot kind-dot--video" />
        <span className="node__title" title={d.title}>
          {d.title}
        </span>
        {running && <Spinner />}
        {d.status === 'error' && <span className="badge badge--err">失败</span>}
        {out && !running && <span className="badge badge--ok">已生成</span>}
        {(d.versions?.length ?? 0) > 1 && <span className="badge">{d.versions!.length} 版</span>}
        <span className="node__id">VID</span>
      </header>

      <div className="node__modes nodrag">
        <Segmented
          value={d.mode}
          onChange={(v) => useStore.getState().setMode(id, v)}
          options={[
            { value: 'text', label: '文生视频', title: '只用提示词' },
            { value: 'keyframe', label: '首尾帧', title: '用第一帧/最后一帧控制' },
            { value: 'reference', label: '参考', title: '图片/音频作为参考' },
          ]}
        />
      </div>

      <div className="node__media" style={{ width: box.w, height: box.h }}>
        {out ? (
          isMockVideo ? (
            <img className="media__img" src={out.url} alt={out.name} draggable={false} />
          ) : (
            <video className="media__img nodrag" src={out.url} controls playsInline loop preload="metadata" />
          )
        ) : (
          <div className="media__empty">
            <span className="media__empty-title">
              {d.mode === 'text' ? '文生视频' : d.mode === 'keyframe' ? '首尾帧生视频' : '参考生视频'}
            </span>
            <span className="media__empty-hint">
              {d.mode === 'text'
                ? '720P · 4–12 秒'
                : d.mode === 'keyframe'
                  ? '最多两张图：首帧 / 尾帧，可一键对换'
                  : '图片 ≤ 5，音频 ≤ 3，最多 8 个参考'}
            </span>
          </div>
        )}
        {running && (
          <div className="media__overlay">
            <Spinner size={20} />
            <span>生成中 {progress > 0 ? `${progress}%` : '…'}</span>
            {d.note && <span className="overlay__note">{d.note}</span>}
            {progress > 0 && (
              <div className="progress">
                <i style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}
        {out?.mock && <span className="media__tag">演示占位</span>}
      </div>

      {d.mode === 'keyframe' && (
        <div className="kf nodrag">
          {d.frames.map((slot, i) => (
            <div className="kf__slot" key={slot.id}>
              <AssetThumb
                size={70}
                asset={slot.asset}
                kind={slot.edgeId && !slot.asset ? 'upstream' : undefined}
                onClick={() => {
                  if (!slot.asset && !slot.edgeId) {
                    pickFile('image/*').then((f) => {
                      if (f) useStore.getState().uploadInto(id, { field: 'frames', index: i }, f)
                    })
                  }
                }}
                onRemove={
                  slot.asset || slot.edgeId
                    ? () => useStore.getState().removeMedia(id, 'frames', i)
                    : undefined
                }
              />
              <span className="kf__label">{i === 0 ? '首帧' : '尾帧'}</span>
            </div>
          ))}
          <div className="kf__swap">
            <button
              type="button"
              className="btn btn--icon"
              title="对换首帧与尾帧"
              onClick={() => useStore.getState().swapFrames(id)}
            >
              ⇄
            </button>
          </div>
        </div>
      )}

      {d.mode === 'reference' && (
        <div className="refs nodrag">
          <div className="refs__row">
            <span className="refs__label">图 {d.refs.length}/5</span>
            {d.refs.map((slot, i) => (
              <AssetThumb
                key={slot.id}
                size={36}
                asset={slot.asset}
                kind={slot.edgeId && !slot.asset ? 'upstream' : undefined}
                onClick={() => {
                  if (!slot.asset && !slot.edgeId) {
                    pickFile('image/*').then((f) => {
                      if (f) useStore.getState().uploadInto(id, { field: 'refs', index: i }, f)
                    })
                  }
                }}
                onRemove={
                  slot.asset || slot.edgeId
                    ? () => useStore.getState().removeMedia(id, 'refs', i)
                    : undefined
                }
              />
            ))}
            {d.refs.length < 5 && (
              <button
                type="button"
                className="thumb thumb--add"
                style={{ width: 36, height: 36 }}
                title="添加参考图"
                onClick={() =>
                  pickFile('image/*').then((f) => {
                    if (f) useStore.getState().uploadInto(id, { field: 'refs' }, f)
                  })
                }
              >
                +
              </button>
            )}
          </div>
          <div className="refs__row">
            <span className="refs__label">音频 {d.audios.length}/3</span>
            {d.audios.map((slot, i) => (
              <span className="chip" key={slot.id} title={slot.asset?.name}>
                ♪ {slot.asset?.name?.slice(0, 6) || '上游'}
                <button
                  type="button"
                  className="chip__x"
                  onClick={() => useStore.getState().removeMedia(id, 'audios', i)}
                >
                  ×
                </button>
              </span>
            ))}
            {d.audios.length < 3 && (
              <button
                type="button"
                className="chip chip--add"
                onClick={() =>
                  pickFile('audio/*').then((f) => {
                    if (f) useStore.getState().uploadInto(id, { field: 'audios' }, f)
                  })
                }
              >
                + 音频
              </button>
            )}
          </div>
        </div>
      )}

      {d.prompt?.trim() && (
        <div className="node__prompt">
          <PromptText text={d.prompt} items={mentionables(d, [])} />
        </div>
      )}

      {d.status === 'error' && d.error && (
        <div className="node__error" title={d.error}>
          {d.error}
        </div>
      )}

      <div className="node__foot nodrag">
        <Segmented
          size="xs"
          value={d.ratio}
          onChange={(v) => update(id, { ratio: v })}
          options={[
            { value: '1:1', label: '1:1' },
            { value: '16:9', label: '16:9' },
            { value: '9:16', label: '9:16' },
          ]}
        />
        <div className="dur">
          <input
            type="range"
            min={4}
            max={12}
            step={1}
            value={d.seconds}
            onChange={(e) => update(id, { seconds: Number(e.target.value) })}
            title="时长（4–12 秒）"
          />
          <span>{d.seconds}s</span>
        </div>
        <button
          type="button"
          className="btn btn--run"
          disabled={running}
          onClick={() => useStore.getState().runNode(id)}
        >
          {running ? '…' : out ? '重跑' : '生成'}
        </button>
      </div>
    </div>
  )
})
