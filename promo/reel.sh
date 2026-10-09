#!/usr/bin/env bash
# Joins rendered spots into a reel (promo/spots.json reels[].spots) with 0.3 s
# crossfades, at the spots' own encode settings so the joins are invisible.
# Run the spots first (promo/build.sh <spot>). Everything runs in Docker.
#   promo/reel.sh hero              # → promo/out/reel-hero/reel-hero.mp4 (+ -web.mp4, .jpg)
#   promo/reel.sh hero --publish    # also site/assets/vigil.mp4 + poster.jpg (the landing-page hero)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd -W 2>/dev/null || pwd)"
REEL="${1:-hero}"; PUBLISH=0; [ "${2:-}" = --publish ] && PUBLISH=1
FFMPEG=jrottenberg/ffmpeg:7.1-alpine@sha256:8ec1ee1f6a0fcd37c97725827b6b7832795c9596e3439b8da56d7700d61ae778
XF=0.3
read -r -a SPOTS <<<"$(node -p "require('./promo/spots.json').reels.find(r => r.id === '$REEL').spots.join(' ')")"
OUT="promo/out/reel-$REEL"; mkdir -p "$OUT"
inputs=(); vf=""; af=""; offset=0; prev_v="0:v"; prev_a="0:a"
for i in "${!SPOTS[@]}"; do
  s="${SPOTS[$i]}"; f="promo/out/$s/$s.mp4"
  [ -f "$f" ] || { echo "render $s first: promo/build.sh $s"; exit 1; }
  inputs+=(-i "/w/$f")
  dur=$(node -p "require('./promo/$s/spot.json').duration")
  if [ "$i" -gt 0 ]; then
    vf+="[$prev_v][$i:v]xfade=transition=fade:duration=$XF:offset=$offset[v$i];"
    af+="[$prev_a][$i:a]acrossfade=d=$XF[a$i];"
    prev_v="v$i"; prev_a="a$i"
  fi
  offset=$(node -p "$offset + $dur - $XF")
done
run() { MSYS_NO_PATHCONV=1 docker run --rm -v "$REPO:/w" -w /w "$FFMPEG" -hide_banner -loglevel error -y "$@"; }
if [ "${#SPOTS[@]}" -eq 1 ]; then
  # A one-spot reel (vigil's hero is a single cut, hero-37s): no joins, reuse its encodes.
  cp "promo/out/${SPOTS[0]}/${SPOTS[0]}.mp4" "$OUT/reel-$REEL.mp4"
  cp "promo/out/${SPOTS[0]}/${SPOTS[0]}-web.mp4" "$OUT/reel-$REEL-web.mp4"
else
  run "${inputs[@]}" -filter_complex "${vf}${af%;}" -map "[$prev_v]" -map "[$prev_a]" \
    -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -movflags +faststart -c:a aac -b:a 192k "/w/$OUT/reel-$REEL.mp4"
  run -i "/w/$OUT/reel-$REEL.mp4" -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k "/w/$OUT/reel-$REEL-web.mp4"
fi
# Every spot's frame 0 is its poster, so the reel's frame 0 is the first spot's poster.
cp "promo/out/${SPOTS[0]}/${SPOTS[0]}.jpg" "$OUT/reel-$REEL.jpg"
echo "reel → $OUT/reel-$REEL.mp4 ($(node -p "($offset + $XF).toFixed(1)") s)"
if [ "$PUBLISH" = 1 ]; then
  cp "$OUT/reel-$REEL-web.mp4" site/assets/vigil.mp4
  cp "$OUT/reel-$REEL.jpg" site/assets/poster.jpg
  echo "published → site/assets/vigil.mp4"
fi
