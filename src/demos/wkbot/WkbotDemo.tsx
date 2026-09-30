import { useMemo, useState } from 'react'
import { DiscordChannel, type Author, type Embed, type Message } from '../../components/DiscordMock'
import './wkbot.css'

// The study bot's replies, rebuilt from its own embed layouts (commands/wkstats.js,
// streak.js, leaderboard.js, helpers/dailyRecap.js) and filled with a made-up
// study group. The heatmap and progress bar are line-for-line ports.

const BOT: Author = { name: 'WK Study Bot', color: '#ff9900', bot: true, initials: '蟹' }
const PRIMARY = '#ff9900'
const FOOTER = 'WaniKani Bot'
const MAX_OFFERINGS = 2
const OFFERING_COOLDOWN_DAYS = 7

interface Member {
  name: string
  color: string
  level: number
  seed: number
  streak: number
  longest: number
  offerings: number
}

const MEMBERS: Member[] = [
  { name: 'mochi', color: '#e91e63', level: 4, seed: 3, streak: 12, longest: 12, offerings: 1 },
  { name: 'kaede', color: '#3498db', level: 22, seed: 7, streak: 86, longest: 140, offerings: 2 },
  { name: 'tanuki_dev', color: '#9b59b6', level: 11, seed: 11, streak: 31, longest: 45, offerings: 2 },
  { name: 'hoshi', color: '#1abc9c', level: 17, seed: 19, streak: 5, longest: 63, offerings: 0 },
  { name: 'ramune', color: '#e67e22', level: 8, seed: 23, streak: 0, longest: 19, offerings: 2 },
]

/** Small deterministic RNG so the demo reads the same on every visit. */
function rng(seed: number) {
  let s = seed * 9301 + 49297
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

/** 30 days of review counts for one member, heavier on weekends, with a few gaps. */
function history(m: Member): number[] {
  const r = rng(m.seed)
  const base = 30 + m.level * 4
  return Array.from({ length: 30 }, (_, i) => {
    if (m.name === 'ramune' && i > 26) return 0
    if (r() < 0.08) return 0
    const weekend = i % 7 === 5 || i % 7 === 6 ? 1.4 : 1
    return Math.round(base * weekend * (0.35 + r() * 1.1))
  })
}

// helpers/embeds.js
function bucketEmoji(reviews: number) {
  if (reviews === 0) return '⬛'
  if (reviews < 20) return '🟦'
  if (reviews < 50) return '🟩'
  if (reviews < 100) return '🟨'
  if (reviews < 200) return '🟧'
  return '🟥'
}
function renderMonthlyHeatmap(counts: number[], columns = 6) {
  const cells = counts.map(bucketEmoji)
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns).join(''))
  return rows.join('\n')
}
// commands/wkstats.js
function progressBar(value: number, goal: number, width = 12) {
  const ratio = goal > 0 ? Math.min(1, value / goal) : 0
  const filled = Math.round(ratio * width)
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`
const user = (m: Member): Author => ({ name: m.name, color: m.color })

function wkstats(m: Member): Embed {
  const h = history(m)
  const r = rng(m.seed + 1)
  const total = h.reduce((a, b) => a + b, 0)
  const lessons = Math.round(total / 9)
  const threshold = Math.ceil(0.9 * (m.level < 10 ? 34 : 38))
  const passed = Math.round(threshold * (0.45 + r() * 0.4))
  const srs = {
    apprentice: 60 + Math.round(r() * 80),
    guru: m.level * 25 + Math.round(r() * 40),
    master: m.level * 20,
    enlightened: m.level * 30,
    burned: Math.max(0, (m.level - 6) * 45),
  }
  return {
    color: PRIMARY,
    title: `📊 ${m.name}'s WaniKani Stats`,
    fields: [
      { name: 'Level', value: `**${m.level}**`, inline: true },
      { name: 'Lessons Pending', value: `${Math.round(r() * 25)}`, inline: true },
      { name: 'Reviews Due', value: `**${Math.round(r() * 60)}** now · +${40 + Math.round(r() * 90)} next 24h`, inline: true },
      {
        name: '🔓 Level Progress',
        value: `Kanji at Guru+: ${progressBar(passed, threshold)} **${passed}/${threshold}** (${Math.round((100 * passed) / threshold)}%) — ${threshold - passed} to go`,
      },
      {
        name: '📚 SRS',
        value:
          `🌱 Apprentice **${srs.apprentice}** · 🌿 Guru **${srs.guru}** · 🌳 Master **${srs.master}**\n` +
          `✨ Enlightened **${srs.enlightened}** · 🔥 Burned **${srs.burned}**`,
      },
      {
        name: '📅 30 Day Heatmap',
        value: [
          renderMonthlyHeatmap(h),
          '-# ⬛ 0 · 🟦 1–19 · 🟩 20–49 · 🟨 50–99 · 🟧 100–199 · 🟥 200+',
          `**${total}** reviews · **${lessons}** lessons completed in the last 30 days`,
        ].join('\n'),
      },
    ],
    footer: `${FOOTER} · Today at 8:14 PM`,
  }
}

function streak(m: Member): Embed {
  const tray = '🐢'.repeat(m.offerings) + '👻'.repeat(Math.max(0, MAX_OFFERINGS - m.offerings))
  const lines = [`${tray} **${m.offerings}/${MAX_OFFERINGS}** available`]
  if (m.offerings < MAX_OFFERINGS) lines.push('Next one returns **2026-10-02**')
  lines.push(`-# Miss a day and an offering saves the streak. Each one takes ${OFFERING_COOLDOWN_DAYS} days to come back.`)
  const fields = [
    { name: 'Current', value: days(m.streak), inline: true },
    { name: 'Longest', value: days(m.longest), inline: true },
    { name: 'Last Active', value: m.streak ? '2026-09-28' : '2026-09-25', inline: true },
    { name: 'Offerings', value: lines.join('\n') },
  ]
  if (m.offerings < MAX_OFFERINGS) fields.push({ name: '👻 Saved by an offering', value: '2026-09-25' })
  return { color: PRIMARY, title: '🔥 Your Study Streak', fields, footer: `${FOOTER} · Today at 8:15 PM` }
}

function leaderboard(): Embed {
  const week = MEMBERS.map((m) => {
    const h = history(m).slice(-7)
    const reviews = h.reduce((a, b) => a + b, 0)
    return { m, reviews, lessons: Math.round(reviews / 8) }
  }).sort((a, b) => b.reviews - a.reviews)
  const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`
  const streaks = [...MEMBERS].sort((a, b) => b.longest - a.longest).slice(0, 3)
  const total = week.reduce((a, w) => a + w.reviews, 0)
  return {
    color: PRIMARY,
    title: '🏆 Weekly Leaderboard',
    description: week.map((w, i) => `${medal(i)} **${w.m.name}** — ${w.reviews} reviews · ${w.lessons} lessons`).join('\n'),
    fields: [
      {
        name: '📊 Server This Week',
        value: `✅ **${total}** reviews · ✏️ **${Math.round(total / 8)}** lessons\n🙋 **4/5** members active every day`,
      },
      { name: '🌟 Highlights', value: '🏅 **kaede** set a personal best: 412 reviews on Saturday\n⬆️ **mochi** reached level 4' },
      { name: '🔥 Longest Streaks', value: streaks.map((m, i) => `${medal(i)} **${m.name}** — ${days(m.longest)} (current: ${m.streak})`).join('\n') },
    ],
    footer: 'Past 7 days · WaniKani Bot',
  }
}

function dailyRecap(): Embed {
  const lines = MEMBERS.map((m) => {
    const h = history(m)
    const reviews = h[h.length - 1]
    const lessons = reviews ? Math.round(reviews / 7) : 0
    const head = [`**${m.name}**`, `Lv **${m.level}**`]
    if (m.streak) head.push(`🔥 **${m.streak}** day streak`)
    const done: string[] = []
    if (lessons > 0) done.push(`✏️ **${lessons}** lesson${lessons === 1 ? '' : 's'} completed`)
    if (reviews > 0) done.push(`✅ **${reviews}** review${reviews === 1 ? '' : 's'} cleared`)
    const out = [head.join(' · '), `> ${done.length ? done.join(' · ') : '💤 no activity'}`]
    const due = 20 + ((m.seed * 13) % 70)
    out.push(`> 📥 **${due}** reviews due (24h)`)
    return out.join('\n')
  })
  return {
    color: PRIMARY,
    title: '📅 Daily Recap — Sunday, September 28',
    description: lines.join('\n\n'),
    fields: [
      {
        name: '🌟 Highlights',
        value:
          '🧹 **tanuki_dev** cleared their queue 2×\n✨ **kaede** hit a 86-day streak!\n🐢 **hoshi** spent an offering — 5-day streak held (0 left)',
      },
      {
        name: '📊 Server Totals',
        value: '✏️ **41** lessons completed · ✅ **528** reviews cleared\n🙋 **4/5** members active\n📚 **37** lessons ready · 📥 **214** reviews due (24h)',
      },
    ],
    footer: `${FOOTER} · Posted automatically at midnight (each server's time zone)`,
  }
}

/* ——— Reminders: the LLM-written part ——— */

// Kanji each sample member has learned to Guru or higher (a small illustrative
// subset). The bot sends this list with every request, and the model may only
// write a word in kanji if every character in it is on the list.
const KNOWN: Record<string, string> = {
  mochi: '一二三四五六七八九十人口日月火水木金土上下大小山川田力中本今見出入子女',
  kaede:
    '一二三四五六七八九十人口日月火水木金土上下大小山川田力中本今見出入子女時間合信知待終漢字半分前後左右毎週曜題問答',
}

const REMINDERS: { member: string; level: number; text: string }[] = [
  {
    member: 'mochi',
    level: 4,
    text: '@mochi さん、今日のレビューがまだのこっています。\nねるまえに、すこしだけでもやってみましょう。',
  },
  {
    member: 'kaede',
    level: 22,
    text: '@kaede さん、今日のレビューがまだ終わっていないようです。\n今からでも十分間に合います。毎日つづけていきましょう。',
  },
]

const KANJI = /\p{Script=Han}/gu

function Reminders() {
  return (
    <div>
      <DiscordChannel
        name="study-hall"
        topic="Reminders go out an hour before each member's day ends"
        height="auto"
        messages={REMINDERS.map((r, i) => ({
          id: `r${i}`,
          author: BOT,
          time: i ? 'Today at 10:00 PM' : 'Today at 9:00 PM',
          content: r.text.replace(/@(\w+)/, '**@$1**'),
        }))}
      />
      <div className="wk-check">
        {REMINDERS.map((r) => {
          const used = [...new Set(r.text.match(KANJI) ?? [])]
          const outside = used.filter((k) => !KNOWN[r.member].includes(k))
          return (
            <div key={r.member} className="card">
              <div className="meta-label">
                {r.member} · level {r.level}
              </div>
              <p style={{ margin: '4px 0' }}>
                Kanji used: <span lang="ja">{used.join(' ') || 'none'}</span>
              </p>
              <p className="note" style={{ margin: 0 }}>
                {outside.length === 0
                  ? `✓ ${r.member} has learned every kanji here. Anything else is written in kana.`
                  : `✗ not yet learned: ${outside.join(' ')}`}
              </p>
            </div>
          )
        })}
      </div>
      <p className="note">
        These are sample reminders written to the same rules the bot gives the LLM: a short, polite note in
        Japanese, vocabulary that fits the person’s level, and only kanji they already know. The check above runs
        that kanji rule on the text. If the API is down or slow, the bot sends a plain message instead.
      </p>
    </div>
  )
}

type View = 'wkstats' | 'streak' | 'leaderboard' | 'recap' | 'reminders'

export default function WkbotDemo() {
  const [view, setView] = useState<View>('wkstats')
  const [who, setWho] = useState('mochi')
  const member = MEMBERS.find((m) => m.name === who)!

  const messages = useMemo<Message[]>(() => {
    switch (view) {
      case 'wkstats':
        return [{ id: 1, author: BOT, time: 'Today at 8:14 PM', slash: { user: who, command: '/wkstats' }, embeds: [wkstats(member)] }]
      case 'streak':
        return [{ id: 2, author: BOT, time: 'Today at 8:15 PM', slash: { user: who, command: '/streak' }, embeds: [streak(member)] }]
      case 'leaderboard':
        return [{ id: 3, author: BOT, time: 'Today at 9:00 AM', divider: 'Monday, September 29', embeds: [leaderboard()] }]
      case 'recap':
        return [
          { id: 4, author: BOT, time: 'Today at 12:00 AM', divider: 'Monday, September 29', embeds: [dailyRecap()] },
          { id: 5, author: user(MEMBERS[2]), time: 'Today at 12:03 AM', content: 'queue cleared twice and still only 3rd 😭' },
        ]
      default:
        return []
    }
  }, [view, who, member])

  const perMember = view === 'wkstats' || view === 'streak'
  return (
    <div className="wk">
      <div className="mon-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center', marginBottom: 12 }}>
        <div className="seg">
          {(
            [
              ['wkstats', '/wkstats'],
              ['streak', '/streak'],
              ['leaderboard', 'Leaderboard'],
              ['recap', 'Daily recap'],
              ['reminders', 'LLM reminders'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
        {perMember && (
          <label className="note" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            as
            <select value={who} onChange={(e) => setWho(e.target.value)} className="wk-select">
              {MEMBERS.map((m) => (
                <option key={m.name}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {view === 'reminders' ? <Reminders /> : <DiscordChannel name="study-hall" topic="WaniKani study group" messages={messages} height="auto" />}
    </div>
  )
}
