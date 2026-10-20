import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useStore } from '../../store'
import { cx } from '../../lib/media'

export function AssetEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const [hoverEdge, setHoverEdge] = useState(false)
  const [hoverChip, setHoverChip] = useState(false)
  const active = hoverEdge || hoverChip || Boolean(selected)

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.34,
  })

  return (
    <g onPointerEnter={() => setHoverEdge(true)} onPointerLeave={() => setHoverEdge(false)}>
      <path className="edge__halo" d={path} />
      {/* 加宽的透明命中区：细线也能点中 */}
      <path className="edge__hit" d={path} />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={cx('edge__line', selected && 'is-selected', active && 'is-active')}
      />
      <EdgeLabelRenderer>
        <div
          className={cx('edge__chip', active && 'is-active')}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onPointerEnter={() => setHoverChip(true)}
          onPointerLeave={() => setHoverChip(false)}
        >
          <span className="edge__dot" />
          {String(data?.label ?? '')}
          {active && (
            <button
              type="button"
              className="edge__cut"
              title="断开这条连接"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                useStore.getState().removeEdge(id)
              }}
            >
              ×
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </g>
  )
}
