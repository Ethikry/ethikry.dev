"""Build the synthetic database behind the product monitor demo.

The real bot keeps its state in SQLite. This writes a small database with the
same shape (products, variants, when each store page first listed each
product, and the alerts sent), adapted from the bot's own schema and filled
with two made-up weeks at two made-up stores. Nothing in it comes from the
real database.

    python3 scripts/gen_monitor_db.py
"""

from __future__ import annotations

import gzip
import random
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public/projects/product-monitor/monitor-demo.sqlite"
# Shipped gzipped; the page inflates it with DecompressionStream before handing
# it to sql.js.
OUT_GZ = OUT.with_suffix(".sqlite.gz")
SEED = 20260929
DAYS = 14
END = datetime(2026, 9, 28, 0, 0, tzinfo=timezone.utc)
START = END - timedelta(days=DAYS)

DDL = """
CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    store TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    product_type TEXT NOT NULL,
    published_at TEXT,
    available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
    is_preorder INTEGER NOT NULL DEFAULT 0 CHECK (is_preorder IN (0, 1)),
    has_digital_variants INTEGER NOT NULL DEFAULT 0 CHECK (has_digital_variants IN (0, 1))
);
CREATE INDEX idx_products_published_at ON products(published_at DESC);

CREATE TABLE variants (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
    price REAL,
    is_digital INTEGER NOT NULL DEFAULT 0 CHECK (is_digital IN (0, 1)),
    is_limited INTEGER NOT NULL DEFAULT 0 CHECK (is_limited IN (0, 1))
);
CREATE INDEX idx_variants_product_id ON variants(product_id);

-- One row per (page, product): when each page of the store first listed it.
CREATE TABLE sightings (
    page TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    first_seen_at INTEGER NOT NULL,
    PRIMARY KEY (page, product_id)
);

-- What went out to Discord.
CREATE TABLE alert_events (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER REFERENCES variants(id),
    kind TEXT NOT NULL CHECK (kind IN ('new', 'restock', 'sold_out')),
    sent_at INTEGER NOT NULL,
    servers_notified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_alert_events_sent_at ON alert_events(sent_at DESC);
"""

STORES = {
    "northwind": "Northwind Merch",
    "harbor": "Harbor Goods",
}

# page -> (how often the bot checks it, in seconds; range of seconds after a
# release before the page lists the new product)
PAGES = {
    "sitemap": (20, (1, 15)),
    "new_arrivals": (120, (40, 600)),
    "catalog": (120, (60, 900)),
    "collections": (900, (300, 2_400)),
    "news_feed": (900, (400, 1_800)),
}

LINES = [
    ("Autumn Festival 2026", ["Acrylic Stand", "Tapestry", "Tote Bag", "Can Badge Set"]),
    ("Starlight Tour", ["Tour Hoodie", "Light Stick", "Poster Set", "Photo Book"]),
    ("3rd Anniversary", ["Voice Pack", "Plush", "Acrylic Keychain", "Signed Shikishi"]),
    ("Winter Collection", ["Scarf", "Mug", "Desk Mat", "Hoodie"]),
    ("Birthday 2026", ["Voice Pack", "Acrylic Stand", "Can Badge", "Wall Scroll"]),
    ("Studio Live", ["Blu-ray", "T-Shirt", "Towel", "Pin Set"]),
]
TYPES = {
    "Voice Pack": "Digital",
    "Blu-ray": "Media",
    "Photo Book": "Media",
    "Tour Hoodie": "Apparel",
    "Hoodie": "Apparel",
    "T-Shirt": "Apparel",
    "Scarf": "Apparel",
    "Towel": "Apparel",
}
SIZES = ["S", "M", "L", "XL"]


def ts(dt: datetime) -> int:
    return int(dt.timestamp())


def release_times(rng: random.Random) -> list[datetime]:
    """Stores release products in batches at a few fixed hours (UTC)."""
    out = []
    for d in range(DAYS):
        day = START + timedelta(days=d)
        for hour in (3, 9, 13, 18):
            if rng.random() < 0.5:
                out.append(day.replace(hour=hour) + timedelta(seconds=rng.randint(0, 120)))
    return out


def main() -> None:
    rng = random.Random(SEED)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    db = sqlite3.connect(OUT)
    db.executescript(DDL)

    pid = 0
    vid = 0
    alerts: list[tuple] = []
    for r in release_times(rng):
        store = rng.choice(list(STORES))
        line, items = rng.choice(LINES)
        for item in rng.sample(items, rng.randint(2, 4)):
            pid += 1
            published = r + timedelta(seconds=rng.randint(0, 90))
            kind = TYPES.get(item, "Goods")
            handle = f"{line}-{item}-{pid}".lower().replace(" ", "-")
            digital = kind == "Digital"
            db.execute(
                "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)",
                (pid, store, handle, f"{line} — {item}", kind, published.strftime("%Y-%m-%dT%H:%M:%SZ"),
                 1, int(rng.random() < 0.3), int(digital)),
            )
            sizes = SIZES if kind == "Apparel" else ["Standard"] if not digital else ["Download"]
            limited = rng.random() < 0.5
            price = round(rng.choice([12, 15, 18, 22, 28, 35, 48, 60]) + 0.0, 2)
            variant_ids = []
            for size in sizes:
                vid += 1
                variant_ids.append(vid)
                db.execute(
                    "INSERT INTO variants VALUES (?,?,?,?,?,?,?)",
                    (vid, pid, size, 1, price + (4 if size == "XL" else 0), int(digital), int(limited)),
                )

            # Each page lists the product after a delay drawn from its range,
            # noticed at the bot's next check of that page.
            first_alert = None
            for page, (interval, delay) in PAGES.items():
                seen = ts(published) + rng.randint(*delay)
                seen += (-seen) % interval
                db.execute("INSERT INTO sightings VALUES (?,?,?)", (page, pid, seen))
                first_alert = seen if first_alert is None else min(first_alert, seen)
            alerts.append((pid, None, "new", first_alert + rng.randint(1, 4), rng.randint(3, 6)))

            # Limited physical goods sell out, and some come back.
            if limited and not digital:
                for v in variant_ids:
                    if rng.random() < 0.75:
                        out_at = first_alert + rng.randint(600, 36 * 3600)
                        if out_at < ts(END):
                            alerts.append((pid, v, "sold_out", out_at, 0))
                            db.execute("UPDATE variants SET available = 0 WHERE id = ?", (v,))
                            if rng.random() < 0.7:
                                back = out_at + rng.randint(3 * 3600, 72 * 3600)
                                if back < ts(END):
                                    alerts.append((pid, v, "restock", back, rng.randint(3, 6)))
                                    db.execute("UPDATE variants SET available = 1 WHERE id = ?", (v,))
            db.execute(
                "UPDATE products SET available = EXISTS (SELECT 1 FROM variants WHERE product_id = ? AND available) WHERE id = ?",
                (pid, pid),
            )

    alerts.sort(key=lambda a: a[3])
    db.executemany(
        "INSERT INTO alert_events (product_id, variant_id, kind, sent_at, servers_notified) VALUES (?,?,?,?,?)",
        alerts,
    )
    db.commit()
    db.execute("VACUUM")
    db.close()
    OUT_GZ.write_bytes(gzip.compress(OUT.read_bytes(), compresslevel=9, mtime=0))
    OUT.unlink()
    print(f"{OUT_GZ.name}: {pid} products, {vid} variants, {len(alerts)} alerts, {OUT_GZ.stat().st_size / 1e3:.0f} KB gzipped")


if __name__ == "__main__":
    main()
