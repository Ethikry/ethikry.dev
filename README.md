# ethikry.dev

Ethan Gayton's portfolio: a home page, a project index, and a case study with a
working demo for each project. Every demo runs on synthetic data, so nothing
private leaves the original projects.

**Live:** [ethikry.dev](https://ethikry.dev)

## Layout

```
src/pages/                   home, /projects/, one case study per project, 404
src/data/projects.ts         titles, stacks, dates and bullets (kept in step with the resume)
src/layouts/                 masthead/footer, case-study frame
src/demos/                   React islands: product monitor (sql.js), study bot, flight alert feed
src/components/DiscordMock   renders Discord embeds the way Discord does
public/projects/*/demo/      demos built from the projects' own code (see below)
worker/index.js              the ethikry.dev router
scripts/                     demo generators, import scripts, icon renderer, leak check
```

Design: neutral surfaces with a single teal accent, Inter for text and
JetBrains Mono for small labels, light and dark themes (`src/styles/global.css`).
Each project card gets a small generated illustration (`src/components/Thumb.astro`).

## Demos and where they come from

| Page | Demo | How it's made |
| --- | --- | --- |
| `/projects/song-rank/` | the real site | its own repo and Worker, reached through a service binding |
| `/projects/product-monitor/` | alert feed + SQL analytics | `scripts/gen_monitor_db.py` writes a synthetic SQLite DB with the bot's schema; sql.js runs it in the browser |
| `/projects/study-bot/` | Discord replies | the bot's embed layouts, ported, over a made-up study group |
| `/projects/listening-stats/` | dashboard | `scripts/gen_ytmusic_demo.py` runs a synthetic history through ytmusic's real `stats.compute` and `report.render` |
| `/projects/flight-monitor/` | the real web UI | `scripts/import-flight-monitor.sh` copies its frontend and injects `demo-shim.js` for the API; `scripts/gen_flight_fixtures.py` runs synthetic fares through the real alert engine |
| `/projects/holodle/` | the real game | `scripts/import-holodle.sh` builds holodle's `--mode demo` (server and Discord modules swapped for in-browser stand-ins) |

Regenerate after changing a source project:

```sh
python3 scripts/gen_monitor_db.py
python3 scripts/gen_ytmusic_demo.py                 # needs ../ytmusic
DATABASE_URL=sqlite+aiosqlite:///:memory: ../flight-monitor/.venv/bin/python scripts/gen_flight_fixtures.py
scripts/import-flight-monitor.sh                    # needs ../flight-monitor
scripts/import-holodle.sh                           # needs holodle's demo/portfolio-build branch
node scripts/makeIcons.mjs                          # after editing public/favicon.svg
```

## Running and deploying

```sh
pnpm install
pnpm dev          # http://localhost:4321 (Astro; demo folders need /index.html in dev)
pnpm build        # static build in dist/, then the leak check
pnpm run preview  # wrangler dev: the real router + assets on :8787
pnpm run deploy   # build → leak check → wrangler deploy
```

The Worker deploys as `ethikry-projects-router`, which owns the ethikry.dev
custom domain. It serves `dist/` and hands `/projects/song-rank/*` to the
`ethikry-song-rank` Worker. `scripts/check-leaks.mjs` fails the build if the
product monitor pages name the stores, or if any page contains a personal
email, phone number or credential-shaped string.
The names it screens for are kept in `scripts/leak-terms.private.json`, which
is git-ignored (listing them here would publish them). Without that file the
generic checks still run, and `pnpm run deploy` refuses to go ahead.
