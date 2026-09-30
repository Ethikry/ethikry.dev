#!/usr/bin/env bash
# Copy flight-monitor's real web frontend into the portfolio as a static demo.
#
# The HTML, CSS and JS are the project's own, unchanged apart from paths: the
# app serves them from /static/ at the site root, and here they live under
# /projects/flight-monitor/demo/. demo-shim.js is injected ahead of them and
# answers the /api/* calls the backend would. Re-run after changing the app.
#
#   scripts/import-flight-monitor.sh [path/to/flight-monitor]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:-../flight-monitor}"
OUT=public/projects/flight-monitor/demo
BASE=/projects/flight-monitor/demo

mkdir -p "$OUT/watches"
cp "$SRC"/web/static/{app.js,common.js,watches.js,style.css} "$OUT/"
cp scripts/flight-demo/demo-shim.js "$OUT/"
# Reference data straight from the project, minus its internal comment.
python3 - "$SRC" "$OUT" <<'PY'
import json, sys
src, out = sys.argv[1:]
for name in ("airports", "programs"):
    data = json.load(open(f"{src}/data/{name}.json"))
    data.pop("_comment", None)
    json.dump(data, open(f"{out}/{name}.json", "w"), separators=(",", ":"))
PY

BANNER='<div class="demo-banner"><b>Demo.</b> The real flight-monitor front end, running on sample data instead of its API. The prices are made up, and the watch history and alerts come from running them through the real alert rules.</div>'
rewrite() {
  sed -e "s#/static/#$BASE/#g" \
      -e "s#href=\"/\" class=\"nav-link#href=\"$BASE/\" class=\"nav-link#g" \
      -e "s#href=\"/watches\" class=\"nav-link#href=\"$BASE/watches/\" class=\"nav-link#g" \
      -e "s#<script src=\"$BASE/common.js\"></script>#<script src=\"$BASE/demo-shim.js\"></script>\n<script src=\"$BASE/common.js\"></script>#" \
      -e "s#</head>#<style>.demo-banner{font:13px/1.4 system-ui,sans-serif;background:\#fff8e1;border-bottom:1px solid \#f0d98c;padding:8px 16px;color:\#5f4b00}</style>\n</head>#" \
      -e "s#<body>#<body>\n$BANNER#" \
      "$1"
}
rewrite "$SRC/web/static/index.html" > "$OUT/index.html"
rewrite "$SRC/web/static/watches.html" > "$OUT/watches/index.html"
git -C "$SRC" rev-parse --short HEAD > "$OUT/SOURCE_COMMIT" 2>/dev/null || true
echo "flight-monitor demo imported into $OUT"
