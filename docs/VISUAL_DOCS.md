# Visual docs: diagrams and screenshots that stay current

> 🧭 [vigil](../README.md) · [Features](../FEATURES.md) · [Roadmap](../ROADMAP.md) · [Tasks](../TASKS.md) · [Changelog](../CHANGELOG.md) · [Metrics](../METRICS.md) <!-- nav -->

Stale screenshots mislead, and diagrams nobody regenerates mislead worse. This recipe has CI rebuild both on every push to `main`. It embeds them in the README by name and path, and hands you a PR to review. Nothing is pushed to `main` directly.

Vigil checks for it with the **Visual Docs** best practice, and runs the recipe on itself: see the README's "Screenshots & diagrams" section and `.github/workflows/visual-docs.yml`.

## What vigil checks (`visual_docs`)

| State       | Meaning                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Healthy** | CI regenerates both screenshots and diagrams, and the README embeds them (by path or file name, or an inline ` ```mermaid ` block). |
| **Dormant** | Partial: assets exist but are static, only one of the two is in CI, or the README shows none of them.                               |
| **Missing** | None found.                                                                                                                         |

The check detects:

- **Diagrams:**
  - `*.mmd`, `*.mermaid`, `*.excalidraw`, `*.drawio`, `*.puml`, `*.d2` sources.
  - `*.excalidraw.svg/png` and `*.drawio.svg/png` renders.
  - Any image under a `diagrams/` or `architecture/` folder.
- **Screenshots:** images under a `screenshots/`, `screenshot/` or `screens/` folder. Playwright `-snapshots/` baselines, `__snapshots__/`, `node_modules/` and build output are ignored.
- **Automation (detail only):** a workflow whose file name contains `screenshot`, `diagram` or `visual`. An existing in-house screenshot pipeline in a generically named workflow also counts (ats-fill's `ci.yml` `screenshot-gallery` job, for example): the dashboard infers it from a screenshot-named spec or script (`tests/e2e/screenshots.spec.mjs`, `scripts/capture-screenshots.mjs`) plus a Playwright config plus any workflow, and `npm run showcase -- audit` reads the workflows for a Playwright or capture step that targets a screenshots spec, script or folder. A job that only uploads Playwright failure screenshots as an artifact doesn't count.
- **Brand automation (CLI, info only):** the audit lists workflows that generate store or brand assets (`store-assets`, promo tiles, icon/favicon/logo generation) as `brand automation: <workflow>`. It isn't scored and isn't a gap.
- **Pages folder (CLI):** besides `site/`, `pages/`, `showcase/` and `docs/`, the audit and `apply` treat `<path>/index.html` as the Pages site when a workflow uploads `<path>` with `actions/upload-pages-artifact`; `apply` adds the expand kit to nested pages under it too. `apply` names the product after the git remote (override with `--product <name>`).

**Scored** (since 2026-10-09) as one best practice, the same weight as the others. The panel grades each row:

| Row         | Pass                            | Partial     | Fail      | Scored | Fix                                                                                    |
| ----------- | ------------------------------- | ----------- | --------- | ------ | -------------------------------------------------------------------------------------- |
| Screenshots | `ci`                            | `static`    | `missing` | yes    | Recipe PR when the repo has no visual-docs workflow, otherwise `/promo <repo> refresh` |
| Diagrams    | `ci`                            | `static`    | `missing` | yes    | Same as screenshots                                                                    |
| Videos      | `tracked` in `promo/spots.json` | `untracked` | `missing` | no     | Handoff: `/promo <repo> audit`, then `spot <category>`                                 |
| Pages       | `deployed`                      | `orphaned`  | `missing` | no     | Handoff: `/promo <repo> publish`                                                       |

Two related checks:

- **`actions_pr_permission`**: scored only when a visual-docs or journeys workflow exists. When it's off, the handoff is `gh api -X PUT repos/<o>/<r>/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`.
- **`journeys`**: informational.

All three appear per repo as `visual_setup` in `/api/context`.

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
docker run --rm --ipc=host -v "$PWD:/app" -w /app mcr.microsoft.com/playwright:v1.63.0-noble bash -lc '
  set -e
  if [ -f package-lock.json ]; then npm ci; fi
  if [ -f playwright.visual-docs.config.ts ]; then npx playwright test -c playwright.visual-docs.config.ts; fi
  CONFIG=""; [ -f docs/diagrams/mermaid.config.json ] && CONFIG="-c docs/diagrams/mermaid.config.json"
  for f in docs/diagrams/*.mmd; do
    [ -e "$f" ] || continue
    echo "{\"args\":[\"--no-sandbox\"]}" > /tmp/puppeteer.json
    npx -y @mermaid-js/mermaid-cli@12.0.0 -p /tmp/puppeteer.json $CONFIG -b white -i "$f" -o "${f%.mmd}.svg"
  done
  node scripts/visual-docs-readme.mjs
'
```

Like the workflow, it skips `npm ci` without a lockfile and the screenshots without the Playwright config, so diagram-only repos work too.

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
