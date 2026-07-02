"""
Phase 0a — Polymarket crypto-vertical market dump.

Collects all active crypto events (with their nested markets[] arrays),
dedupes by event ID, writes to data/crypto-events.json.

Pagination: gamma capped /events offsets at ~2000 (422: "offset too large,
use /events/keyset for deeper pagination") in mid-2026, which crashed the
old single-sweep offset crawl and froze the snapshot's market set. The
keyset endpoint's cursor parameter is undocumented, so instead we shard the
crawl by end-date windows — each window stays comfortably under the offset
cap — and dynamically split any window that ever approaches it. Events are
deduped by ID across windows, so boundary overlap is harmless.

Run:
    python dump_crypto_events.py
"""

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

GAMMA = "https://gamma-api.polymarket.com"
TAG_SLUG = "crypto"
# Gamma silently caps /events at 100 per page regardless of the `limit`
# query param — loop until an empty page.
PAGE_SIZE = 100
# Gamma 422s offsets beyond ~2000. Stay under it per window; a window that
# reaches this is split in half and re-crawled rather than truncated.
OFFSET_CAP = 2_000
# Window boundaries in days-from-now. Dailies cluster in the near term, so
# near windows are narrow; far windows are sparse and can be wide. The final
# None = open-ended tail (end_date_min only).
WINDOW_DAYS = [0, 1, 2, 4, 7, 14, 30, 60, 120, 240, 500, 1000, None]
OUT_PATH = Path(__file__).parent / "data" / "crypto-events.json"


def fetch_page(offset: int, end_min: str | None, end_max: str | None) -> list:
    params: dict = {
        "tag_slug": TAG_SLUG,
        "active": "true",
        "closed": "false",
        "limit": PAGE_SIZE,
        "offset": offset,
    }
    if end_min:
        params["end_date_min"] = end_min
    if end_max:
        params["end_date_max"] = end_max
    r = requests.get(f"{GAMMA}/events", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def crawl_window(end_min: str | None, end_max: str | None, by_id: dict) -> bool:
    """Crawl one end-date window into by_id. Returns False if the window hit
    the offset cap before exhausting (caller should split it)."""
    offset = 0
    while True:
        page = fetch_page(offset, end_min, end_max)
        for e in page:
            by_id[e.get("id")] = e
        if len(page) < PAGE_SIZE:
            print(
                f"  window [{end_min or '-inf'} .. {end_max or 'inf'}]"
                f": {offset + len(page):>4} events (total {len(by_id):>5})"
            )
            return True
        offset += PAGE_SIZE
        if offset >= OFFSET_CAP:
            print(
                f"  window [{end_min or '-inf'} .. {end_max or 'inf'}]"
                f" hit the offset cap — splitting"
            )
            return False
        time.sleep(0.2)


def iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def main() -> None:
    by_id: dict = {}
    now = datetime.now(timezone.utc)
    # Start one day back so events ending later today are safely included
    # regardless of gamma's boundary semantics; dedupe absorbs any overlap.
    bounds: list[datetime | None] = [
        now + timedelta(days=d) if d is not None else None
        for d in ([-1] + WINDOW_DAYS[1:])
    ]
    # Consecutive pairs; the last boundary is None, so the final pair is the
    # open-ended tail (end_date_min only).
    queue: list[tuple[datetime | None, datetime | None]] = [
        (bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)
    ]

    while queue:
        lo, hi = queue.pop(0)
        ok = crawl_window(iso(lo) if lo else None, iso(hi) if hi else None, by_id)
        if ok:
            continue
        # Split the window and re-crawl both halves. Never split below one
        # day — if a single day somehow exceeds the cap, log loudly and
        # accept the partial rather than loop forever.
        if lo is not None and hi is not None and (hi - lo) > timedelta(days=1):
            mid = lo + (hi - lo) / 2
            queue.insert(0, (mid, hi))
            queue.insert(0, (lo, mid))
        elif lo is not None and hi is None:
            # Open tail overflowed: peel off a bounded year, keep the rest.
            mid = lo + timedelta(days=365)
            queue.insert(0, (mid, None))
            queue.insert(0, (lo, mid))
        else:
            print(
                f"  WARNING: window [{lo} .. {hi}] exceeds the offset cap at "
                f"minimum width — snapshot may be missing events in it"
            )

    events = list(by_id.values())
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(events, separators=(",", ":")))

    n_markets = sum(len(e.get("markets", [])) for e in events)
    total_vol = sum(float(e.get("volume") or 0) for e in events)
    total_24h = sum(float(e.get("volume24hr") or 0) for e in events)
    total_liq = sum(float(e.get("liquidity") or 0) for e in events)

    print()
    print(f"Wrote {OUT_PATH}")
    print(f"  events:     {len(events)}")
    print(f"  markets:    {n_markets}")
    print(f"  cum vol:    ${total_vol:,.0f}")
    print(f"  24h vol:    ${total_24h:,.0f}")
    print(f"  liquidity:  ${total_liq:,.0f}")
    print(f"  file size:  {OUT_PATH.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
