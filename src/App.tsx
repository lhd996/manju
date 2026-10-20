import { Suspense, lazy, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Toolbar } from './components/Toolbar'
import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { SettingsDialog } from './components/SettingsDialog'
import { useStore } from './store'
import { cx } from './lib/media'

// 3D 导演台带 three.js，按需加载：不打开就不下载
const DirectorStage = lazy(() =>
  import('./components/DirectorStage').then((m) => ({ default: m.DirectorStage })),
)

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx('toast', t.kind === 'error' && 'toast--error', t.kind === 'success' && 'toast--success')}
          onClick={() => dismiss(t.id)}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const init = useStore((s) => s.init)
  const directorOpen = useStore((s) => s.director.open)

  useEffect(() => {
    init()
  }, [init])

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />
        <div className="workbench">
          <Canvas />
          <Inspector />
        </div>
      </div>
      {directorOpen && (
        <Suspense fallback={<div className="modal" />}>
          <DirectorStage />
        </Suspense>
      )}
      <SettingsDialog />
      <Toasts />
    </ReactFlowProvider>
  )
}
