import { DiscordChannel, type Message } from '../../components/DiscordMock'
import feed from '../../data/flight-alerts.json'

// The alerts the real engine decided to send for the demo's synthetic fares,
// formatted by its own build_embed (see scripts/gen_flight_fixtures.py).
// Rendered at build time; no JavaScript ships for this.

interface DiscordEmbed {
  title: string
  description?: string | null
  color: number
  fields: { name: string; value: string; inline?: boolean }[]
  footer?: { text: string }
}
type Item = { at: string; embed?: DiscordEmbed; suppressed?: number; watch?: number }

const BOT = { name: 'Flight Monitor', color: '#1a73e8', bot: true, initials: '✈' }

function when(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AlertFeed({ limit = 14 }: { limit?: number }) {
  const items = (feed as Item[]).slice(-limit)
  const messages: Message[] = items.map((f, i) =>
    f.embed
      ? {
          id: i,
          author: BOT,
          time: when(f.at),
          embeds: [
            {
              color: `#${f.embed.color.toString(16).padStart(6, '0')}`,
              title: f.embed.title,
              titleLink: true,
              description: f.embed.description ?? undefined,
              fields: f.embed.fields.filter((x) => x.name !== 'Search'),
              footer: f.embed.footer?.text,
            },
          ],
        }
      : {
          id: i,
          author: { name: 'engine log', color: '#4e5058', initials: '⋯' },
          time: when(f.at),
          content: `-# Held back ${f.suppressed} ordinary drop alert${f.suppressed === 1 ? '' : 's'} for watch #${f.watch}: one already went out in the last 24 hours.`,
        },
  )
  return <DiscordChannel name="flight-alerts" topic="Webhook alerts from the watch engine" messages={messages} height={520} />
}
