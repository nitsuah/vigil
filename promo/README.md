# Promo spots

> 🧭 [vigil](../README.md) · [Features](../FEATURES.md) · [Roadmap](../ROADMAP.md) · [Tasks](../TASKS.md) · [Changelog](../CHANGELOG.md) · [Metrics](../METRICS.md) <!-- nav -->

This folder holds reproducible launch videos for Vigil. Each spot is rendered from the **real app**. `capture.spec.ts` runs `next dev`, answers every `/api` call from a fictional demo portfolio (`demo-seed.ts`, owner `acme`), and screenshots the real dashboard, PMO grid and relationship map. Those captures are then animated frame by frame in a browser, scored with synthesized music, and encoded with ffmpeg.

Everything runs in Docker. It needs no database, secrets or GitHub access.

## Re-run

```bash
promo/build.sh                                  # full render of brag-22s (~4 min)
promo/build.sh brag-22s --stills 2.6,5.8,9.9    # render just a few frames to check a change
promo/build.sh brag-22s --audio                 # re-synth music/SFX and remux only
promo/build.sh brag-22s --recapture             # re-shoot the app (after UI or seed changes)
promo/build.sh brag-22s --publish               # also update site/assets/ (landing page)
```

Output goes to `promo/out/` (gitignored):
- `<spot>/<spot>.mp4` is the full-quality video. Frame 0 is the poster.
- `<spot>/<spot>.jpg` is the poster.
- `<spot>/<spot>-web.mp4` is the smaller cut used by the landing page.
- `<spot>/share-copy.txt` is the post text.
- `capture/crops/*.png` are the 2x UI captures; `capture/web/*.webp` are the landing-page copies.

Requirements: Docker Desktop running, plus network access for Google Fonts and the first image build.

## Tweak

| To change… | Edit |
|---|---|
| Scene timing, poster frame, click and typing times | `<spot>/spot.json`. The visuals and audio both read it. |
| What's on screen, motion, copy | `<spot>/compose.html`. `window.render(t)` is a pure function of time. |
| Music and sound effects | `<spot>/synth.py` (120 BPM, D minor, cuts on the bar) |
| Repos, grades, tasks and relationships shown | `demo-seed.ts`, then `--recapture` |
| Which UI pieces get captured | `capture.spec.ts`, then `--recapture` |
| Post text | `<spot>/share-copy.txt` |

## Files

- `build.sh` runs on the host. It builds the `vigil-promo` image and runs `pipeline.sh` inside it.
- `pipeline.sh` runs the steps: capture → frames → audio → encode.
- `Dockerfile` bundles Playwright/Chromium, ffmpeg, numpy/scipy and the app's dependencies.
- `capture.spec.ts` / `playwright.capture.config.ts` / `demo-seed.ts` handle the real-app capture.
- `render.js` is the frame renderer.
