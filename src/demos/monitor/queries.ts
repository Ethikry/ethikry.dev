// The questions the demo opens with. Each is a query adapted from the kind of
// reporting I ran on the real bot's database, plus a short note on the answer.

export interface Preset {
  id: string
  label: string
  question: string
  finding: string
  sql: string
}

export const PRESETS: Preset[] = [
  {
    id: 'first',
    label: 'Where new items show up first',
    question: 'When a store adds a product, which of its pages lists it first?',
    finding:
      'The sitemap lists a new product within seconds. The news feed and collection pages can take close to half an hour, so the sitemap is where the bot looks first. SQLite doesn’t have a MEDIAN function, so the query ranks each delay and picks the middle one.',
    sql: `WITH delay AS (
  SELECT s.page,
         s.first_seen_at - CAST(strftime('%s', p.published_at) AS INTEGER) AS seconds
  FROM sightings s
  JOIN products p ON p.id = s.product_id
),
ranked AS (
  SELECT page, seconds,
         ROW_NUMBER() OVER (PARTITION BY page ORDER BY seconds) AS rn,
         COUNT(*)     OVER (PARTITION BY page)                  AS n
  FROM delay
)
SELECT page,
       MAX(n)                                           AS products,
       MAX(CASE WHEN rn = (n + 1) / 2 THEN seconds END) AS median_s,
       MIN(seconds)                                     AS fastest_s,
       MAX(seconds)                                     AS slowest_s
FROM ranked
GROUP BY page
ORDER BY median_s;`,
  },
  {
    id: 'alerts',
    label: 'Alerts per day',
    question: 'What did the bot post, day by day?',
    finding:
      'Every new product gets one announcement. Limited items can also get sold-out and restock alerts later. Each alert goes to several Discord servers at once.',
    sql: `SELECT date(sent_at, 'unixepoch')  AS day,
       SUM(kind = 'new')             AS new_products,
       SUM(kind = 'restock')         AS restocks,
       SUM(kind = 'sold_out')        AS sold_out,
       SUM(servers_notified)         AS server_posts
FROM alert_events
GROUP BY day
ORDER BY day;`,
  },
  {
    id: 'sellout',
    label: 'Fastest sell-outs',
    question: 'Which limited items sold out fastest?',
    finding:
      'Joining the alerts to products and variants shows how long each item stayed in stock. It counts from the moment the product was released, not from when the bot posted about it.',
    sql: `SELECT p.title,
       v.title                                             AS variant,
       ROUND((a.sent_at - CAST(strftime('%s', p.published_at) AS INTEGER)) / 3600.0, 1)
                                                           AS hours_in_stock,
       EXISTS (SELECT 1 FROM alert_events r
               WHERE r.variant_id = v.id AND r.kind = 'restock') AS restocked
FROM alert_events a
JOIN variants v ON v.id = a.variant_id
JOIN products p ON p.id = a.product_id
WHERE a.kind = 'sold_out'
ORDER BY hours_in_stock
LIMIT 12;`,
  },
  {
    id: 'restock',
    label: 'Time to restock',
    question: 'Once something sells out, how long until it comes back?',
    finding:
      'Matching each sell-out with the next restock of the same variant gives the gap between them. Grouped by product type, it gives people a rough idea of how long they might be waiting.',
    sql: `SELECT p.product_type,
       COUNT(*)                                       AS restocks,
       ROUND(AVG(r.sent_at - s.sent_at) / 3600.0, 1)  AS avg_hours_out,
       ROUND(MIN(r.sent_at - s.sent_at) / 3600.0, 1)  AS shortest_hours
FROM alert_events s
JOIN alert_events r
  ON r.variant_id = s.variant_id
 AND r.kind = 'restock'
 AND r.sent_at > s.sent_at
JOIN products p ON p.id = s.product_id
WHERE s.kind = 'sold_out'
GROUP BY p.product_type
ORDER BY avg_hours_out;`,
  },
  {
    id: 'hours',
    label: 'Release times',
    question: 'What time of day do the stores add new products?',
    finding:
      'New products arrive in batches at a handful of set times. Knowing those times tells the communities when to pay attention.',
    sql: `SELECT strftime('%H', published_at) || ':00 UTC' AS hour,
       COUNT(*)                                   AS new_products,
       COUNT(DISTINCT date(published_at))         AS days_with_releases
FROM products
GROUP BY hour
ORDER BY hour;`,
  },
  {
    id: 'schema',
    label: 'Schema',
    question: 'What’s in the demo database?',
    finding:
      'A trimmed-down copy of the bot’s schema: products and their variants, when each page of the store first listed each product, and every alert that went out.',
    sql: `SELECT name, sql
FROM sqlite_master
WHERE type = 'table'
ORDER BY name;`,
  },
]
