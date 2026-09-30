import { useEffect, useMemo, useRef, useState } from 'react'
import initSqlJs, { type Database, type QueryExecResult } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import { DiscordChannel, type Message } from '../../components/DiscordMock'
import { PRESETS } from './queries'
import './monitor.css'

const DB_URL = '/projects/product-monitor/monitor-demo.sqlite.gz'

async function openDb(): Promise<Database> {
  const [SQL, res] = await Promise.all([initSqlJs({ locateFile: () => wasmUrl }), fetch(DB_URL)])
  if (!res.ok) throw new Error(`Couldn't download the demo database (${res.status}).`)
  let bytes = new Uint8Array(await res.arrayBuffer())
  // Some servers label a .gz with Content-Encoding and the browser inflates it
  // already; only inflate here if the gzip magic number is still there.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    bytes = new Uint8Array(await new Response(inflated).arrayBuffer())
  }
  return new SQL.Database(bytes)
}

type Tab = 'feed' | 'sql'

export default function MonitorDemo() {
  const [db, setDb] = useState<Database | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('feed')

  useEffect(() => {
    let live = true
    openDb().then(
      (d) => live && (setDb(d), setErr(null)),
      (e) => live && setErr(String(e?.message ?? e)),
    )
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="mon">
      <div className="mon-bar">
        <div className="seg" role="tablist">
          <button className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')} role="tab" aria-selected={tab === 'feed'}>
            Alert feed
          </button>
          <button className={tab === 'sql' ? 'on' : ''} onClick={() => setTab('sql')} role="tab" aria-selected={tab === 'sql'}>
            Query the data (SQL)
          </button>
        </div>
        <span className="note">Two weeks of made-up data from two made-up stores, with real SQLite running in your browser</span>
      </div>
      {err && <p className="mon-err">{err}</p>}
      {!db && !err && <p className="note mon-loading">Loading the demo database…</p>}
      {db && tab === 'feed' && <Feed db={db} />}
      {db && tab === 'sql' && <Analytics db={db} />}
    </div>
  )
}

/* ——— Alert feed ——— */

const STORE_NAMES: Record<string, string> = { northwind: 'Northwind Merch', harbor: 'Harbor Goods' }
const STORE_COLORS: Record<string, string> = { northwind: '#3b6e8f', harbor: '#8f5a3b' }
const KIND_STYLE = {
  new: { color: '#57f287', label: '🆕 New product' },
  restock: { color: '#fee75c', label: '🔁 Back in stock' },
  sold_out: { color: '#ed4245', label: '⛔ Sold out' },
} as const

const BOT = { name: 'Stock Watch', color: '#5865f2', bot: true, initials: 'SW' }

function rows(db: Database, sql: string, params: (string | number)[] = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const out: Record<string, any>[] = []
  while (stmt.step()) out.push(stmt.getAsObject())
  stmt.free()
  return out
}

function fmtTime(sec: number) {
  const d = new Date(sec * 1000)
  return d.toLocaleString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }) + ' UTC'
}
function fmtDay(sec: number) {
  return new Date(sec * 1000).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })
}

function Feed({ db }: { db: Database }) {
  const [kind, setKind] = useState<'all' | 'new' | 'restock' | 'sold_out'>('all')
  const [store, setStore] = useState<'all' | 'northwind' | 'harbor'>('all')

  const messages = useMemo<Message[]>(() => {
    const alerts = rows(
      db,
      `SELECT a.id, a.kind, a.sent_at, a.servers_notified, p.id AS pid, p.store, p.title, p.product_type,
              p.is_preorder, p.has_digital_variants, v.title AS variant,
              (SELECT MIN(price) FROM variants WHERE product_id = p.id) AS price,
              (SELECT group_concat(title || CASE WHEN available THEN '' ELSE ' (sold out)' END, ' · ')
                 FROM variants WHERE product_id = p.id) AS variants,
              (SELECT MIN(o.first_seen_at) - CAST(strftime('%s', p.published_at) AS INTEGER)
                 FROM sightings o WHERE o.product_id = p.id) AS detect_s,
              (SELECT page FROM sightings o WHERE o.product_id = p.id ORDER BY first_seen_at LIMIT 1) AS via
       FROM alert_events a
       JOIN products p ON p.id = a.product_id
       LEFT JOIN variants v ON v.id = a.variant_id
       WHERE (?1 = 'all' OR a.kind = ?1) AND (?2 = 'all' OR p.store = ?2)
       ORDER BY a.sent_at DESC
       LIMIT 40`,
      [kind, store],
    ).reverse()
    let lastDay = ''
    return alerts.map((a) => {
      const k = KIND_STYLE[a.kind as keyof typeof KIND_STYLE]
      const day = fmtDay(a.sent_at)
      const divider = day !== lastDay ? day : undefined
      lastDay = day
      const line = String(a.title).split(' — ')[0]
      const fields =
        a.kind === 'new'
          ? [
              { name: 'Price', value: `$${Number(a.price).toFixed(2)}`, inline: true },
              { name: 'Type', value: String(a.product_type), inline: true },
              { name: 'Detected', value: `${a.detect_s}s after release`, inline: true },
              { name: 'Variants', value: String(a.variants) },
            ]
          : [
              { name: 'Variant', value: String(a.variant), inline: true },
              { name: 'Store', value: STORE_NAMES[a.store], inline: true },
            ]
      return {
        id: a.id,
        author: BOT,
        time: fmtTime(a.sent_at),
        divider,
        embeds: [
          {
            color: k.color,
            author: `${k.label} · ${STORE_NAMES[a.store]}`,
            title: String(a.title),
            titleLink: true,
            fields,
            thumb: { text: line, color: STORE_COLORS[a.store] },
            footer:
              a.kind === 'new'
                ? `First seen via ${a.via} · sent to ${a.servers_notified} servers${a.is_preorder ? ' · pre-order' : ''}`
                : a.kind === 'restock'
                  ? `Sent to ${a.servers_notified} servers · react 🔔 to be pinged next time`
                  : 'Logged; no ping for sell-outs',
            buttons: a.kind === 'sold_out' ? undefined : [{ label: 'View product', primary: true }, { label: '🔔 Notify me' }],
          },
        ],
        reactions: a.kind === 'new' ? ['🔔 ' + (2 + (a.id % 9))] : undefined,
      }
    })
  }, [db, kind, store])

  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current?.querySelector('.dc-scroll')
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div>
      <div className="mon-filters">
        <div className="seg">
          {(['all', 'new', 'restock', 'sold_out'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'sold_out' ? 'Sold out' : k === 'new' ? 'New' : 'Restock'}
            </button>
          ))}
        </div>
        <div className="seg">
          {(['all', 'northwind', 'harbor'] as const).map((s) => (
            <button key={s} className={store === s ? 'on' : ''} onClick={() => setStore(s)}>
              {s === 'all' ? 'Both stores' : STORE_NAMES[s]}
            </button>
          ))}
        </div>
      </div>
      <div ref={scroller}>
        <DiscordChannel name="stock-alerts" topic="New products and restocks, posted automatically" messages={messages} height={560} />
      </div>
      <p className="note">
        This feed comes straight from a SQL query: the latest 40 rows of <code>alert_events</code>, joined to{' '}
        <code>products</code>, <code>variants</code> and <code>sightings</code>, and drawn to look like the bot’s posts.
      </p>
    </div>
  )
}

/* ——— SQL analytics ——— */

function Analytics({ db }: { db: Database }) {
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const preset = PRESETS.find((p) => p.id === presetId)
  const [sql, setSql] = useState(PRESETS[0].sql)
  const [result, setResult] = useState<QueryExecResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ms, setMs] = useState(0)

  const run = (text: string) => {
    const t0 = performance.now()
    try {
      const res = db.exec(text)
      setResult(res[res.length - 1] ?? { columns: [], values: [] })
      setError(null)
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setResult(null)
    }
    setMs(performance.now() - t0)
  }

  useEffect(() => run(sql), []) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!
    setPresetId(id)
    setSql(p.sql)
    run(p.sql)
  }

  return (
    <div className="mon-sql">
      <div className="mon-presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={`btn${presetId === p.id ? ' on' : ''}`} onClick={() => choose(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset && (
        <div className="mon-question">
          <strong>{preset.question}</strong>
          <p>{preset.finding}</p>
        </div>
      )}
      <div className="mon-editor">
        <textarea
          value={sql}
          spellCheck={false}
          aria-label="SQL query"
          onChange={(e) => {
            setSql(e.target.value)
            setPresetId('')
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(sql)
          }}
          rows={Math.min(18, Math.max(6, sql.split('\n').length + 1))}
        />
        <div className="mon-run">
          <button className="btn" onClick={() => run(sql)}>
            Run ▸
          </button>
          <span className="note">⌘/Ctrl + Enter to run. You can edit it freely. Changes only affect your copy.</span>
        </div>
      </div>
      {error && <p className="mon-err">SQL error: {error}</p>}
      {result && (
        <>
          <p className="note" style={{ margin: '8px 0 4px' }}>
            {result.values.length} row{result.values.length === 1 ? '' : 's'} · {ms.toFixed(1)} ms
          </p>
          <BarChart result={result} />
          <ResultTable result={result} />
        </>
      )}
    </div>
  )
}

function ResultTable({ result }: { result: QueryExecResult }) {
  if (!result.columns.length) return <p className="note">No rows.</p>
  return (
    <div className="mon-table-wrap">
      <table className="mon-table">
        <thead>
          <tr>
            {result.columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.values.slice(0, 200).map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j} className={typeof v === 'number' ? 'num' : v && String(v).includes('\n') ? 'pre' : ''}>
                  {v === null ? <span className="note">null</span> : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A bar chart of the first numeric column against the first text column, when the shape allows. */
function BarChart({ result }: { result: QueryExecResult }) {
  const { columns, values } = result
  if (values.length < 2 || values.length > 40) return null
  const labelIdx = columns.findIndex((_, i) => typeof values[0][i] === 'string')
  // Prefer a rate or median column over a raw count when there is one.
  const numeric = columns.map((c, i) => ({ c, i })).filter(({ i }) => values.every((r) => typeof r[i] === 'number' || r[i] === null))
  if (labelIdx < 0 || !numeric.length) return null
  const pick = numeric.find(({ c }) => /pct|median|hours/.test(c)) ?? numeric[0]
  const max = Math.max(...values.map((r) => Number(r[pick.i] ?? 0)), 1e-9)
  return (
    <figure className="mon-chart" aria-label={`${pick.c} by ${columns[labelIdx]}`}>
      <figcaption className="meta-label">
        {pick.c} by {columns[labelIdx]}
      </figcaption>
      {values.map((r, i) => {
        const v = Number(r[pick.i] ?? 0)
        return (
          <div className="mon-bar-row" key={i}>
            <span className="lbl" title={String(r[labelIdx])}>
              {String(r[labelIdx])}
            </span>
            <span className="track">
              <span className="fill" style={{ width: `${(100 * v) / max}%` }} />
            </span>
            <span className="val">{v.toLocaleString()}</span>
          </div>
        )
      })}
    </figure>
  )
}
