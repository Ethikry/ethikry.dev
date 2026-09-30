"""Build the listening-dashboard demo from a synthetic listening history.

Generates about 18 months of plays by made-up artists into a throwaway
database with the real project's schema, then runs the real code over it:
`ytm.stats.compute` does the analysis and `ytm.report.render` writes the
dashboard. Only the history is invented.

    TZ=America/Denver python3 scripts/gen_ytmusic_demo.py [path/to/ytmusic]
"""

from __future__ import annotations

import math
import os
import random
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
YTM = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / "ytmusic").resolve()
sys.path.insert(0, str(YTM))

from ytm import db as ytm_db  # noqa: E402
from ytm import report  # noqa: E402

OUT = ROOT / "public/projects/listening-stats/demo/index.html"
SEED = 7
START = datetime(2025, 3, 1, tzinfo=timezone.utc)
END = datetime(2026, 9, 27, 23, 0, tzinfo=timezone.utc)
SYNC_FROM = datetime(2026, 8, 1, tzinfo=timezone.utc)  # after the last Takeout export

ARTISTS = [
    "Neon Harbor", "Velvet Arcade", "Paper Satellites", "Mira Sol", "The Quiet Engines", "Lumen Drive",
    "Hanami Club", "Coastline Radio", "Juno & the Tides", "Static Bloom", "Kite Theory", "Glass Canyon",
    "Aoi Minase", "Northbound Trains", "Violet Hour", "Sunday Circuit", "Oda Kaito", "Polar Choir",
    "Fable Street", "Moss & Mirror", "Retro Comet", "Saltwater Saints", "Night Bus Lines", "Pale Lanterns",
    "Honeycomb Hi-Fi", "Low Orbit", "The Maple Static", "Cinder Parade", "Yuki Tamura", "Brass Atlas",
]
WORDS_A = ["Midnight", "Golden", "Paper", "Electric", "Silver", "Quiet", "Summer", "Winter", "Neon", "Hollow",
           "Velvet", "Crimson", "Faded", "Wild", "Distant", "Little", "Endless", "Broken", "Northern", "Slow"]
WORDS_B = ["Lights", "Heart", "Signal", "Avenue", "Echoes", "Rain", "Letters", "Horizon", "Motel", "Waves",
           "Parade", "Garden", "Static", "Satellites", "Fever", "Ghosts", "Highway", "Bloom", "Tides", "Rooms"]


def catalog(rng: random.Random):
    """Artists with a popularity, an active window and 6–14 tracks each."""
    out = []
    span = (END - START).days
    for i, name in enumerate(ARTISTS):
        weight = 1 / (i + 1) ** 0.9
        # Some artists are there all along; others are discovered, and a few fall out of rotation.
        start = 0 if i < 6 or rng.random() < 0.3 else rng.randint(30, span - 60)
        end = span if rng.random() < 0.75 else rng.randint(start + 60, span)
        if i == 2:  # a big early favourite that fades: feeds "forgotten favorites"
            start, end, weight = 0, 190, 0.9
        tracks = []
        for t in range(rng.randint(6, 14)):
            title = f"{rng.choice(WORDS_A)} {rng.choice(WORDS_B)}"
            if rng.random() < 0.15:
                title += rng.choice([" (Live)", " (Acoustic)", " - Remastered"])
            vid = f"{i:02d}{t:02d}{rng.randrange(16**6):06x}"
            dur = int(rng.gauss(215, 45))
            tracks.append((vid, title, max(95, dur), 1 / (t + 1) ** 0.55))
        albums = [f"{rng.choice(WORDS_A)} {rng.choice(WORDS_B)}" for _ in range(rng.randint(1, 3))]
        out.append({"name": name, "weight": weight, "start": start, "end": end, "tracks": tracks, "albums": albums})
    return out


def sessions_for(day: datetime, rng: random.Random):
    """(start hour, length in tracks) for one day's listening sessions, local-ish time."""
    weekend = day.weekday() >= 5
    out = []
    if not weekend and rng.random() < 0.8:
        out.append((7.5 + rng.random(), rng.randint(6, 14)))  # commute
    if rng.random() < (0.35 if weekend else 0.55):
        out.append((12 + rng.random() * 2, rng.randint(4, 10)))
    if rng.random() < 0.85:
        out.append(((13 if weekend else 19) + rng.random() * 4, rng.randint(8, 30 if weekend else 22)))
    return out


def main() -> None:
    rng = random.Random(SEED)
    cat = catalog(rng)
    tmp = Path(tempfile.mkdtemp()) / "ytm.db"
    conn = ytm_db.connect(tmp)
    for a in cat:
        for n, (vid, title, dur, _w) in enumerate(a["tracks"]):
            album = a["albums"][n % len(a["albums"])]
            conn.execute(
                "INSERT INTO tracks (video_id, title, artist, album, duration_s, enriched_at) VALUES (?,?,?,?,?,?)",
                (vid, title, a["name"], album, dur, END.isoformat()),
            )

    plays = []
    day = START
    offset = timedelta(hours=6)  # generate in Mountain time, store as UTC
    while day < END:
        idx = (day - START).days
        active = [a for a in cat if a["start"] <= idx <= a["end"]]
        # Taste drifts: each artist's pull rises and falls on its own slow cycle.
        weights = [a["weight"] * (1.3 + math.sin(idx / 45 + i)) for i, a in enumerate(active)]
        for hour, n in sessions_for(day, rng):
            t = day + timedelta(hours=hour) + offset
            artist = rng.choices(active, weights)[0]
            for _ in range(n):
                if rng.random() < 0.35:
                    artist = rng.choices(active, weights)[0]
                vid, title, dur, _w = rng.choices(artist["tracks"], [x[3] for x in artist["tracks"]])[0]
                skipped = rng.random() < 0.11
                plays.append((vid, title, artist["name"], t))
                t += timedelta(seconds=rng.randint(8, 70) if skipped else dur + rng.randint(1, 6))
        day += timedelta(days=1)

    for vid, title, artist, t in plays:
        synced = t >= SYNC_FROM
        conn.execute(
            "INSERT OR IGNORE INTO plays (video_id, title, artist, played_at, source, approx) VALUES (?,?,?,?,?,?)",
            (vid, title, artist, t.strftime("%Y-%m-%dT%H:%M:%SZ"), "sync" if synced else "takeout", 0),
        )
    conn.commit()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    report.render(conn, OUT)
    html = OUT.read_text(encoding="utf-8")
    html = html.replace("<title>YouTube Music Stats</title>", "<title>Listening Stats (demo)</title>")
    html = html.replace("</head>", DEMO_HEAD + "</head>", 1)
    html = html.replace("<main>", "<main>" + DEMO_BANNER, 1)
    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(plays):,} synthetic plays, {sum(len(a['tracks']) for a in cat)} tracks")


# Follow the portfolio's light/dark choice, both on load and when the toggle on
# the page embedding this one is pressed.
DEMO_HEAD = """<script>
try { const t = localStorage.getItem('ethikry:theme'); if (t) document.documentElement.dataset.theme = t } catch {}
addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data && e.data.theme) {
    document.documentElement.dataset.theme = e.data.theme
    if (typeof renderCharts === 'function') renderCharts()
  }
})
</script>
<style>.demo-banner{font:13px/1.4 system-ui,sans-serif;background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:8px 12px;margin-bottom:18px;color:var(--ink-2)}.demo-banner b{color:var(--ink)}</style>
"""
DEMO_BANNER = """<div class="demo-banner"><b>Demo data.</b> A synthetic 18-month listening history by made-up artists, run through the project's real stats code and dashboard template.</div>
"""

if __name__ == "__main__":
    os.environ.setdefault("TZ", "America/Denver")
    time.tzset()
    main()
