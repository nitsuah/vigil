#!/bin/sh
# Runs inside the promo image (see build.sh). /repo is the repo (read-only),
# /out is promo/out on the host.
#   pipeline.sh <spot> full            capture (if needed) → frames → audio → mp4
#   pipeline.sh <spot> stills "1,2.5"  capture (if needed) → stills only
#   pipeline.sh <spot> audio           audio only (+ remux if frames exist)
set -eu
SPOT="$1"; MODE="${2:-full}"; TIMES="${3:-}"
DIR="/repo/promo/$SPOT"; W="/out/$SPOT"
[ -f "$DIR/spot.json" ] || { echo "no such spot: promo/$SPOT"; exit 1; }
mkdir -p "$W"

if [ "${RECAPTURE:-0}" = 1 ] || [ ! -f /out/capture/capture.json ]; then
  echo "== capture (real app, demo portfolio)"
  rsync -a --delete --exclude node_modules --exclude .next --exclude promo/out --exclude .git /repo/ /work/
  rm -rf /out/capture
  cd /work/promo && PROMO_OUT=/out/capture npx playwright test -c playwright.capture.config.ts
  cd /
fi

# compose.html resolves crops/… relative to itself, so stage it next to a copy of the crops.
cp "$DIR/compose.html" "$W/compose.html"
rm -rf "$W/crops"; cp -r /out/capture/crops "$W/crops"

if [ "$MODE" = stills ]; then
  echo "== stills $TIMES"
  NODE_PATH=/work/node_modules node /repo/promo/render.js "$SPOT" "$TIMES"
  echo "stills → promo/out/$SPOT/stills/"; exit 0
fi

if [ "$MODE" = full ]; then
  echo "== frames"
  NODE_PATH=/work/node_modules node /repo/promo/render.js "$SPOT"
fi

echo "== audio"
python3 "$DIR/synth.py" "$DIR/spot.json" "$W/audio-raw.wav"
ffmpeg -hide_banner -loglevel error -y -i "$W/audio-raw.wav" \
  -af loudnorm=I=-14:TP=-1.5:LRA=11:linear=true -ar 44100 "$W/audio.wav"

[ -d "$W/frames" ] || { echo "no frames yet; run full first"; exit 1; }
echo "== encode"
FPS=$(node -p "require('$DIR/spot.json').fps")
POSTER=$(node -p "const s=require('$DIR/spot.json'); String(Math.round(s.poster*s.fps)).padStart(4,'0')")
# Poster frame doubles as frame 0 so every platform's thumbnail shows it;
# replaced (not added) so duration and audio sync stay the same.
[ -f "$W/frames/f0000.orig.png" ] || cp "$W/frames/f0000.png" "$W/frames/f0000.orig.png"
cp "$W/frames/f$POSTER.png" "$W/frames/f0000.png"
ffmpeg -hide_banner -loglevel error -y -framerate "$FPS" -i "$W/frames/f%04d.png" -i "$W/audio.wav" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest "$W/$SPOT.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$W/frames/f$POSTER.png" -q:v 2 "$W/$SPOT.jpg"
# Smaller cut for the GitHub Pages hero.
ffmpeg -hide_banner -loglevel error -y -i "$W/$SPOT.mp4" -c:v libx264 -preset slow -crf 27 \
  -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k "$W/$SPOT-web.mp4"
cp "$DIR/share-copy.txt" "$W/share-copy.txt"
# Landing-page copies of the UI captures (the 2x PNGs are ~1 MB each).
mkdir -p /out/capture/web
for f in /out/capture/crops/*.png; do
  ffmpeg -hide_banner -loglevel error -y -i "$f" -vf "scale=iw/2*1.25:-1" -quality 82 "/out/capture/web/$(basename "${f%.png}").webp"
done
ffmpeg -hide_banner -i "$W/audio.wav" -af ebur128 -f null - 2>&1 | grep -A1 "Integrated loudness" | tail -1 | sed 's/^ */loudness: /'
echo "done → promo/out/$SPOT/$SPOT.mp4"
