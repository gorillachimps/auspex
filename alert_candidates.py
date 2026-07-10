#!/usr/bin/env python3
"""Print tweet-ready near-trigger alert posts from the enriched snapshot.

Reads data/enriched-markets.json (kept fresh every 15 min by the data-refresh
workflow), selects live, liquid, near-trigger markets that close soon, verifies
each candidate still has a live CLOB order book (never post a market someone
clicks into and can't trade), and prints ready-to-paste posts.

Manual-first by design: run it, copy the best post, tweet it. The same
selection logic can later be wired to the X API for auto-posting.

Usage:
  python3 alert_candidates.py                      defaults: <=2% dist, <=24h, top 5
  python3 alert_candidates.py --max-distance 0.05 --max-hours 48 --top 8
  python3 alert_candidates.py --no-book-check      offline / faster
  python3 alert_candidates.py --ignore-state       re-show recently shown markets

State: .alerts-state.json (gitignored) remembers what was shown in the last
12h so consecutive runs surface fresh candidates.
"""

import argparse
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data" / "enriched-markets.json"
STATE = ROOT / ".alerts-state.json"
CLOB_BOOK = "https://clob.polymarket.com/book?token_id="
SITE = "https://auspex.to/markets/"
REPOST_COOLDOWN_S = 12 * 3600


def fmt_price(v: float) -> str:
    if v >= 1000:
        return f"${v:,.0f}"
    if v >= 1:
        return f"${v:,.2f}"
    return f"${v:.4f}"


def fmt_timeleft(end_iso: str, now: datetime) -> str | None:
    try:
        end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    secs = (end - now).total_seconds()
    if secs <= 0:
        return None
    hours = secs / 3600
    if hours < 1:
        return f"{int(secs // 60)}m"
    if hours < 48:
        return f"{int(hours)}h"
    return f"{int(hours // 24)}d {int(hours % 24)}h"


def hours_left(end_iso: str, now: datetime) -> float | None:
    try:
        end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return (end - now).total_seconds() / 3600


def book_is_live(token_id: str) -> bool:
    """True iff the CLOB has resting liquidity for this token."""
    try:
        # The CLOB's edge 403s the default urllib UA; present a normal client.
        req = urllib.request.Request(
            CLOB_BOOK + token_id, headers={"User-Agent": "auspex-alerts/1.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            body = json.load(r)
    except Exception:
        return False  # network/no-book — don't post what we can't verify
    if not isinstance(body, dict) or "error" in body:
        return False
    return bool(body.get("bids") or body.get("asks"))


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    try:
        STATE.write_text(json.dumps(state, indent=1))
    except OSError:
        pass


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--max-distance", type=float, default=0.02,
                    help="max distance-to-trigger as a fraction (default 0.02 = 2%%)")
    ap.add_argument("--max-hours", type=float, default=0,
                    help="only markets closing within N hours (0 = no cap; a "
                         "0.3%% distance is newsworthy at any horizon)")
    ap.add_argument("--min-liquidity", type=float, default=10_000,
                    help="min market liquidity in USD (default 10000)")
    ap.add_argument("--min-volume", type=float, default=1_000,
                    help="min 24h volume in USD (default 1000)")
    ap.add_argument("--top", type=int, default=5, help="max posts to print")
    ap.add_argument("--no-book-check", action="store_true",
                    help="skip the live order-book verification")
    ap.add_argument("--ignore-state", action="store_true",
                    help="ignore the 12h repost cooldown")
    args = ap.parse_args()

    markets = json.loads(DATA.read_text())
    now = datetime.now(timezone.utc)
    state = {} if args.ignore_state else load_state()
    now_s = time.time()

    candidates = []
    for m in markets:
        live = m.get("live") or {}
        if live.get("state") != "live" or live.get("already_triggered"):
            continue
        dist = live.get("distance_to_trigger_pct")
        if not isinstance(dist, (int, float)) or not (0 < dist <= args.max_distance):
            continue
        if (m.get("liquidity") or 0) < args.min_liquidity:
            continue
        if (m.get("volume_24h") or 0) < args.min_volume:
            continue
        hl = hours_left(m.get("end_date") or "", now)
        if hl is None or hl <= 0:
            continue
        if args.max_hours > 0 and hl > args.max_hours:
            continue
        last = state.get(m.get("slug") or "", 0)
        if now_s - last < REPOST_COOLDOWN_S:
            continue
        candidates.append((dist, hl, m))

    # Closest to trigger first; sooner-closing breaks ties; volume last.
    candidates.sort(
        key=lambda c: (c[0], c[1], -(c[2].get("volume_24h") or 0))
    )
    candidates = [(d, m) for d, _hl, m in candidates]

    printed = 0
    for dist, m in candidates:
        if printed >= args.top:
            break
        token = m.get("token_yes") or m.get("token_no") or ""
        if not args.no_book_check and (not token or not book_is_live(token)):
            continue

        implied = m.get("implied_yes")
        tl = fmt_timeleft(m.get("end_date") or "", now) or "soon"

        # Tweet shape: hook first (the tension — distance + clock + odds),
        # then the market's own question verbatim (safe for every phrasing,
        # incl. "between X and Y" markets), then the link. No spot/threshold
        # restatement — near the trigger they round to the same number and
        # read as a bug ("$1.10 · trigger $1.10").
        hook = [f"⚡ {dist * 100:.1f}% from the trigger", f"{tl} left"]
        if isinstance(implied, (int, float)):
            hook.append(f"YES at {round(implied * 100)}%")

        printed += 1
        state[m["slug"]] = now_s
        print(f"--- {printed} " + "-" * 58)
        print(" · ".join(hook))
        print()
        print(m["question"])
        print()
        print(f"{SITE}{m['slug']}")
        print()

    if printed == 0:
        print("No candidates under current filters. Try:")
        print("  python3 alert_candidates.py --max-distance 0.05 --max-hours 48")
    else:
        save_state(state)


if __name__ == "__main__":
    main()
