import { useEffect, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { Icon } from './ui'

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen)
  const health = useStore((s) => s.health)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const toast = useStore((s) => s.toast)
  const [key, setKey] = useState('')
  const [base, setBase] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setKey('')
      setBase(health.publicBaseUrl || '')
    }
  }, [open, health.publicBaseUrl])

  if (!open) return null

  const save = async () => {
    setSaving(true)
    try {
      await api.saveConfig({ apiKey: key.trim() || undefined, publicBaseUrl: base.trim() })
      const h = await api.health()
      useStore.setState({ health: { ...h } })
      toast(key.trim() ? 'API Key 已保存，后续调用将走真实模型' : '设置已更新', 'success')
      setOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal__card modal__card--sm">
        <header className="modal__head">
          <h3>设置</h3>
          <button type="button" className="btn btn--icon" onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
        </header>

        <div className="modal__body">
          <label className="field">
            <span className="field__label">Agnes API Key</span>
            <input
              className="input"
              type="password"
              value={key}
              placeholder={health.hasKey ? `已配置 ${health.keyHint}（留空则不修改）` : 'sk-...'}
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
            />
            <span className="field__hint">
              只保存在本机服务端 <code>data/config.json</code>，不会进入浏览器请求，也不会写进画布文件。
            </span>
          </label>

          <label className="field">
            <span className="field__label">公网访问地址（可选）</span>
            <input
              className="input"
              value={base}
              placeholder="https://xxxx.trycloudflare.com"
              onChange={(e) => setBase(e.target.value)}
              spellCheck={false}
            />
            <span className="field__hint">
              一般不用填：本地素材会自动内联成 data URI 发给视频接口（单张 ≤ 8MB）。只有超过 8MB 的图片才需要这里配一个公网地址（如
              Cloudflare Tunnel / R2）。
            </span>
          </label>

          <div className="notice">
            <strong>当前状态：</strong>
            {health.mock ? '未配置 Key，全部走演示占位素材。' : `已连接（${health.keyHint}），调用会计入你的 Agnes 额度。`}
            <br />
            免费账户限 <code>20 RPM</code>，服务端已按 18 RPM 排队。
            <br />
            网络出口：
            {health.proxy ? (
              <>
                经代理 <code>{health.proxy}</code>
              </>
            ) : (
              <>
                直连（默认；需要走代理时，启动前设 <code>CANVAS_PROXY=http://127.0.0.1:7897</code>）
              </>
            )}
          </div>
        </div>

        <footer className="modal__foot">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            取消
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  )
}
