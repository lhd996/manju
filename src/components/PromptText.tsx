import { mentionStyle, splitMentions, type Mentionable } from '../lib/prompt'

/** 只读的提示词渲染：把 @素材 染成对应颜色（节点卡片、预览用） */
export function PromptText({ text, items }: { text: string; items: Mentionable[] }) {
  const segments = splitMentions(text, items)
  return (
    <>
      {segments.map((s, i) =>
        s.item ? (
          <span key={i} className="mtag" style={mentionStyle(s.item.asset.id)}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}
