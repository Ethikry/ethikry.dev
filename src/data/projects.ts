// One entry per project. The home page, /projects/ and each case study's
// header all read from here, so a number only changes in one place. Figures
// match the resume.

export interface Project {
  slug: string
  title: string
  /** A sentence or two for the home page cards. */
  blurb: string
  /** The one-line intro under the title on /projects/ and the case study. */
  summary: string
  stack: string[]
  dates: string
  role: string
  /** Where the demo lives. song-rank's is the real site, on its own Worker. */
  demo: string
  /** Case-study page; song-rank has none (its README and site cover it). */
  caseStudy?: string
  repo?: string
  /** Shown instead of a repo link when the code is private. */
  privateNote?: string
  /** Bullets for /projects/. */
  points: string[]
}

export const PROJECTS: Project[] = [
  {
    slug: 'song-rank',
    title: 'Song Rank',
    blurb:
      'Every year my friends and I rank each other’s favorite songs. I built a stats site from four years of our spreadsheets to help visualize our tastes, rivalries, and favorites.',
    summary:
      'An analytics site for a yearly song-ranking party: leaderboards, awards, taste comparisons, and a slideshow for the reveal.',
    stack: ['TypeScript', 'React', 'Vite', 'SVG', 'Cloudflare'],
    dates: 'Jul 2026',
    role: 'Solo project',
    demo: '/projects/song-rank/',
    repo: 'https://github.com/Ethikry/song-rank',
    points: [
      'Reads each year’s score sheet (about 380 songs over four years, and thousands of scores) and works out every stat in the browser.',
      'Uses correlation to show whose taste lines up with whose, then breaks that down to the artists behind it.',
      'Recounts the votes a few different ways (Borda count, median, trimmed mean) to see how much the method changes the winner.',
      'Before every release, it compares its numbers with the group’s own spreadsheet analysis, and all 1,205 comparisons match.',
      'The public version swaps out everyone’s names but keeps the real scores.',
    ],
  },
  {
    slug: 'product-monitor',
    title: 'Product Monitor',
    blurb:
      'Keeps a few Discord communities posted on new and restocked items from two online stores within about 20 seconds of them going up.',
    summary:
      'A 24/7 bot that posts new products, restocks and sell-outs from two online stores to several Discord servers, backed by a SQLite database I designed.',
    stack: ['Python', 'SQLite', 'SQL', 'AWS S3', 'Discord API', 'Linux'],
    dates: 'Jun 2025 – now',
    role: 'Solo project',
    demo: '/projects/product-monitor/#demo',
    caseStudy: '/projects/product-monitor/',
    privateNote: 'Code is private. Happy to walk through it.',
    points: [
      'Each server chooses where alerts go and which product lines it follows, and members can opt in to a ping for the lines they care about.',
      'I moved its data out of JSON files and into a SQLite database with about 20 related tables. Before switching over, the migration compared record counts for every table.',
      'It backs up to AWS S3 during the day. Once a month it restores the newest backup and makes sure it opens cleanly.',
      'It records when each product first appears on each page of the store. I used SQL on that history to decide which pages the bot should check first.',
      'Around 970 automated tests.',
    ],
  },
  {
    slug: 'study-bot',
    title: 'Language Study Bot',
    blurb:
      'A bot for my Japanese study group. It tracks everyone’s progress, posts a daily recap, and uses an LLM to write reminders at each person’s level.',
    summary:
      'A bot that keeps our Japanese study group on track with stats, streaks, daily recaps, and LLM-written reminders.',
    stack: ['Node.js', 'SQLite', 'LLM API'],
    dates: 'Dec 2025 – now',
    role: 'Built with a second developer',
    demo: '/projects/study-bot/#demo',
    caseStudy: '/projects/study-bot/',
    repo: 'https://github.com/Ethikry/wkbot',
    points: [
      'Pulls each member’s progress from WaniKani, the kanji-learning site we use, and only asks for what’s changed since last time.',
      'Recreates WaniKani’s streak rules, including the “offerings” that save a missed day, so our streaks match the ones on the site.',
      'Stores everyone’s API keys encrypted and uses each person’s own time zone. Changes to its 35-table database go through small migrations.',
      'An LLM writes the reminders in Japanese using only kanji the person has already learned. If the API is down, it sends a plain message instead.',
      'Built alongside a second developer through pull requests, with 26+ merged so far.',
    ],
  },
  {
    slug: 'listening-stats',
    title: 'Listening Stats',
    blurb:
      'YouTube Music doesn’t give you listening stats, so I built my own. It keeps a full play history that updates itself, plus a dashboard of what I listen to.',
    summary:
      'A self-updating YouTube Music history and a dashboard that tracks skips and listening time more accurately than most play-tracking tools.',
    stack: ['Python', 'SQLite', 'ECharts'],
    dates: 'Sep 2026',
    role: 'Solo project',
    demo: '/projects/listening-stats/demo/',
    caseStudy: '/projects/listening-stats/',
    privateNote: 'Personal tool. Code on request.',
    points: [
      'Imports my full history from Google Takeout once, then checks for new plays every 20 minutes.',
      'Counts a song as skipped if the next one starts too soon, and only counts the time I spent listening.',
      'When a newer Takeout export comes in, it replaces the estimated plays with the exact ones, so nothing gets counted twice.',
      'The dashboard covers streaks, listening sessions, what time of day I listen, when I found each artist, and old favorites I’ve stopped playing.',
    ],
  },
  {
    slug: 'flight-monitor',
    title: 'Flight Price Monitor',
    blurb:
      'Keeps an eye on the trips I want to take, for both points and cash fares, and only alerts me when a price is worth acting on. It was more useful before Google Flights added award fares 😅',
    summary:
      'Tracks award points and cash fares for saved trips, alerts on new lows and target prices, and limits smaller drops to one alert a day.',
    stack: ['Python', 'FastAPI', 'SQLAlchemy', 'SQLite', 'JavaScript'],
    dates: 'Apr – Sep 2026',
    role: 'Solo project',
    demo: '/projects/flight-monitor/demo/',
    caseStudy: '/projects/flight-monitor/',
    privateNote: 'Code is private. Happy to walk through it.',
    points: [
      'It follows four alert rules that I wrote down and tested. A new all-time low always alerts, a target price alerts once when it’s crossed, small drops wait 24 hours, and a brand-new watch stays quiet.',
      'Plans its requests around each data source. Award prices come back for a whole date range in one call, while cash fares have to be fetched one date at a time, three seconds apart.',
      'It started out as a Discord bot. After using it for a while, I rebuilt it as a small web app around the parts I needed.',
      'It has 225 automated tests, and they all run without an internet connection.',
    ],
  },
  {
    slug: 'holodle',
    title: 'Holodle',
    blurb:
      'A guessing game that runs inside Discord. Everyone plays the same daily puzzle and can watch each other’s progress without seeing the answers.',
    summary:
      'A Wordle-style daily game played as a Discord Activity, with live progress from everyone playing.',
    stack: ['TypeScript', 'React', 'Fastify', 'Socket.IO', 'SQLite'],
    dates: 'May – Aug 2026',
    role: 'Solo project',
    demo: '/projects/holodle/demo/',
    caseStudy: '/projects/holodle/',
    repo: 'https://github.com/Ethikry/holodle',
    points: [
      'All the grading happens on the server, so there’s no way to find the answer in the browser. Other players see your colored squares but not your guesses.',
      'The admin page measures how much each clue helps players narrow down the answer in real games, and a solver suggests the best next guess.',
      'Each day’s answer is picked so recent ones rarely repeat, and the day rolls over at midnight wherever you are.',
      'About 176 automated tests. It runs for free on a small cloud server.',
    ],
  },
]

export const bySlug = (slug: string) => PROJECTS.find((p) => p.slug === slug)!
