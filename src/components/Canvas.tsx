import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../store'
import { ImageNode } from './nodes/ImageNode'
import { VideoNode } from './nodes/VideoNode'
import { DirectorNode } from './nodes/DirectorNode'
import { AssetEdge } from './edges/AssetEdge'
import { Icon } from './ui'

const nodeTypes = { image: ImageNode, video: VideoNode, director: DirectorNode }
const edgeTypes = { asset: AssetEdge }

interface MenuState {
  x: number
  y: number
  flow: { x: number; y: number }
  nodeId: string | null
}

export function Canvas() {
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const onNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const isValidConnection = useStore((s) => s.isValidConnection)
  const selectNode = useStore((s) => s.selectNode)
  const addNode = useStore((s) => s.addNode)
  const { screenToFlowPosition } = useReactFlow()

  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = useCallback(
    (event: React.MouseEvent, nodeId: string | null) => {
      event.preventDefault()
      const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const x = Math.min(event.clientX, window.innerWidth - 210)
      const y = Math.min(event.clientY, window.innerHeight - 220)
      setMenu({ x, y, flow, nodeId })
    },
    [screenToFlowPosition],
  )

  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (menuRef.current?.contains(e.target as globalThis.Node)) return
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const addAtCenter = (kind: 'image' | 'video' | 'director') => {
    const state = useStore.getState()
    const selected = state.nodes.find((n) => n.id === state.selectedId)
    if (selected) {
      const w = selected.measured?.width ?? 340
      const id = addNode(kind, { x: selected.position.x + w + 90, y: selected.position.y })
      if (kind === 'director') useStore.getState().openDirector(id)
      return
    }
    const p = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const id = addNode(kind, { x: p.x - 140, y: p.y - 140 })
    if (kind === 'director') useStore.getState().openDirector(id)
  }

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: 'asset',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#8b6cff' },
        }}
        connectionLineStyle={{ stroke: '#8b6cff', strokeWidth: 2, strokeDasharray: '7 5' }}
        fitView
        fitViewOptions={{ padding: 0.35, maxZoom: 1 }}
        minZoom={0.12}
        maxZoom={2}
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
        onSelectionChange={(params) => selectNode(params.nodes[0]?.id ?? null)}
        onPaneClick={() => selectNode(null)}
        onPaneContextMenu={(e) => openMenu(e as unknown as React.MouseEvent, null)}
        onNodeContextMenu={(e, node) => openMenu(e as unknown as React.MouseEvent, node.id)}
        className="flow"
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="#232336" />
        {nodes.length > 0 && (
          <MiniMap
            className="minimap"
            pannable
            zoomable
            maskColor="rgba(6,6,12,0.72)"
            nodeColor={(n) => ((n.data as any)?.kind === 'video' ? '#22d3ee' : '#8b6cff')}
          />
        )}
        <Controls className="controls" showInteractive={false} />

        {nodes.length === 0 && (
          <Panel position="top-center" className="empty-panel">
            <div className="empty">
              <div className="empty__kicker">MANJU CANVAS</div>
              <h2>一张画布，从分镜走到成片</h2>
              <p>
                右键空白处添加节点 · 拖动端口连线 · 在提示词里用 <kbd>@</kbd> 引用素材
              </p>
              <div className="empty__actions">
                <button type="button" className="btn btn--primary" onClick={() => addAtCenter('image')}>
                  <Icon name="image" /> 图片节点
                </button>
                <button type="button" className="btn" onClick={() => addAtCenter('video')}>
                  <Icon name="video" /> 视频节点
                </button>
                <button type="button" className="btn" onClick={() => addAtCenter('director')}>
                  <Icon name="director" /> 导演台节点
                </button>
              </div>
            </div>
          </Panel>
        )}

        <Panel position="top-right" className="canvas__hint">
          右键添加节点 · 滚轮缩放 · 拖拽平移
        </Panel>
      </ReactFlow>

      {menu && (
        <div
          className="menu"
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {menu.nodeId ? (
            <>
              <button
                type="button"
                className="menu__item"
                onClick={() => {
                  useStore.getState().runNode(menu.nodeId!)
                  setMenu(null)
                }}
              >
                <Icon name="play" /> 生成 / 重跑
              </button>
              <button
                type="button"
                className="menu__item"
                onClick={() => {
                  useStore.getState().duplicateNode(menu.nodeId!)
                  setMenu(null)
                }}
              >
                <Icon name="copy" /> 复制节点
              </button>
              <div className="menu__sep" />
              <button
                type="button"
                className="menu__item menu__item--danger"
                onClick={() => {
                  useStore.getState().removeNode(menu.nodeId!)
                  setMenu(null)
                }}
              >
                <Icon name="trash" /> 删除
              </button>
            </>
          ) : (
            <>
              <div className="menu__title">在空白处添加</div>
              <button
                type="button"
                className="menu__item"
                onClick={() => {
                  addNode('image', { x: menu.flow.x - 120, y: menu.flow.y - 40 })
                  setMenu(null)
                }}
              >
                <Icon name="image" /> 图片节点
                <span className="menu__meta">文生图 / 参考</span>
              </button>
              <button
                type="button"
                className="menu__item"
                onClick={() => {
                  addNode('video', { x: menu.flow.x - 120, y: menu.flow.y - 40 })
                  setMenu(null)
                }}
              >
                <Icon name="video" /> 视频节点
                <span className="menu__meta">文生 / 首尾帧 / 参考</span>
              </button>
              <div className="menu__sep" />
              <button
                type="button"
                className="menu__item"
                onClick={() => {
                  const id = addNode('director', { x: menu.flow.x - 120, y: menu.flow.y - 40 })
                  useStore.getState().openDirector(id)
                  setMenu(null)
                }}
              >
                <Icon name="director" /> 导演台节点
                <span className="menu__meta">摆位 → 参考图</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
