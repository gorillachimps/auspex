#!/usr/bin/env python3
"""Weekly attribution ledger from the public CLOB builder/trades endpoint.

Pulls every trade attributed to the Auspex builder code, aggregates volume /
trade count / unique funders, and prints a summary plus a ready-to-paste
markdown ledger row. Run weekly; the row series is the longevity record for
grant follow-ups and the week-6 review gate.

Usage:
  python3 builder_stats.py            summary + this-week ledger row
  python3 builder_stats.py --json     raw aggregates as JSON
"""

import argparse
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BUILDER_CODE = (
    "0x1cc4300fca20eb0449c32d3c56d937d0a46e172d2707a62860b5f5311f2b608b"
)
ENDPOINT = "https://clob.polymarket.com/builder/trades"
MAX_PAGES = 50
CONFIRMED = {"TRADE_STATUS_CONFIRMED", "TRADE_STATUS_MINED"}


def fetch_all_trades() -> list[dict]:
    trades: list[dict] = []
    cursor = None
    for _ in range(MAX_PAGES):
        params = {"builder_code": BUILDER_CODE}
        if cursor:
            params["next_cursor"] = cursor
        url = f"{ENDPOINT}?{urllib.parse.urlencode(params)}"
        # The CLOB's edge 403s the default urllib UA; present a normal client.
        req = urllib.request.Request(url, headers={"User-Agent": "auspex-ledger/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            body = json.load(r)
        page = body.get("data") or []
        trades.extend(page)
        cursor = body.get("next_cursor")
        # "LTE=" is the CLOB's end-of-results cursor sentinel.
        if not page or not cursor or cursor == "LTE=":
            break
    return trades


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="print raw aggregates")
    args = ap.parse_args()

    trades = [t for t in fetch_all_trades() if t.get("status") in CONFIRMED]
    now = time.time()
    week_ago = now - 7 * 86_400

    def ts(t: dict) -> float:
        try:
            return float(t.get("matchTime") or 0)
        except (TypeError, ValueError):
            return 0.0

    def usd(t: dict) -> float:
        try:
            return float(t.get("sizeUsdc") or 0)
        except (TypeError, ValueError):
            return 0.0

    total_vol = sum(usd(t) for t in trades)
    funders = {(t.get("maker") or "").lower() for t in trades if t.get("maker")}
    week = [t for t in trades if ts(t) >= week_ago]
    week_vol = sum(usd(t) for t in week)
    week_funders = {(t.get("maker") or "").lower() for t in week if t.get("maker")}
    fees = sum(float(t.get("builderFee") or 0) for t in trades)
    stamps = sorted(ts(t) for t in trades if ts(t) > 0)

    def day(s: float) -> str:
        return datetime.fromtimestamp(s, tz=timezone.utc).strftime("%Y-%m-%d")

    agg = {
        "confirmed_trades": len(trades),
        "total_volume_usdc": round(total_vol, 2),
        "unique_funders": len(funders),
        "first_trade": day(stamps[0]) if stamps else None,
        "last_trade": day(stamps[-1]) if stamps else None,
        "last7d_trades": len(week),
        "last7d_volume_usdc": round(week_vol, 2),
        "last7d_unique_funders": len(week_funders),
        "builder_fees_usdc": round(fees, 6),
    }

    if args.json:
        print(json.dumps(agg, indent=2))
        return

    print("Auspex builder attribution — cumulative")
    print(f"  confirmed trades : {agg['confirmed_trades']}")
    print(f"  volume           : ${agg['total_volume_usdc']:,.2f}")
    print(f"  unique funders   : {agg['unique_funders']}")
    print(f"  active since     : {agg['first_trade']}  (last: {agg['last_trade']})")
    print(f"  builder fees     : ${agg['builder_fees_usdc']} (0% by design)")
    print()
    print("Ledger row (paste into your weekly ledger):")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print("| week ending | 7d trades | 7d volume | 7d funders | cum. volume | cum. funders |")
    print("|---|---|---|---|---|---|")
    print(
        f"| {today} | {agg['last7d_trades']} | ${agg['last7d_volume_usdc']:,.2f} "
        f"| {agg['last7d_unique_funders']} | ${agg['total_volume_usdc']:,.2f} "
        f"| {agg['unique_funders']} |"
    )


if __name__ == "__main__":
    main()
