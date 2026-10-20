import React from 'react'
import type { Asset } from '../types'
import { cx } from '../lib/media'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T
  options: Array<{ value: T; label: string; title?: string }>
  onChange: (v: T) => void
  size?: 'sm' | 'xs'
}) {
  return (
    <div className={cx('seg', size === 'xs' && 'seg--xs')} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          className={cx('seg__btn', value === o.value && 'is-on')}
          onClick={(e) => {
            e.stopPropagation()
            onChange(o.value)
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ size = 12 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} />
}

export function AssetThumb({
  asset,
  size = 44,
  onRemove,
  onClick,
  kind,
}: {
  asset?: Asset
  size?: number
  onRemove?: () => void
  onClick?: () => void
  kind?: string
}) {
  const isVideo = asset?.kind === 'video' && !asset.mock && !asset.url.endsWith('.svg')
  return (
    <div className={cx('thumb', !asset && 'thumb--empty')} style={{ width: size, height: size }} onClick={onClick}>
      {asset ? (
        isVideo ? (
          <video src={asset.url} muted playsInline preload="metadata" />
        ) : (
          <img src={asset.url} alt={asset.name} draggable={false} />
        )
      ) : (
        <span className="thumb__plus">+</span>
      )}
      {asset?.kind === 'audio' && <span className="thumb__kind">♪</span>}
      {kind === 'upstream' && !asset && <span className="thumb__kind">↖</span>}
      {onRemove && asset && (
        <button
          type="button"
          className="thumb__x"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="移除"
        >
          ×
        </button>
      )}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    image: 'M4 5h16v14H4z M4 15l4.5-4.5 3 3L15 10l5 5',
    video: 'M4 6h11v12H4z M15 10l5-3v10l-5-3',
    director: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
    fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
    plus: 'M12 5v14 M5 12h14',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L14.5 3h-4l-.4 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4L6 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.4 2.6h4l.4-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5a7 7 0 00.1-1z',
    download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
    upload: 'M12 20V9 M7 14l5-5 5 5 M5 4h14',
    play: 'M8 5l11 7-11 7z',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
    copy: 'M9 9h11v11H9z M4 15V4h11',
    swap: 'M7 8h10l-3-3 M17 16H7l3 3',
    close: 'M6 6l12 12 M18 6L6 18',
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] || ''} />
    </svg>
  )
}
