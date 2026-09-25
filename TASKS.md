# Tasks

> 🧭 [vigil](./README.md) · [Features](./FEATURES.md) · [Roadmap](./ROADMAP.md) · **Tasks** · [Changelog](./CHANGELOG.md) · [Metrics](./METRICS.md) <!-- nav -->

updated: 2026-09-24

## In Progress

## Todo

### P0 - Critical

_None open — P0 hardening shipped in #225/#226 (see CHANGELOG)._

### P1 - High

_None open — see CHANGELOG for the #221–#233 work._

### P2 - Medium

- [ ] **[2027-Q1]** Chat-driven doc editing (TASKS/ROADMAP/FEATURES) — stage 3 remaining.
  - Priority: P2
  - Context: the per-repo chat panel (PR #196) only answered questions before this branch — it rebuilt context and replied, but couldn't act.
  - Acceptance Criteria: broken into stages — (1) chat can propose a specific, diffable edit to one doc file and show it inline before applying; (2) accepting the proposal opens a PR via the existing fix-doc PR flow rather than writing directly; (3) the chat can check an item off in TASKS.md or move it to FEATURES.md when the user confirms it's shipped, referencing the same parser the dashboard already uses so state never diverges from what's rendered elsewhere; (4) before calling `createPrForFile`, the caller-supplied target path must be validated against the approved doc list (TASKS.md/ROADMAP.md/FEATURES.md, matching the existing `TARGET_PATHS` mapping) — never pass a chat-supplied path straight through unchecked.
  - Status: stages (1), (2), and (4) ✅ SHIPPED — `parseDocEditProposal` in `lib/repo-chat.ts` extracts a fenced ` ```proposal``` ` JSON block from the assistant's reply; `RepoChatPanel` renders it as an inline card with Apply/Dismiss; Apply routes the proposed content into the existing preview-and-PR modal (`onApplyProposal` in `app/page.tsx`) rather than writing directly; `fix-doc`'s `TARGET_PATHS` validation (already hardened in this branch) covers the PR path. Stage (3) — checking off/moving items directly from chat — still open.

- [ ] **[2027-Q1]** Upgrade cross-repo dependency mapping to the 3D / click-to-detail graph (2D SVG graph shipped in PR #204).
  - Priority: P2
  - Context: agent-board, bb-mcp, nitsuah-io, and vigil share overlapping stacks and could benefit from surfaced cross-repo links.
  - Acceptance Criteria: the dashboard shows inferred or declared connections between related repos and surfaces shared-stack signals; visualized as an interactive 3D graph with filter and click-to-detail interactions.
  - Status: 🟡 PARTIAL (PR #204) — `GET /api/dependencies` infers connections from shared topics + primary language; rendered as a collapsible SVG graph + connection list (`DependencyGraph.tsx`) on the dashboard. The 3D/click-to-detail visualization from the original acceptance criteria is not implemented — current graph is 2D SVG.

- [ ] Thread `full_name` through to the trend endpoint instead of matching by short `name`.
  - Priority: P2
  - Context: flagged by CodeRabbit on PR #204 (2026-09-09) — `GET /api/repo-details/[name]/trend` matches `repos.name`, which is ambiguous if two tracked repos across different owners share a short name. `repo.full_name` is already available at every call site (`RepoTableRow.tsx`, `MobileRepoCard.tsx`) but isn't threaded through `ExpandableRow` -> `RepositoryStatsSectionStatic` -> the trend fetch URL. Deferred rather than rushed since it touches three component layers.
  - Acceptance Criteria: the trend route (and its callers) key on `full_name` or `repo_id`, not the bare `name` column; add a regression test with two same-named repos under different owners.

### DB & backend scaling

- [ ] Give every authenticated session a stable rate-limiter identity, not just `session.user.email`.
  - Priority: P2
  - Context: flagged by CodeRabbit on PR #211 (2026-09-11) — the entire shared-key reservation block in `app/api/repos/[name]/chat/route.ts` is gated on `session?.user?.email`. GitHub's OAuth profile can return a null email (an account with no public/verified email), in which case that gate is skipped entirely and the request proceeds through `generateAIContent` with **no shared-key rate limiting or budget at all** — a full bypass, not just a narrow edge case. Confirmed this gate predates PR #211 (the original process-local-`Map` code had the identical `if (session?.user?.email)` condition), so it's a pre-existing gap PR #211 didn't introduce — not fixed inline because it touches `auth.ts`/session-shape internals (does NextAuth's JWT session reliably expose a stable non-email id like `token.sub` on `session.user`? not currently wired up) and deserves its own scoped change + tests rather than a rushed edit alongside an already-large rate-limiter PR.
  - Acceptance Criteria: every authenticated session has a stable identifier available to the rate limiter (email when present, falling back to a stable provider id such as GitHub's numeric user id otherwise) — no authenticated session can reach `generateAIContent` without being subject to either the shared-key budget or an explicit BYOK exemption. Add a route test covering an authenticated session with no email.

### P3 - Exploratory

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

<!--
AGENT INSTRUCTIONS:
1. Keep active items in In Progress and P1-P3 sections.
2. Keep task bullets short and scannable.
3. Move finished work into FEATURES.md, not a Done section here.
-->
