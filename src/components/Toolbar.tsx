import { useReactFlow } from '@xyflow/react'
import { useStore } from '../store'
import { cx, pickFile } from '../lib/media'
import { Icon } from './ui'

export function Toolbar() {
  const health = useStore((s) => s.health)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const { fitView, screenToFlowPosition } = useReactFlow()

  const add = (kind: 'image' | 'video' | 'director') => {
    const state = useStore.getState()
    const selected = state.nodes.find((n) => n.id === state.selectedId)
    let id: string
    if (selected) {
      const w = selected.measured?.width ?? 340
      id = state.addNode(kind, { x: selected.position.x + w + 90, y: selected.position.y })
    } else {
      const p = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      id = state.addNode(kind, { x: p.x - 150, y: p.y - 160 })
    }
    if (kind === 'director') state.openDirector(id)
  }

  const exportJson = () => {
    const { nodes, edges } = useStore.getState()
    const blob = new Blob([JSON.stringify({ version: 1, nodes, edges }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `manju-canvas-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const importJson = async () => {
    const file = await pickFile('application/json,.json')
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (!Array.isArray(data?.nodes)) throw new Error('不是有效的画布文件')
      useStore.getState().replaceCanvas(data.nodes, Array.isArray(data.edges) ? data.edges : [])
      useStore.getState().toast(`已导入 ${data.nodes.length} 个节点`, 'success')
      setTimeout(() => fitView({ padding: 0.3, duration: 420 }), 300)
    } catch (e) {
      useStore.getState().toast(e instanceof Error ? e.message : '导入失败', 'error')
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark">漫</span>
        <div className="brand__text">
          <strong>漫剧画布</strong>
          <span>Manju Canvas</span>
        </div>
      </div>

      <div className="topbar__group">
        <button type="button" className="btn" onClick={() => add('image')} title="添加图片节点">
          <Icon name="image" /> 图片
        </button>
        <button type="button" className="btn" onClick={() => add('video')} title="添加视频节点">
          <Icon name="video" /> 视频
        </button>
        <button type="button" className="btn" onClick={() => add('director')} title="添加导演台节点">
          <Icon name="director" /> 导演台
        </button>
        <span className="topbar__divider" />
        <button type="button" className="btn" onClick={() => fitView({ padding: 0.3, duration: 420 })} title="适应画布">
          <Icon name="fit" />
        </button>
        <button type="button" className="btn" onClick={exportJson} title="导出画布 JSON">
          <Icon name="download" />
        </button>
        <button type="button" className="btn" onClick={importJson} title="导入画布 JSON（会覆盖当前画布）">
          <Icon name="upload" />
        </button>
      </div>

      <div className="topbar__right">
        <span className={cx('status', health.mock ? 'status--mock' : 'status--live')} title={health.keyHint}>
          <i />
          {health.mock ? '演示模式' : '已连接 Agnes'}
        </span>
        <button type="button" className="btn btn--ghost" onClick={() => setSettingsOpen(true)} title="设置">
          <Icon name="settings" />
        </button>
      </div>
    </header>
  )
}
