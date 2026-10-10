# Visual docs: finishing the adoption

This PR was opened by [vigil](https://github.com/nitsuah/vigil) from its Visual Docs check. It adds the CI plumbing. Whoever picks it up (a person or an agent) finishes the repo-specific parts. The contract is [showcase/STANDARD.md](https://github.com/nitsuah/.github/blob/main/showcase/STANDARD.md). The full recipe is [vigil docs/VISUAL_DOCS.md](https://github.com/nitsuah/vigil/blob/main/docs/VISUAL_DOCS.md).

## What this PR adds

- `.github/workflows/visual-docs.yml` renders `docs/diagrams/*.mmd` to SVG, runs `playwright.visual-docs.config.ts` if present, rewrites the README block, and opens a bot PR. It never pushes to the default branch.
- `scripts/visual-docs-readme.mjs` builds the `<!-- visual-docs:start/end -->` README block.
- `docs/diagrams/architecture.mmd` (a starter) and `mermaid.config.json`.
- README markers.

## To finish

1. **Turn on bot PRs** (repo admin, once):

   ```bash
   gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow -F can_approve_pull_request_reviews=true
   ```

   Or go to Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests". Without it, the workflow can't open its PR. The command changes only that flag and leaves the repo's default workflow permissions alone.

2. **Diagrams:** replace the starter `architecture.mmd` with the repo's real moving parts: services, MCP, cron, extension ↔ backend.
3. **Screenshots** (web apps only):
   - Add `playwright.visual-docs.config.ts` and specs that write `docs/screenshots/<feature-id>.png`. The feature id comes from `promo/spots.json`, so `/promo` links them automatically.
   - Use mocked APIs, a frozen clock, a fixed viewport, and demo data only.
   - **If the repo has nightly journeys** (`tests/journeys/` or `e2e/journeys/`), don't add a second suite. Tag journey steps `{ docs: '<feature id>' }`, add a `capture:screenshots` script, and change the workflow's "Capture screenshots" step to `run: npm run capture:screenshots`. The step as shipped only runs `playwright.visual-docs.config.ts`, so without that edit CI never regenerates them. fire's `visual-docs.yml` is the reference.
4. **Run it locally in Docker** (the command is in VISUAL_DOCS.md) and commit the SVG/PNG output.

## What stays a handoff (not CI)

Videos, the hero reel, vertical shorts, brand and the Pages site need a skill run: `/promo <repo> refresh`, `/promo <repo> spot <category>`, `/promo <repo> publish`. vigil's Best Practices panel shows the exact command for each row.
