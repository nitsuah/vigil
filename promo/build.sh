#!/usr/bin/env bash
# Rebuild a promo spot end to end in Docker. Everything on screen is the real
# vigil UI rendering the fictional demo portfolio in promo/demo-seed.ts.
#
#   promo/build.sh                                  # full render of brag-22s
#   promo/build.sh brag-22s --stills 1.8,4.5,9.2    # quick look at a few frames
#   promo/build.sh brag-22s --audio                 # re-synth audio + remux only
#   promo/build.sh brag-22s --recapture             # re-shoot the app (after UI/seed changes)
#   promo/build.sh brag-22s --publish               # also update site/assets/ (landing page hero)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd -W 2>/dev/null || pwd)"   # Windows path under Git Bash

SPOT="brag-22s"; MODE="full"; TIMES=""; RECAPTURE=0; PUBLISH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --stills) MODE="stills"; TIMES="$2"; shift 2 ;;
    --audio) MODE="audio"; shift ;;
    --recapture) RECAPTURE=1; shift ;;
    --publish) PUBLISH=1; shift ;;
    -*) echo "unknown option $1"; exit 1 ;;
    *) SPOT="$1"; shift ;;
  esac
done

docker info >/dev/null 2>&1 || { echo "Docker Desktop isn't running."; exit 1; }
echo "== image"
docker build -q -f promo/Dockerfile -t vigil-promo . >/dev/null
mkdir -p promo/out
MSYS_NO_PATHCONV=1 docker run --rm --init \
  -v "$REPO:/repo:ro" -v "$REPO/promo/out:/out" \
  -e RECAPTURE="$RECAPTURE" \
  vigil-promo sh /repo/promo/pipeline.sh "$SPOT" "$MODE" "$TIMES"

if [ "$PUBLISH" = 1 ] && [ "$MODE" != stills ]; then
  mkdir -p site/assets
  cp "promo/out/$SPOT/$SPOT-web.mp4" site/assets/vigil.mp4
  cp "promo/out/$SPOT/$SPOT.jpg" site/assets/poster.jpg
  cp promo/out/capture/web/*.webp site/assets/
  echo "published → site/assets/"
fi
