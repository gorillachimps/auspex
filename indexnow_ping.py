#!/usr/bin/env python3
"""Ping IndexNow (Bing / Yandex / Seznam / Naver) about new or changed URLs.

Google ignores IndexNow — this exists for the OTHER search surfaces: Bing (and
the AI answer engines its index feeds), plus Yandex, which matters for the
site's RU/PL/LV audience. No account or signup required by the protocol: the
key below is deliberately public and verified by engines fetching KEY_LOCATION.

Modes:
  python3 indexnow_ping.py --diff-head
      Submit market URLs whose slugs are NEW in data/enriched-markets.json
      relative to HEAD~1 (used by the data-rebuild workflow right after its
      data commit — HEAD~1 is then the pre-rebuild snapshot). Exits 0 always:
      indexing pings must never fail the pipeline.
  python3 indexnow_ping.py --sitemap
      One-shot bulk submit of every URL currently in the live sitemap
      (initial kickstart; protocol caps a single POST at 10,000 URLs).

State-free by design; engines dedupe repeat submissions server-side.
"""

import argparse
import json
import re
import subprocess
import sys
import urllib.request

HOST = "www.auspex.to"
SITE = f"https://{HOST}"
# Public by protocol design — must match the file served at KEY_LOCATION.
KEY = "b035a540818a48a087de70b5896be4f5"
KEY_LOCATION = f"{SITE}/{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"
DATA_FILE = "data/enriched-markets.json"
MAX_URLS = 9500  # protocol cap is 10k per POST; leave headroom
DIFF_CAP = 500   # sanity cap for one rebuild's "new markets" burst


def submit(urls: list[str]) -> int:
    if not urls:
        print("indexnow: nothing to submit")
        return 0
    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": urls[:MAX_URLS],
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"indexnow: submitted {len(payload['urlList'])} urls — HTTP {r.status}")
    except Exception as e:  # noqa: BLE001 — never break the caller over a ping
        print(f"indexnow: submit failed ({e}) — non-fatal, continuing")
    return 0


def slugs_of(raw: bytes) -> set[str]:
    try:
        return {
            m["slug"]
            for m in json.loads(raw)
            if isinstance(m, dict) and isinstance(m.get("slug"), str)
        }
    except (ValueError, TypeError):
        return set()


def mode_diff_head() -> int:
    try:
        old_raw = subprocess.run(
            ["git", "show", f"HEAD~1:{DATA_FILE}"],
            capture_output=True, check=True,
        ).stdout
    except subprocess.CalledProcessError:
        print("indexnow: no HEAD~1 snapshot (shallow clone / no data commit) — skipping")
        return 0
    try:
        new_raw = open(DATA_FILE, "rb").read()
    except OSError as e:
        print(f"indexnow: cannot read {DATA_FILE} ({e}) — skipping")
        return 0
    fresh = sorted(slugs_of(new_raw) - slugs_of(old_raw))
    if len(fresh) > DIFF_CAP:
        print(f"indexnow: {len(fresh)} new slugs, capping at {DIFF_CAP}")
        fresh = fresh[:DIFF_CAP]
    return submit([f"{SITE}/markets/{s}" for s in fresh])


def mode_sitemap() -> int:
    try:
        with urllib.request.urlopen(f"{SITE}/sitemap.xml", timeout=30) as r:
            xml = r.read().decode()
    except Exception as e:  # noqa: BLE001
        print(f"indexnow: sitemap fetch failed ({e})")
        return 0
    urls = re.findall(r"<loc>([^<]+)</loc>", xml)
    print(f"indexnow: sitemap has {len(urls)} urls")
    return submit(urls)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--diff-head", action="store_true")
    g.add_argument("--sitemap", action="store_true")
    args = ap.parse_args()
    return mode_diff_head() if args.diff_head else mode_sitemap()


if __name__ == "__main__":
    sys.exit(main())
