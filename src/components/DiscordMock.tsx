import type { ReactNode } from 'react'
import './discord.css'

export interface EmbedField {
  name: string
  value: string
  inline?: boolean
}

export interface Embed {
  color?: string
  author?: string
  title?: string
  /** Render the title as a link (colour only; demos don't navigate away). */
  titleLink?: boolean
  description?: string
  fields?: EmbedField[]
  footer?: string
  /** A coloured tile standing in for the product image. */
  thumb?: { text: string; color: string }
  buttons?: { label: string; primary?: boolean }[]
}

export interface Author {
  name: string
  color: string
  bot?: boolean
  initials?: string
  nameColor?: string
}

export interface Message {
  id: string | number
  author: Author
  time: string
  content?: string
  /** "used /wkstats" header for slash-command replies. */
  slash?: { user: string; command: string }
  embeds?: Embed[]
  reactions?: string[]
  /** Day divider shown above this message. */
  divider?: string
}

/** Discord's markdown subset: **bold**, *italic*, ~~strike~~, `code`, [text](url) rendered as text. */
export function md(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('~~')) out.push(<s key={k++}>{t.slice(2, -2)}</s>)
    else if (t.startsWith('`')) out.push(<code key={k++}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) out.push(<span key={k++} style={{ color: 'var(--dc-link)' }}>{t.slice(1, t.indexOf(']'))}</span>)
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Line-level markdown: `> ` quotes and `-# ` subtext, then inline markdown. */
export function mdBlock(text: string): ReactNode[] {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('-# ')) return <div key={i} className="dc-sub">{md(line.slice(3))}</div>
    if (line.startsWith('> ')) return <div key={i} className="dc-quote">{md(line.slice(2))}</div>
    return <div key={i}>{line ? md(line) : '\u00a0'}</div>
  })
}

function EmbedView({ e }: { e: Embed }) {
  return (
    <div className="dc-embed" style={{ borderLeftColor: e.color ?? '#1e1f22' }}>
      <div className="dc-embed-main">
        {e.author && <div className="dc-embed-author">{e.author}</div>}
        {e.title && <div className={`dc-embed-title${e.titleLink ? ' link' : ''}`}>{md(e.title)}</div>}
        {e.description && <div className="dc-embed-desc">{mdBlock(e.description)}</div>}
        {e.fields && e.fields.length > 0 && (
          <div className="dc-fields">
            {e.fields.map((f, i) => (
              <div key={i} className={`dc-field${f.inline ? ' inline' : ''}`}>
                <div className="dc-field-name">{md(f.name)}</div>
                <div className="dc-field-value">{mdBlock(f.value)}</div>
              </div>
            ))}
          </div>
        )}
        {e.buttons && (
          <div className="dc-buttons">
            {e.buttons.map((b) => (
              <span key={b.label} className={b.primary ? 'primary' : ''}>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {e.thumb ? (
        <div className="dc-thumb" style={{ background: e.thumb.color }}>
          {e.thumb.text}
        </div>
      ) : (
        <span />
      )}
      {e.footer && <div className="dc-footer">{e.footer}</div>}
    </div>
  )
}

export function DiscordChannel({
  name,
  topic,
  messages,
  height = 560,
}: {
  name: string
  topic?: string
  messages: Message[]
  height?: number | string
}) {
  return (
    <div className="dc">
      <div className="dc-top">
        <span className="hash">#</span>
        <span>{name}</span>
        {topic && <span className="topic">{topic}</span>}
      </div>
      <div className="dc-scroll" style={{ height }}>
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const cont = !m.divider && !m.slash && prev && prev.author.name === m.author.name && prev.time === m.time
          return (
            <div key={m.id}>
              {m.divider && <div className="dc-divider">{m.divider}</div>}
              <div className={`dc-msg${cont ? ' cont' : ''}`}>
                {cont ? (
                  <span />
                ) : (
                  <div className="dc-avatar" style={{ background: m.author.color }} aria-hidden>
                    {m.author.initials ?? m.author.name.slice(0, 1)}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  {m.slash && (
                    <div className="dc-slash">
                      {m.slash.user} used <b>{m.slash.command}</b>
                    </div>
                  )}
                  {!cont && (
                    <div className="dc-head">
                      <span className="dc-name" style={m.author.nameColor ? { color: m.author.nameColor } : undefined}>
                        {m.author.name}
                      </span>
                      {m.author.bot && <span className="dc-bot">APP</span>}
                      <span className="dc-time">{m.time}</span>
                    </div>
                  )}
                  {m.content && <div className="dc-content">{mdBlock(m.content)}</div>}
                  {m.embeds?.map((e, j) => <EmbedView key={j} e={e} />)}
                  {m.reactions && (
                    <div className="dc-reactions">
                      {m.reactions.map((r) => (
                        <span key={r}>{r}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
