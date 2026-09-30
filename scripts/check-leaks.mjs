/**
 * Refuses a build that says something it shouldn't. Runs after `astro build`
 * and before every deploy (see package.json).
 *
 * - The product monitor's pages stay generic, like the resume: no store names
 *   or shop domains, and none of the internal vocabulary from its private repo.
 * - The only email address anywhere is the public contact one, and no phone
 *   number appears.
 * - No credential-shaped strings: Discord webhooks or bot tokens, API keys.
 *
 * Scans every text file under dist/. Exits non-zero with a list of hits.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
const TEXT = /\.(html|js|css|json|txt|xml|svg|mjs)$/i

// Rules for every file.
const GLOBAL = [
  [/discord(?:app)?\.com\/api\/webhooks\/\d+/i, 'Discord webhook URL'],
  [/\b[MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}\b/, 'Discord bot token'],
  [/\bsk-ant-[\w-]{20,}/, 'Anthropic API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/, 'phone number'],
]

// Extra rules for the product monitor's pages and data.
const MONITOR = [
  [/leak(?!age)/i, '"leak"'],
  [/proxy|proxies/i, '"proxy"'],
  [/\bprobe/i, '"probe"'],
  [/checkout/i, '"checkout"'],
  // Keep the write-up about what the bot does for people, not how it copes
  // with the stores' limits.
  [/rate[ -]?limit|throttl|\bblock(?:ed|ing|s)?\b|\b(?:403|429)\b|hammer|circumvent|evad/i, 'limits / blocking wording'],
]

// The study bot is described without naming the chat platform or the model.
// Checked against the page's visible text, since the Discord look-alike demo
// component legitimately carries the name in its code.
const STUDY_TEXT = [
  [/discord/i, '"Discord"'],
  [/claude|anthropic/i, 'model name (say "an LLM")'],
]
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

// Names that must stay off the site can't be listed in a public repo without
// publishing them, so they live in a git-ignored file beside this one. A
// checkout without it still runs the generic checks; a deploy
// (REQUIRE_PRIVATE_TERMS=1, see package.json) refuses to go ahead without it.
const PRIVATE = fileURLToPath(new URL('./leak-terms.private.json', import.meta.url))
if (existsSync(PRIVATE)) {
  const terms = JSON.parse(readFileSync(PRIVATE, 'utf8'))
  const rx = ([src, what]) => [new RegExp(src, 'i'), what]
  GLOBAL.push(...(terms.everywhere ?? []).map(rx))
  MONITOR.unshift(...(terms.monitor ?? []).map(rx))
} else if (process.env.REQUIRE_PRIVATE_TERMS) {
  console.error(`✗ ${PRIVATE} is missing; refusing to deploy without the private checks`)
  process.exit(1)
} else {
  console.warn('! private leak terms not found; running the generic checks only')
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

// Which built files belong to the monitor page: the page itself plus the
// island chunks it loads (named after their source module).
const isMonitor = (rel) => rel.startsWith('projects/product-monitor/') || /MonitorDemo|queries/.test(rel)

const hits = []
for (const file of walk(DIST)) {
  const rel = relative(DIST, file)
  // The monitor demo's database ships gzipped; read what's inside it too.
  const gz = rel.endsWith('.gz')
  if (!gz && !TEXT.test(rel)) continue
  const text = gz ? gunzipSync(readFileSync(file)).toString('latin1') : readFileSync(file, 'utf8')
  // Wording rules read a page's visible text, so CSS like `display:block`
  // doesn't count; code and data files are read whole.
  const words = rel.endsWith('.html') ? visibleText(text) : text
  const checks = GLOBAL.map(([re, what]) => [re, what, text])
  if (isMonitor(rel)) checks.push(...MONITOR.map(([re, what]) => [re, what, re === MONITOR.at(-1)[0] ? words : text]))
  if (rel === 'projects/study-bot/index.html') checks.push(...STUDY_TEXT.map(([re, what]) => [re, what, words]))
  if (/^_astro\/WkbotDemo/.test(rel)) checks.push([STUDY_TEXT[1][0], STUDY_TEXT[1][1], text])
  for (const [re, what, text] of checks) {
    const m = text.match(re)
    if (m) {
      const at = Math.max(0, m.index - 40)
      hits.push(`${rel}: ${what} — …${text.slice(at, m.index + m[0].length + 40).replace(/\s+/g, ' ')}…`)
    }
  }
}

if (hits.length) {
  console.error(`✗ leak check failed (${hits.length}):\n  ${hits.join('\n  ')}`)
  process.exit(1)
}
console.log('✓ leak check passed')
