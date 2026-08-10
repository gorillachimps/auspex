#!/usr/bin/env bash
# Vercel "Ignored Build Step" — decides whether a commit needs a rebuild.
#
# Exit 0 => SKIP the build.  Exit 1 => BUILD.  (Vercel's convention.)
#
# Why: the data pipeline commits a fresh snapshot every few hours, and each of
# those commits used to trigger a full rebuild (~21 CPU-minutes) that produced
# byte-identical CODE — 87% of the August bill. Production now reads snapshots
# over HTTPS from the repo's raw endpoint (see ui/lib/data.ts and the raw-URL
# fetch in LeaderboardView), so data-only commits do not need to deploy at all.
#
# Fails OPEN by design: any unexpected condition (git error, no parent commit,
# empty diff) exits 1 and builds. A wrongly-skipped build ships stale CODE and
# is invisible; a wrongly-run build just costs a few cents.

set -u

# Paths whose changes never affect the deployed bundle's behaviour.
DEPLOY_IRRELEVANT='^(data/|LEDGER\.md$|ui/data/|ui/public/leaderboard-stats\.json$)'

if ! changed=$(git diff --name-only HEAD^ HEAD 2>/dev/null); then
  echo "ignore-build: cannot diff HEAD^..HEAD (shallow clone or first commit) — building."
  exit 1
fi

if [ -z "$changed" ]; then
  echo "ignore-build: empty diff — building (unexpected; failing open)."
  exit 1
fi

if relevant=$(printf '%s\n' "$changed" | grep -Ev "$DEPLOY_IRRELEVANT"); then
  echo "ignore-build: code changed — building. Files:"
  printf '  %s\n' "$relevant"
  exit 1
fi

echo "ignore-build: data-only commit — skipping build. Files:"
printf '  %s\n' "$changed"
exit 0
