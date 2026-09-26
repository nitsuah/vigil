# Visual docs: diagrams and screenshots that stay current

Stale screenshots mislead, and diagrams nobody regenerates mislead worse. This recipe has CI rebuild both on every push to `main`. It embeds them in the README by name and path, and hands you a PR to review. Nothing is pushed to `main` directly.

Vigil checks for it with the **Visual Docs** best practice, and runs the recipe on itself: see the README's "Screenshots & diagrams" section and `.github/workflows/visual-docs.yml`.

## What vigil checks (`visual_docs`)

| State       | Meaning                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Healthy** | The README embeds at least one detected diagram or screenshot (by path or file name), or has an inline ` ```mermaid ` block. |
| **Dormant** | Diagrams or screenshots exist, but the README shows none of them.                                                            |
| **Missing** | None found.                                                                                                                  |

The check detects:

- **Diagrams:**
  - `*.mmd`, `*.mermaid`, `*.excalidraw`, `*.drawio`, `*.puml`, `*.d2` sources.
  - `*.excalidraw.svg/png` and `*.drawio.svg/png` renders.
  - Any image under a `diagrams/` or `architecture/` folder.
- **Screenshots:** images under a `screenshots/`, `screenshot/` or `screens/` folder. Playwright `-snapshots/` baselines, `__snapshots__/`, `node_modules/` and build output are ignored.
- **Automation (detail only):** a workflow whose file name contains `screenshot`, `diagram` or `visual`.

**Not scored yet.** The check shows in the Best Practices panel with a "(not scored)" tag and is excluded from the health score (`INFORMATIONAL_PRACTICES` in `lib/visual-docs.ts`). Promote it once the recipe has rolled out across the portfolio. Until then, adding it would drop every repo's best-practices ratio at once.

## Adopt it in a repo

1. **Copy two files** from vigil:
   - [`scripts/visual-docs-readme.mjs`](../scripts/visual-docs-readme.mjs), zero dependencies.
   - [`templates/.github/workflows/visual-docs.yml`](../templates/.github/workflows/visual-docs.yml), saved as `.github/workflows/visual-docs.yml`.
2. **Add diagrams** as Mermaid sources in `docs/diagrams/<name>.mmd`. Optionally add `docs/diagrams/mermaid.config.json`; vigil's uses the default theme and `htmlLabels: false`, so labels aren't clipped and read in both GitHub themes. Excalidraw works too: commit `<name>.excalidraw.svg` (export with "embed scene") and the block links it.
3. **Add screenshots** (web apps) with `playwright.visual-docs.config.ts` plus specs that `page.screenshot({ path: 'docs/screenshots/<name>.png' })`. Keep them deterministic so the bot PR only changes when the UI does:
   - Mock the API (vigil's `e2e/visual-docs/screenshots.spec.ts` needs no database).
   - Freeze the clock (`page.clock.setFixedTime`).
   - Fix the viewport and color scheme.
   - Hide dev overlays.
4. **Mark the README** where the gallery should go:

   ```markdown
   ## Screenshots & diagrams

   <!-- visual-docs:start -->
   <!-- visual-docs:end -->
   ```

   Without markers, the script appends a section at the end.

5. **Enable bot PRs** once: Settings → Actions → General → _Allow GitHub Actions to create and approve pull requests_.

Run it locally the same way CI does (Docker keeps the fonts identical):

```bash
docker run --rm --ipc=host -v "$PWD:/app" -w /app mcr.microsoft.com/playwright:v1.63.0-noble bash -lc "npm ci && npx playwright test -c playwright.visual-docs.config.ts && node scripts/visual-docs-readme.mjs"
```

`node scripts/visual-docs-readme.mjs --check` exits 1 when the README block is out of date. It can be used as a CI gate.

## How the README block is built

`scripts/visual-docs-readme.mjs` scans `docs/diagrams/*.{svg,png}` and `docs/screenshots/*.{png,jpg,jpeg,webp,gif}` in name order. It rewrites everything between the markers:

- one bold title per file, taken from the file name (`repo-details.png` becomes "Repo details");
- a link to the file's path, plus a link to the diagram source when one with the same stem exists;
- the embedded image.

Rename a file and the README follows on the next run. Override the locations with `README`, `DIAGRAMS_DIR` and `SCREENSHOTS_DIR`.

## Notes

- PRs opened with `GITHUB_TOKEN` don't trigger other workflows. That's fine for a docs-only change; use a PAT or GitHub App token in `create-pull-request` if you need CI on it.
- Screenshots come from `next dev` on the runner. Font or rendering differences between machines mean screenshots taken locally outside Docker will differ from CI.
