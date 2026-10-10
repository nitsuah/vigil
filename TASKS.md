# Tasks

> 🧭 [vigil](./README.md) · [Features](./FEATURES.md) · [Roadmap](./ROADMAP.md) · **Tasks** · [Changelog](./CHANGELOG.md) · [Metrics](./METRICS.md) <!-- nav -->

updated: 2026-10-09

## In Progress

## Todo

### P0 - Critical

_None open — P0 hardening shipped in #225/#226 (see CHANGELOG)._

### P1 - High

#### Epic: Visual best practices (from stash SOTU 2026-W41)

Two portfolio initiatives moved here from stash: (1) CI-generated diagrams and Playwright screenshots, committed and embedded in each README, as a scored check plus a reusable CI recipe; (2) a portfolio showcase, with a Pages site and a short `/brag` spot per product (vigil, vhs, skyview and nitsuah-io first; ats-fill held until its UI scrub). The building blocks are `/promo` (spots, reels, Pages), `/journeys` (low-inference nightly QA), and `npm run showcase -- audit|apply`. Vigil scores what it can verify, opens a PR where CI alone is enough, and hands off the rest with the exact skill command.

- [x] Score `visual_docs` and add per-row fix PRs and handoffs.
  - Priority: P1
  - Done 2026-10-09:
    - Healthy needs CI-generated screenshots _and_ diagrams embedded in the README; anything less is dormant.
    - Videos and Pages are graded per row (pass, partial or fail) but not scored.
    - The screenshots and diagrams rows open the recipe PR, which now includes `docs/VISUAL_DOCS_HOWTO.md`, when the repo has no visual-docs workflow; otherwise they hand off to `/promo`. Videos and Pages always hand off.
- [x] Add the `actions_pr_permission` check.
  - Priority: P1
  - Done 2026-10-09: reads `can_approve_pull_request_reviews` and is scored only when a visual-docs workflow exists. When the setting is off, the handoff shows the exact `gh api -X PUT …` command.
- [x] Add an informational `journeys` practice.
  - Priority: P1
  - Done 2026-10-09: healthy is a journeys workflow plus `tests/journeys/` or `e2e/journeys/`; dormant is journeys with no nightly.
- [x] Add `visual_setup` to `/api/context`.
  - Priority: P1
  - Done 2026-10-09: per repo for the portfolio and single-repo contexts, so stash's SOTU can render its Visual setup table without doing it by hand.
- [ ] Journeys in vigil, beyond detection (see the 2026-10-09 journeys brief).
  - Priority: P1
  - Context:
    - Read `bot/journeys` `metrics/<month>.jsonl` (last run, flaky count, `@feature` coverage) and the open `bot:journey` / `bot:review` counts. Show them on repo details, with a PMO rollup that flags red nightlies.
    - An owner-only "Run journeys now" (`workflow_dispatch`).
    - An "Enable nightly journeys" scaffold PR: caller workflow, config, `journey.js`, `test:journeys`, `.gitignore`. Vigil creates the labels through the API.
    - Agent-queued `review`, `adopt|add`, `fix` runs with the SKILL.md mode as the prompt.
  - Acceptance Criteria: a repo with no journeys can be scaffolded from vigil. Then promote `journeys` out of `INFORMATIONAL_PRACTICES`.
- [ ] Showcase audit: features no journey covers, plus "features linked" on the dashboard.
  - Priority: P1
  - Context:
    - `npm run showcase -- audit` lists user-visible spots.json features (not `visual: none`) that no journey's `@feature:` tag covers.
    - The dashboard can't read spots.json from the file list, so "features linked" (with visual ÷ visual features) is CLI-only today.
  - Acceptance Criteria: sync reads `promo/spots.json` + FEATURES.md and stores the ratio on the `visual_docs` row; it's graded but not scored.
- [ ] Diagrams-only recipe job for repos with no UI.
  - Priority: P1
  - Context: the recipe already renders `.mmd` without a Playwright config. Add an Excalidraw export step, and a diagrams-only fix PR that doesn't add screenshot plumbing to a CLI/MCP repo.
- [ ] Showcase rollout: Pages + one `/brag` spot each for vhs, skyview and nitsuah-io (vigil is done; ats-fill held).
  - Priority: P1
  - Context: user-run via the handoffs on each repo's Visual Docs rows (`/promo <repo> audit`, then `spot`, then `publish`). Turn Actions PRs on for vigil, fire and motor-pool first.
- [ ] Follow-ups outside vigil.
  - Priority: P1
  - Context:
    - stash: `agent/scripts/sotu.py` reads `visual_setup` from `/api/context` for the Visual setup table (filed as a stash task, not edited from here).
    - nitsuah/.github: add the Actions PR setting to `/promo`'s first-run checklist (`skills/promo/SKILL.md`).

- [ ] Tasks card shows the lowest-priority group first and hides the rest (#275).
  - Priority: P1
  - Context: found by the journeys review pass, 2026-10-09. `TasksSection.tsx` sorts subsections and then calls `.reverse()`.

### P2 - Medium

- [ ] Journeys review findings, 2026-10-09: confirmed relationships listed under "Needs review" (#276), relationship graph edges cross node labels (#277), Pages site never links the live dashboard (#279).
  - Priority: P2

- [ ] Fold the visual-docs screenshots into the journeys (`{ docs: '<feature id>' }` steps + a `capture:screenshots` script), so one suite produces both. fire's `visual-docs.yml` is the reference.
  - Priority: P2

- [ ] Grow the cross-repo relationship map from real evidence.
  - Priority: P2
  - Next: (1) seed the real edges (confirm or reject what agents propose); (2) an Obsidian import that reads relationship lines from the vault and posts them to `POST /api/relationships` as proposals; (3) a PMO audit / agent pass that proposes edges from real evidence (package.json deps, MCP/API URLs in config, deploy scripts); (4) surface "what depends on this repo" on the repo details panel.
  - Acceptance Criteria: the map reflects real usage for every tracked repo, and agents consult `get_relationships` before cross-repo changes.

- [ ] **[2027-Q1]** 3D / click-to-detail view of the relationship map, once the 2D map's data is right.
  - Priority: P3

### DB & backend scaling

_None open. The rate-limiter identity item is under Done._

### P3 - Exploratory

- [ ] Visuals for the 21 user-visible features with no screenshot or spot.
  - Priority: P3
  - Context: the 2026-10-08 /promo run left 21 of 57 visual features uncovered (`npm run showcase -- audit .` lists them). Most are cards lower in the expanded repo panel (Testing, Vulnerabilities, Metrics, health sparkline, stale-review badge, Org badge) or AI actions (Suggest, Improve, Summary, Diff).
  - Acceptance Criteria: visual-docs shots named after the feature ids (an expanded-panel full-page shot, the Improve diff, a Suggest result, the guided tour) and the audit at ≥ 50/57.

- [ ] Showcase audit fixes from the first full /promo run (2026-10-08).
  - Priority: P3
  - Context: the coverage column counts `"visual": "none"` exemptions as covered (vigil read 180/201; the real figure is 36/57). Run against a mounted worktree, the CLI sees no git history (`.git` is a pointer to a host path), so it can't check spot staleness, and it labels the repo `target`.
  - Acceptance Criteria: the table shows `with visual / visual features` plus the exempt count; `audit` accepts `--features-changed <date>` (or reads it from the main checkout); the row label comes from `spots.json` `product`.

- [ ] Per-user API tokens for MCP / `/api/context`.
  - Priority: P3
  - Context: today a single shared `MCP_API_KEY` (Netlify env) is the only machine credential — fine while vigil has one owner (see docs/MCP.md). Once other people use vigil, each needs their own revocable key scoped to the repos they can access (a bearer key currently means full-portfolio admin).
  - Acceptance Criteria: `api_tokens` table storing only a hash, with `user_id`, `name`, `created_at`, `last_used_at`, `revoked_at`; tokens resolve to the owning user's `getAccessibleRepoIds` scope rather than full portfolio; a small Settings panel to create (shown once), list, and revoke; the shared `MCP_API_KEY` keeps working as the admin key.

- [ ] Add zombie-branch detection.
  - Priority: P3
  - Context: the UI does not yet surface stale long-lived branches.
  - Acceptance Criteria: stale branches are detected and flagged in the interface with a bulk-action dialog to delete selected branches (confirmation step, scaling across all repos); includes a "clean up hidden repos" action to safely purge DB cache for hidden/removed repos with a confirmation step noting the GH source is untouched.
  - Status: 🟡 PARTIAL (PMO audit 2026-09-24) — detection exists (`ZombieBranch` in `lib/github/repos.ts`, `zombie_branch_count` in `lib/db.ts`) and the count renders in `RepoTableRow.tsx` / `MobileRepoCard.tsx`. The bulk-delete dialog and the "clean up hidden repos" action from the acceptance criteria are not built yet.

- [ ] Add a dark and light mode toggle.
  - Priority: P3
  - Context: theme preferences are still not user-configurable.
  - Acceptance Criteria: the UI supports a persistent theme toggle.

- [ ] **[2027-Q1]** Add technical-debt trending (velocity scoring + trending shipped in PRs #200/#204).
  - Priority: P3
  - Context: commit frequency and PR merge time are captured but not yet trended over time.
  - Acceptance Criteria: a trend chart shows velocity and technical-debt signals over rolling quarters.
  - Status: 🟡 PARTIAL — velocity score (PR #200) via `calculateVelocityScore` in `lib/repo-signals.ts`; trending (PR #204) via a new `repo_snapshots` table recorded per sync (commit frequency, PR merge time, health score, open PRs, LOC), `GET /api/repo-details/[name]/trend`, and a health-score sparkline in `RepositoryStatsSectionStatic`. Technical-debt trending is still open (ROADMAP.md Portfolio Intelligence Batch note), so this stays unchecked.

- [ ] Agent session receipts.
  - Priority: P3
  - Context: new idea (2026-08-28) — AI Summaries describe a repo's state; nothing describes what an agent _did_ to it recently. Picking up mid-portfolio work today means reconstructing activity from commit messages and PR history by hand across every repo.
  - Acceptance Criteria: a lightweight per-repo activity log surfaced in both the chat panel and the PMO view, built on the existing dispatch/queue seams rather than a new schema — persist a `sessionId` (correlating with the `motorPoolSessionId` already returned by `motorPoolBridge.dispatch()` in `lib/agent-bridge.ts`), a `filesTouched` list, and a `skipReason` string (distinct from the `TaskQueueItem.error` field in `app/api/agent/tasks/route.ts`, which represents failures, not deliberate skips) alongside each task's existing `result`/`status` fields; commits and PRs opened/merged are sourced from GitHub data already synced via `lib/github/prs.ts`, no new write path required.

## Done

_Condensed, one line per item. Full detail lives in FEATURES.md and CHANGELOG.md. The section must stay, because vigil's own TASKS parser expects Done / In Progress / Todo._

- [x] Done 2026-10-09: `visual_docs` scored (recipe-adoption P3 closed by the visual best-practices epic above).
- [x] Done 2026-09-28: Chat-driven doc editing (TASKS/ROADMAP/FEATURES), stages 1–4: `parseTaskOperationProposal` in `lib/repo-chat.ts`, `POST /api/repos/[name]/tasks`. Stage 3 shipped in #253. See FEATURES.
- [x] Done 2026-09-27: Cross-repo relationship map foundation: `repo_relationships`, `/api/relationships`, `get_relationships` / `propose_relationship` MCP tools, and the PMO map (#248, #249, #252). See FEATURES.
- [x] Done 2026-09-28: Trend endpoint keyed on `full_name` instead of the short `name`: `app/api/repo-details/[name]/trend/route.ts` takes `fullName` (#253).
- [x] Done 2026-09-28: Stable rate-limiter identity: `session.userId` is the GitHub numeric id (`lib/auth-session.ts`, #243/#253), so a session with no email still hits the shared-key budget.

<!--
AGENT INSTRUCTIONS:
1. Keep active items in In Progress and P1-P3 sections.
2. Keep task bullets short and scannable.
3. Move finished work into FEATURES.md and leave a one-line entry under Done (the parser requires the section).
-->
