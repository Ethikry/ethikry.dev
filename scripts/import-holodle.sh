#!/usr/bin/env bash
# Build holodle's static demo (its own `vite build --mode demo`, which swaps the
# server and Discord modules for in-browser stand-ins) and copy it in.
#
#   scripts/import-holodle.sh [path/to/holodle checkout with the demo mode]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$(cd "${1:-../holodle.worktrees/portfolio-demo}" && pwd)"
OUT=public/projects/holodle/demo

pnpm --dir "$SRC" --filter @holodle/client build:demo
rm -rf "$OUT"
mkdir -p "$(dirname "$OUT")"
cp -R "$SRC/packages/client/dist-demo/projects/holodle/demo" "$OUT"
# Pages that only make sense beside the real server.
rm -f "$OUT"/{admin,privacy-policy,terms-of-service}.html
git -C "$SRC" rev-parse --short HEAD > "$OUT/SOURCE_COMMIT"
echo "holodle demo imported into $OUT ($(cat "$OUT/SOURCE_COMMIT"))"
