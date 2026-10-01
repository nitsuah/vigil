# Tasks

> 🧭 [vigil](./README.md) · [Features](./FEATURES.md) · [Roadmap](./ROADMAP.md) · **Tasks** · [Changelog](./CHANGELOG.md) · [Metrics](./METRICS.md) <!-- nav -->

updated: 2026-10-01

## In Progress

## Todo

### P0 - Critical

_None open — P0 hardening shipped in #225/#226 (see CHANGELOG)._

### P1 - High

_None open — see CHANGELOG for the #221–#233 work._

### P2 - Medium

- [ ] Grow the cross-repo relationship map from real evidence.
  - Priority: P2
  - Next: (1) seed the real edges (confirm or reject what agents propose); (2) an Obsidian import that reads relationship lines from the vault and posts them to `POST /api/relationships` as proposals; (3) a PMO audit / agent pass that proposes edges from real evidence (package.json deps, MCP/API URLs in config, deploy scripts); (4) surface "what depends on this repo" on the repo details panel.
  - Acceptance Criteria: the map reflects real usage for every tracked repo, and agents consult `get_relationships` before cross-repo changes.

- [ ] **[2027-Q1]** 3D / click-to-detail view of the relationship map, once the 2D map's data is right.
  - Priority: P3

### DB & backend scaling

_None open. The rate-limiter identity item is under Done._

### P3 - Exploratory

- [ ] Roll the visual-docs recipe out to tracked web-app repos, then score it.
  - Priority: P3
  - Context: `visual_docs` shipped informational-only (excluded via `INFORMATIONAL_PRACTICES` in `lib/visual-docs.ts`) so adding it didn't drop every repo's best-practices ratio at once. See docs/VISUAL_DOCS.md.
  - Acceptance Criteria: recipe adopted (workflow + script + README markers) in nitsuah-io, darkmoon, skyview, farm-3j, games; then remove `visual_docs` from `INFORMATIONAL_PRACTICES`, update the Health Score table in FEATURES.md, and add a Fix-PR template so the Best Practices panel can open the adoption PR in one click.

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

- [x] Chat-driven doc editing (TASKS/ROADMAP/FEATURES), stages 1–4: `parseTaskOperationProposal` in `lib/repo-chat.ts`, `POST /api/repos/[name]/tasks`. Stage 3 shipped in #253. See FEATURES.
- [x] Cross-repo relationship map foundation: `repo_relationships`, `/api/relationships`, `get_relationships` / `propose_relationship` MCP tools, and the PMO map (#248, #249, #252). See FEATURES.
- [x] Trend endpoint keyed on `full_name` instead of the short `name`: `app/api/repo-details/[name]/trend/route.ts` takes `fullName` (#253).
- [x] Stable rate-limiter identity: `session.userId` is the GitHub numeric id (`lib/auth-session.ts`, #243/#253), so a session with no email still hits the shared-key budget.

<!--
AGENT INSTRUCTIONS:
1. Keep active items in In Progress and P1-P3 sections.
2. Keep task bullets short and scannable.
3. Move finished work into FEATURES.md and leave a one-line entry under Done (the parser requires the section).
-->
