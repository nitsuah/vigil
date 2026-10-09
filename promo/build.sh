#!/usr/bin/env bash
# Rebuild a promo spot end to end in Docker. Everything on screen is the real
# vigil UI rendering the fictional demo portfolio in promo/demo-seed.ts.
#
#   promo/build.sh                                  # full render of brag-30s
#   promo/build.sh brag-30s --stills 1.8,4.5,9.2    # quick look at a few frames
#   promo/build.sh brag-30s --audio                 # re-synth audio + remux only
#   promo/build.sh brag-30s --recapture             # re-shoot the app (after UI/seed changes)
#   promo/build.sh health-17s --publish             # also copy it to site/assets/<spot>.mp4/.jpg
#   promo/reel.sh hero --publish                    # join the spots into the hero reel (site/assets/vigil.mp4)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd -W 2>/dev/null || pwd)"   # Windows path under Git Bash

SPOT="brag-30s"; MODE="full"; TIMES=""; RECAPTURE=0; PUBLISH=0
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
  # Each spot publishes under its own name; the landing-page hero (vigil.mp4 +
  # poster.jpg) is the hero reel, built from the spots by promo/reel.sh.
  cp "promo/out/$SPOT/$SPOT-web.mp4" "site/assets/$SPOT.mp4"
  cp "promo/out/$SPOT/$SPOT.jpg" "site/assets/$SPOT.jpg"
  # details.webp (the whole expanded panel) is for video framing only.
  for f in promo/out/capture/web/*.webp; do [ "$(basename "$f")" = details.webp ] || cp "$f" site/assets/; done
  echo "published → site/assets/$SPOT.mp4"
fi
