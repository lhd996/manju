import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  mentionStyle,
  splitMentions,
  type Mentionable,
} from '../lib/prompt'
import { cx } from '../lib/media'

const ROLE_LABEL: Record<string, string> = {
  ref: '参考',
  first: '首帧',
  last: '尾帧',
  image: '参考图',
  audio: '音频',
}

/**
 * 提示词编辑器：
 * - 底层是真实的 textarea（保证中文输入法、选区、撤销都正常）
 * - 文字本身透明，真正显示的是下面一层"镜像"，把 @素材 染色
 * - 输入法组合期间隐藏镜像、让 textarea 正常显色，避免打拼音看不见字
 */
export function PromptEditor({
  value,
  onChange,
  items,
  placeholder,
  rows = 5,
}: {
  value: string
  onChange: (v: string) => void
  items: Mentionable[]
  placeholder?: string
  rows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  const [at, setAt] = useState(-1)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const pendingCaret = useRef<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return items.filter((i) => i.name.toLowerCase().includes(q))
  }, [items, query])

  const segments = useMemo(() => splitMentions(value, items), [value, items])

  // 随内容自动长高，镜像层跟着走
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const h = Math.max(96, Math.min(el.scrollHeight, 560))
    el.style.height = `${h}px`
    if (mirrorRef.current && mirrorRef.current.scrollTop !== el.scrollTop) {
      mirrorRef.current.scrollTop = el.scrollTop
    }
  }, [value, rows, composing])

  // 插入引用后，等新 value 提交到 DOM 再落光标
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || pendingCaret.current == null) return
    const p = pendingCaret.current
    pendingCaret.current = null
    el.focus()
    el.setSelectionRange(p, p)
  }, [value])

  const detect = (el: HTMLTextAreaElement) => {
    if (composing) return
    const pos = el.selectionStart ?? 0
    const before = el.value.slice(0, pos)
    // 允许 @ 紧跟中文（"画面@图片4" 这种很常见），只排除紧贴英文/数字的情况（避免邮箱误触）
    const m = /(^|[^\w])@([^\s@]*)$/.exec(before)
    if (m) {
      setAt(pos - m[2].length - 1)
      setQuery(m[2])
      setActive(0)
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  const insert = (item: Mentionable) => {
    const el = ref.current
    const current = el?.value ?? value
    const pos = el?.selectionStart ?? current.length
    // at 是上一次 detect 记录的 "@" 位置；保险起见夹到合法范围
    const start = at >= 0 && at <= pos ? at : pos
    const before = current.slice(0, start)
    const after = current.slice(pos)
    const token = `@${item.name} `
    const caret = (before + token).length

    // 光标必须等 React 把新 value 提交到 DOM 之后再设，否则会被重置到末尾
    pendingCaret.current = caret
    onChange(before + token + after)
    setOpen(false)
    setAt(-1)
    setQuery('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (!filtered.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insert(filtered[active] ?? filtered[0])
    }
  }

  return (
    <div className={cx('prompt', composing && 'is-composing')}>
      <div className="prompt__fieldwrap">
        <div className="prompt__field">
          <div className="prompt__mirror" ref={mirrorRef} aria-hidden="true">
            {segments.length === 0 ? (
              <span className="prompt__ph">{placeholder}</span>
            ) : (
              segments.map((s, i) =>
                s.item ? (
                  <span key={i} className="mtag" style={mentionStyle(s.item.asset.id)}>
                    {s.text}
                  </span>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )
            )}
            {'\n'}
          </div>

          <textarea
            ref={ref}
            className="prompt__input"
            value={value}
            rows={rows}
            aria-label={placeholder || '提示词'}
            spellCheck={false}
            onChange={(e) => {
              onChange(e.target.value)
              detect(e.currentTarget)
            }}
            onKeyDown={onKeyDown}
            onClick={(e) => detect(e.currentTarget)}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) detect(e.currentTarget)
            }}
            onScroll={(e) => {
              if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop
            }}
            onCompositionStart={() => {
              setComposing(true)
              setOpen(false)
            }}
            onCompositionEnd={(e) => {
              setComposing(false)
              setTimeout(() => detect(e.currentTarget), 0)
            }}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
          />
        </div>

        {open && (
          <div className="mention">
            <div className="mention__head">
              {items.length ? '选择要引用的素材' : '当前节点还没有可引用素材'}
            </div>
            {filtered.slice(0, 8).map((item, i) => (
              <button
                key={item.key}
                type="button"
                className={cx('mention__item', i === active && 'is-active')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => insert(item)}
              >
                <img src={item.asset.url} alt="" />
                <span className="mention__name">{item.name}</span>
                <span className="mention__role">{ROLE_LABEL[item.role] ?? item.role}</span>
              </button>
            ))}
            {items.length > 0 && !filtered.length && <div className="mention__empty">没有匹配的素材</div>}
          </div>
        )}
      </div>

      <div className="prompt__foot">
        <span>
          输入 <kbd>@</kbd> 引用素材，提交时会替换成真实素材名
        </span>
        <span className="prompt__count">{value.length}</span>
      </div>
    </div>
  )
}
