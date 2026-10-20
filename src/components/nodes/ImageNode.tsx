import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useStore } from '../../store'
import type { ImageNodeData } from '../../types'
import { cx, mediaBox, pickFile } from '../../lib/media'
import { mentionables } from '../../lib/prompt'
import { AssetThumb, Segmented, Spinner } from '../ui'
import { PromptText } from '../PromptText'

export const ImageNode = memo(function ImageNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ImageNodeData
  const update = useStore((s) => s.updateNodeData)
  const box = mediaBox(d.ratio)
  const width = Math.max(box.w + 26, 286)
  const running = d.status === 'running'
  const hasOutput = Boolean(d.output)

  const uploadSlot = (index: number) => {
    pickFile('image/*').then((file) => {
      if (file) useStore.getState().uploadInto(id, { field: 'slots', index }, file)
    })
  }

  return (
    <div className={cx('node', 'node--image', selected && 'is-selected', running && 'is-running')} style={{ width }}>
      <Handle
        type="target"
        position={Position.Left}
        className="port port--in"
        isConnectable={d.mode === 'ref'}
        style={{ opacity: d.mode === 'ref' ? 1 : 0, pointerEvents: d.mode === 'ref' ? 'all' : 'none' }}
      />

      <header className="node__head">
        <span className="kind-dot kind-dot--image" />
        <span className="node__title" title={d.title}>
          {d.title}
        </span>
        {running && <Spinner />}
        {d.status === 'error' && <span className="badge badge--err">失败</span>}
        {hasOutput && !running && <span className="badge badge--ok">已生成</span>}
        {(d.versions?.length ?? 0) > 1 && <span className="badge">{d.versions!.length} 版</span>}
        <span className="node__id">IMG</span>
      </header>

      <div className="node__modes nodrag">
        <Segmented
          value={d.mode}
          onChange={(v) => useStore.getState().setMode(id, v)}
          options={[
            { value: 't2i', label: '文生图', title: '仅用提示词生成，不接受上游图片' },
            { value: 'ref', label: '参考生图', title: '用上传或上游的图片做参考' },
          ]}
        />
      </div>

      <div className="node__media" style={{ width: box.w, height: box.h }}>
        {hasOutput ? (
          <img className="media__img" src={d.output!.url} alt={d.output!.name} draggable={false} />
        ) : (
          <div className="media__empty">
            <span className="media__empty-title">{d.mode === 't2i' ? '文生图' : '参考生图'}</span>
            <span className="media__empty-hint">
              {d.mode === 't2i' ? '在右侧写提示词，或把这张图接到下游当参考' : '上传参考图，或从左侧连入图片节点'}
            </span>
          </div>
        )}
        {running && (
          <div className="media__overlay">
            <Spinner size={20} />
            <span>生成中…</span>
          </div>
        )}
        {d.output?.mock && <span className="media__tag">演示占位</span>}
      </div>

      {d.mode === 'ref' && (
        <div className="slots nodrag">
          {d.slots.map((slot, i) => (
            <div className="slots__item" key={slot.id}>
              <AssetThumb
                asset={slot.asset}
                kind={slot.edgeId && !slot.asset ? 'upstream' : undefined}
                onClick={() => {
                  if (!slot.asset && !slot.edgeId) uploadSlot(i)
                }}
                onRemove={
                  slot.asset || slot.edgeId
                    ? () => useStore.getState().removeMedia(id, 'slots', i)
                    : undefined
                }
              />
              <span className="slots__idx">{i + 1}</span>
            </div>
          ))}
          <span className="slots__hint">参考 {d.slots.filter((s) => s.asset || s.edgeId).length}</span>
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
        <select
          className="select select--xs"
          value={d.size}
          onChange={(e) => update(id, { size: e.target.value })}
          title="清晰度档位"
        >
          {['1K', '2K', '3K', '4K'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn--run"
          disabled={running}
          onClick={() => useStore.getState().runNode(id)}
        >
          {running ? '…' : hasOutput ? '重跑' : '生成'}
        </button>
      </div>

      <Handle type="source" position={Position.Right} className="port port--out" />
    </div>
  )
})
