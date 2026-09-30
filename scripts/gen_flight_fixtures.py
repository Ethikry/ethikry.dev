"""Build the flight-monitor demo's data by running made-up fares through the real alert rules.

Three watches are polled every 12 hours for two weeks against synthetic price
series. At each poll the project's own `decide_alerts` and `_apply_cooldown`
(core/watch_engine.py) decide what would have been sent, and `build_embed`
(core/alerter.py) formats it, so the history and the alert feed shown in the
demo are exactly what the real engine does with those prices.

Run with the flight-monitor project's own interpreter:

    DATABASE_URL=sqlite+aiosqlite:///:memory: \\
      ../flight-monitor/.venv/bin/python scripts/gen_flight_fixtures.py [../flight-monitor]
"""

from __future__ import annotations

import datetime as dt
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FM = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / "flight-monitor").resolve()
sys.path.insert(0, str(FM))

from api.aggregator import Itinerary  # noqa: E402
from core.alerter import build_embed  # noqa: E402
from core.watch_engine import _apply_cooldown, _cheapest_per_group, _cheapest_per_program, decide_alerts  # noqa: E402
from db.models import Watch  # noqa: E402

OUT = ROOT / "public/projects/flight-monitor/demo/fixtures.json"
FEED = ROOT / "src/data/flight-alerts.json"
UTC = dt.timezone.utc
START = dt.datetime(2026, 9, 14, 6, 0, tzinfo=UTC)
POLLS = 29  # 14 days at 12h, plus one held back for the demo's "Check now"
STEP = dt.timedelta(hours=12)

WATCHES = [
    dict(id=1, label="Holiday Honolulu", origin="DEN", destination="HNL", date_from=dt.date(2026, 12, 18),
         date_to=dt.date(2026, 12, 20), cabin="economy", programs=[], include_cash=True, return_offset_days=7,
         target_points=None, target_cash_usd=520.0, poll_interval_minutes=720,
         awards={}, cash=(640, 90), airlines="Southwest, United"),
    dict(id=2, label="Spring in London", origin="SLC", destination="LHR", date_from=dt.date(2027, 3, 5),
         date_to=dt.date(2027, 3, 7), cabin="economy", programs=["british", "virginatlantic"], include_cash=True,
         return_offset_days=9, target_points=26000, target_cash_usd=780.0, poll_interval_minutes=720,
         awards={"british": (30000, 3000, "BA"), "virginatlantic": (28000, 2500, "VS, DL")},
         cash=(940, 110), airlines="Delta, Virgin Atlantic"),
    dict(id=3, label="Tokyo in November", origin="SLC", destination="NRT", date_from=dt.date(2026, 11, 10),
         date_to=dt.date(2026, 11, 13), cabin="business", programs=["alaska", "american", "united"],
         include_cash=True, return_offset_days=None, target_points=70000, target_cash_usd=None,
         poll_interval_minutes=720,
         awards={"alaska": (75000, 6000, "JL"), "american": (80000, 9000, "JL"), "united": (88000, 8000, "NH")},
         cash=(4100, 380), airlines="Delta, JAL"),
]


def dates(w):
    d = w["date_from"]
    while d <= w["date_to"]:
        yield d
        d += dt.timedelta(days=1)


def main() -> None:
    rng = random.Random(42)
    watches_out, observations, next_polls, feed = [], [], {}, []

    for spec in WATCHES:
        w = Watch(
            id=spec["id"], label=spec["label"], origin=spec["origin"], destination=spec["destination"],
            date_from=spec["date_from"], date_to=spec["date_to"], cabin=spec["cabin"], programs=spec["programs"],
            include_cash=spec["include_cash"], return_offset_days=spec["return_offset_days"],
            target_points=spec["target_points"], target_cash_usd=spec["target_cash_usd"],
            poll_interval_minutes=spec["poll_interval_minutes"], is_active=True,
        )
        # A random walk per (date, program), with the odd sale that later ends.
        level: dict[tuple, float] = {}
        for d in dates(spec):
            for prog, (base, _sd, _al) in spec["awards"].items():
                level[(d, prog)] = base * rng.uniform(0.95, 1.1)
            level[(d, "google_flights")] = spec["cash"][0] * rng.uniform(0.92, 1.12)

        record_lows: dict = {}
        last_seen: dict = {}
        last_drop = None
        obs_for_watch = []
        for n in range(POLLS):
            now = START + STEP * n
            its = []
            for d in dates(spec):
                for prog, (base, sd, al) in spec["awards"].items():
                    k = (d, prog)
                    # Mean-reverting around the usual price, with the odd sale or spike.
                    level[k] += (base - level[k]) * 0.2 + rng.gauss(0, sd * 0.35)
                    if rng.random() < 0.04:
                        level[k] *= rng.choice([0.82, 1.2])
                    pts = int(round(level[k] / 500) * 500)
                    its.append(Itinerary(origin=spec["origin"], destination=spec["destination"], date=d.isoformat(),
                                         cabin=spec["cabin"], points=pts, cash_usd=None, source="seats_aero",
                                         program=prog, taxes=round(rng.uniform(5.6, 180), 2), taxes_currency="USD",
                                         seats_remaining=rng.randint(1, 6), airlines=al, nonstop=rng.random() < 0.6))
                k = (d, "google_flights")
                base, sd = spec["cash"]
                level[k] += (base - level[k]) * 0.2 + rng.gauss(0, sd * 0.4)
                if n == POLLS - 1 and d == spec["date_from"]:
                    level[k] = base * 0.6  # the held-back poll brings a genuine low
                its.append(Itinerary(origin=spec["origin"], destination=spec["destination"], date=d.isoformat(),
                                     cabin=spec["cabin"], points=None, cash_usd=round(level[k]), source="google_flights",
                                     program="google_flights", airlines=spec["airlines"], nonstop=rng.random() < 0.3,
                                     return_date=(d + dt.timedelta(days=spec["return_offset_days"])).isoformat()
                                     if spec["return_offset_days"] else None))

            # The engine's own steps, in poll_watch's order.
            cheapest = _cheapest_per_group(its)
            alerts = decide_alerts(w, cheapest, record_lows, last_seen)
            to_send, sent_drop = _apply_cooldown(alerts, last_drop, now)
            if sent_drop:
                last_drop = now
            for key, it in cheapest.items():
                p = float(it.price)
                record_lows[key] = p if record_lows.get(key) is None else min(record_lows[key], p)
                last_seen[key] = p

            rows = [
                {"depart_date": it.date, "kind": it.kind, "program": it.program, "cabin": it.cabin, "points": it.points,
                 "cash_usd": it.cash_usd, "taxes": it.taxes, "taxes_currency": it.taxes_currency,
                 "seats_remaining": it.seats_remaining, "airlines": it.airlines, "nonstop": it.nonstop,
                 "observed_at": now.isoformat()}
                for it in _cheapest_per_program(its).values()
            ]
            sent = [{"reason": a.reason, "depart_date": a.depart_date, "kind": a.kind, "program": a.program,
                     "old_price": a.old_price, "new_price": a.new_price} for a in to_send]
            if n == POLLS - 1:
                next_polls[w.id] = {"observations": rows, "alerts": sent, "at": now.isoformat()}
            else:
                obs_for_watch.extend(rows)
                for a in to_send:
                    feed.append({"at": now.isoformat(), "embed": build_embed(a)})
                suppressed = len(alerts) - len(to_send)
                if suppressed:
                    feed.append({"at": now.isoformat(), "suppressed": suppressed, "watch": w.id})

        observations.append({"watch_id": w.id, "observations": obs_for_watch})
        watches_out.append({
            "id": w.id, "label": w.label, "origin": w.origin, "destination": w.destination,
            "date_from": w.date_from.isoformat(), "date_to": w.date_to.isoformat(),
            "return_offset_days": w.return_offset_days, "cabin": w.cabin, "programs": w.programs,
            "include_cash": w.include_cash, "target_points": w.target_points, "target_cash_usd": w.target_cash_usd,
            "poll_interval_minutes": w.poll_interval_minutes, "is_active": True,
            "last_checked_at": (START + STEP * (POLLS - 2)).isoformat(),
            "last_drop_alert_at": last_drop.isoformat() if last_drop else None,
            "created_at": (START - dt.timedelta(hours=1)).isoformat(),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"watches": watches_out[::-1], "history": observations, "next_poll": next_polls},
                              separators=(",", ":")))
    feed.sort(key=lambda f: f["at"])
    FEED.write_text(json.dumps(feed, indent=1, ensure_ascii=False))
    sent = sum(1 for f in feed if "embed" in f)
    held = sum(f.get("suppressed", 0) for f in feed)
    print(f"{OUT.relative_to(ROOT)}: {sum(len(h['observations']) for h in observations)} observations; "
          f"{sent} alerts sent, {held} drop alerts held back by the cooldown")


if __name__ == "__main__":
    main()
