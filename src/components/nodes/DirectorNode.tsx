import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useStore } from '../../store'
import type { DirectorNodeData } from '../../types'
import { cx, mediaBox } from '../../lib/media'
import { Icon } from '../ui'

export const DirectorNode = memo(function DirectorNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as DirectorNodeData
  const box = mediaBox(d.ratio)
  const width = Math.max(box.w + 26, 286)
  const out = d.output
  const open = () => useStore.getState().openDirector(id)

  return (
    <div
      className={cx('node', 'node--director', selected && 'is-selected')}
      style={{ width }}
      onDoubleClick={open}
    >
      <header className="node__head">
        <span className="kind-dot kind-dot--director" />
        <span className="node__title" title={d.title}>
          {d.title}
        </span>
        {out && <span className="badge badge--ok">有参考图</span>}
        <span className="node__id">DIR</span>
      </header>

      <div className="node__media" style={{ width: box.w, height: box.h }} title="双击编辑">
        {out ? (
          <img className="media__img" src={out.url} alt={out.name} draggable={false} />
        ) : (
          <div className="media__empty">
            <span className="media__empty-title">3D 导演台</span>
            <span className="media__empty-hint">摆好人和机位，渲染成一张参考图给下游用</span>
          </div>
        )}
        <button
          type="button"
          className="director-open nodrag"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
        >
          <Icon name="director" size={12} /> {out ? '重新摆位' : '打开导演台'}
        </button>
      </div>

      <div className="node__foot nodrag">
        <span className="pill">{d.ratio}</span>
        <span className="node__hint">{d.actors?.length ?? 0} 个角色</span>
        <button type="button" className="btn btn--run" onClick={open}>
          编辑
        </button>
      </div>

      {/* 只有输出，没有输入 */}
      <Handle type="source" position={Position.Right} className="port port--out" />
    </div>
  )
})
