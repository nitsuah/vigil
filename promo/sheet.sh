#!/usr/bin/env bash
# Contact sheet of a spot's stills (promo/out/<spot>/stills/*.png → sheet.jpg), for review.
#   promo/sheet.sh health-21s [cols]
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd -W 2>/dev/null || pwd)"
SPOT="$1"; COLS="${2:-3}"
MSYS_NO_PATHCONV=1 docker run --rm -v "$REPO/promo/out/$SPOT:/w" -w /w/stills vigil-promo sh -c \
  "n=\$(ls t*.png | wc -l); rows=\$(( (n + $COLS - 1) / $COLS )); ffmpeg -hide_banner -loglevel error -y -pattern_type glob -i 't*.png' -vf \"scale=640:-1,tile=${COLS}x\$rows:padding=6\" -frames:v 1 -q:v 3 /w/sheet.jpg"
echo "promo/out/$SPOT/sheet.jpg"
