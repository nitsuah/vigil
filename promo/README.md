# Promo spots

> 🧭 [vigil](../README.md) · [Features](../FEATURES.md) · [Roadmap](../ROADMAP.md) · [Tasks](../TASKS.md) · [Changelog](../CHANGELOG.md) · [Metrics](../METRICS.md) <!-- nav -->

This folder holds reproducible launch videos for Vigil: 21-second feature spots, a vertical short, and a hero reel joined from the spots. Each spot is rendered from the **real app**. `capture.spec.ts` runs `next dev`, answers every `/api` call from a fictional demo portfolio (`demo-seed.ts`, owner `acme`), and screenshots the real dashboard, PMO grid and relationship map. Those captures are then animated frame by frame in a browser, scored with synthesized music, and encoded with ffmpeg.

Everything runs in Docker. It needs no database, secrets or GitHub access.

## Spots

| Spot | Length | Covers |
|---|---|---|
| `health-17s` | 17 s | Health grades, docs / best practices / community standards, one-click fix PR |
| `work-16s` | 16 s | Cross-repo open work (most urgent first), relationship map |
| `ai-14s` | 14 s | Claude over MCP ("what should I work on next?"), per-repo chat proposing a doc edit as a PR |
| `hero-37s` | 37 s | Every scene once: one hook, one reveal, one outro. The landing-page hero and the YouTube cut |
| `health-17s-vert` | 24.5 s, 9:16 | Narrated, captioned short of the health story for Shorts / Reels / TikTok |
| `brag-30s` | 30 s | The original all-in-one launch spot, and the base every cut reuses |

Feature spots play only their own scenes: no shared reveal, a 2.5 s outro, and the Vigil wordmark from frame 0 (a corner mark when the spot opens on a feature scene). The hero is one continuous cut (`hero-37s`, `reels[hero]`) rather than the spots joined end to end, so the intro and outro play once. Which features each spot shows is recorded in `spots.json`, and `npm run showcase -- audit .` reports coverage.

All spots share one composition: `brag-30s/compose.html` and `brag-30s/synth.py` are written in brag-30s's timeline, and a spot with `"base": "brag-30s"` in its `spot.json` lists any subset of those scenes (`hook`, `reveal`, `inspect`, `fix`, `prioritize`, `connect`, `ask`, `outro`, plus `chat`, an `extraScenes` entry the 30 s base itself doesn't play) with its own start and end times. Each scene's motion and sound cues are mapped linearly into its slot, and chapter numbers follow the spot's order. Per-spot copy: `hookQuestion`, `revealLine`, `outroFeats`, `outroChips`. A new cut is a new `spot.json` and `share-copy.txt`.

A vertical spot (`"format": "vertical"`, `width`/`height`) has its own `compose.html`, a 1080×1920 shell that plays the base composition (staged as `inner.html`) full width, with the brand above and captions below. Its `narration` lines are spoken by Kokoro (`promo/tts/narrate.sh <spot>` writes `vo/<id>.wav` and prints each line's duration for `dur`) and mixed over the music by `tts/mix.py`. The wavs are committed, so `build.sh` stays offline.

## Re-run

```bash
promo/build.sh health-17s                       # full render of one spot (~5 min)
promo/build.sh health-17s --stills 2.6,5.8,9.9  # render just a few frames to check a change
promo/sheet.sh health-17s                       # contact sheet of those stills
promo/build.sh health-17s --audio               # re-synth music/SFX and remux only
promo/build.sh health-17s --recapture           # re-shoot the app (after UI or seed changes)
promo/build.sh health-17s --publish             # also copy it to site/assets/health-17s.mp4/.jpg
promo/reel.sh hero --publish                    # join the spots into the hero reel → site/assets/vigil.mp4
promo/tts/narrate.sh health-17s-vert                # regenerate a vertical spot's narration
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

- `reel.sh` joins spots into a reel with 0.3 s crossfades (pinned ffmpeg image).
- `spot-config.js` merges a spot's `spot.json` over its `base`.
- `tts/` holds the narration image (Kokoro via Hyperframes), `narrate.sh` and `mix.py`.
- `build.sh` runs on the host. It builds the `vigil-promo` image and runs `pipeline.sh` inside it.
- `pipeline.sh` runs the steps: capture → frames → audio → encode.
- `Dockerfile` bundles Playwright/Chromium, ffmpeg, numpy/scipy and the app's dependencies.
- `capture.spec.ts` / `playwright.capture.config.ts` / `demo-seed.ts` handle the real-app capture.
- `render.js` is the frame renderer.
