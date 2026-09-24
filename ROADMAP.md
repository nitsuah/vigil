# 🗺️ Vigil Roadmap

## updated: 2026-09-24

Next Review: 2026-10-24

## Q4 2025 – Q1 2026 ✅

> Completed. Foundation, UX baseline, PR preview, AI enrichment, repo intelligence, auto-fix flows, Agent Task Queue API, Docker smoke CI, and BYOK/provider-order AI routing all shipped.

## Q2 2026: AI & Orchestration ✅

- [x] Add FLOW-TASKS and HANDOFF agent prompt templates to the community-standards template set
- [x] Add per-repo plan-execution tracking: surface each repo's Q2 roadmap progress in the dashboard
- [x] Add PMO/DEV flow tracking: surface branch and PR readiness for all managed repos in the dashboard
- [x] Add .github repo awareness: resolve community health files from owner/.github before flagging per-repo absence in health scoring and standards auto-fix
- [x] Add security inputs to the health score (Dependabot severity weighting, secret-scanning signal)
- [x] Add AI feature suggestion button to the Features panel with optional prompt input (PR #132)
- [x] Add AI doc-improvement controls: inline compare-and-accept flow for existing documentation (PR #133)
- [x] Add workflow visualization for multi-step execution paths: pipeline stage bar (Planned → In Progress → In Review → Done) per roadmap item (PR #131)
- [x] Add real-time webhook-driven sync: HMAC-validated GitHub push webhook triggers background sync (PR #134)
- [x] Batch per-repo detail queries into a single db.transaction() call to reduce Neon round trips (PR #128)
- [x] Keep Gemini failover and model evolution resilient (PR #137)
- [x] Add DEV-flow handoff support so PMO roadmap items can be promoted into implementation queues cleanly (PR #136)

## Q3 2026: PMO Mode 🏗️

- [x] Add PMO mode to the dashboard: portfolio-wide roadmap progress, plan execution status, and handoff management view (PR #136)
- [ ] Add AI-assisted roadmap management: auto-suggest items from repo health signals and auto-update progress from linked PR/issue state
- [x] Add DEV-flow handoff UI: promote in-progress roadmap items into the agent task queue with pre-filled context (PR #136)
- [x] Allow easy management of TASKS, ROADMAP, FEATURES via a chat-driven interface in the dashboard — proposal/apply/dismiss flow shipped; direct check-off/move-to-FEATURES from chat still open (see TASKS.md)

## Q3 2026: Analytics & MCP 🤖

- [x] Add the conversational interface foundation: one or two chat-driven repo-hygiene workflows end-to-end (PR #196 — per-repo chat panel, "summarize my stale docs" / "what should I work on next?")
- [x] Add advanced analytics: velocity scoring — `repo_snapshots` time-series + trend endpoint + sparkline (commit frequency, PR merge time, health score, open PRs, total LOC); technical-debt trending and zombie-branch detection still open (see TASKS.md)
- [x] Expand MCP tooling surface: 7 tools now ship (`get_repo_health`, `list_repos`, `get_repo_details`, `get_portfolio_overview`, `search_repos`, `list_tasks`, `get_security_summary`) + `/api/context` LLM context endpoint (PR #181)
- [x] Add cross-repo dependency mapping to surface shared-stack connections (e.g., agent-board ↔ bb-mcp ↔ vigil) — `GET /api/dependencies` + `DependencyGraph.tsx`; 2D SVG rather than the originally-scoped 3D graph

## Q4 2026: Portfolio Intelligence (Exploratory) 🧪

- [ ] Autonomous plan execution: agents read ROADMAP.md and TASKS.md, open PRs, and close items end to end
- [ ] Portfolio intelligence dashboard: cross-repo health roll-up, trend lines, and strategic signal view
- [ ] Evaluate enterprise auth, team collaboration, and org-wide governance workflows
- [x] Evaluate token-density, comment-to-code ratio, and maintenance-mode metrics as first-class signals — all three now computed and surfaced in expanded repo stats (maintenance-mode PR #200; token-density/comment-to-code PR #204)
- [ ] Add mobile-responsive adjustments and lightweight PWA packaging
- [ ] **Repo "mood" signal** — lightweight sentiment computed from recent PR descriptions, commit messages, and TASKS.md tone; surfaces whether a repo is in grind mode, cleanup mode, or blocked, giving PMO quick directional intuition without reading every PR.
- [ ] **AI PR pairing suggestions** — when promoting a ROADMAP/TASKS item to a PR, Vigil surfaces related items from other repos that should co-land; reduces cross-repo integration surprises by exposing dependency coupling before merge.
- [x] **Stale-review detector** — surface PRs whose formal review decision (`CHANGES_REQUESTED`) is out of sync with their actual thread-resolution state (all threads resolved, CI green, but the bot never re-approved). Observed repeatedly across the portfolio this session: CodeRabbit correctly resolves every finding but its top-level review verdict never flips, silently blocking branch-protection-gated merges until a human notices and merges manually or overrides. See FEATURES.md for implementation detail.
- [ ] **Agent session receipts** — a lightweight per-repo log (surfaced in the chat panel and PMO view) of what an AI coding session actually did: commits made, PRs opened/merged, files touched, findings fixed vs. skipped-with-reason. Distinct from AI Summaries (which describe the _repo_); this describes _recent agent activity on it_, so a human picking up mid-portfolio work can see what changed without reconstructing it from commit messages.

## v2 Launch (2026-09-01) ✅

> Shipped on PR #200. Sync button now force-refreshes all displayed (filtered) repos with full data; repo activity signals added.

- [x] Sync button refreshes all displayed (filtered) repos with full data, not just new repos (PR #200)
- [x] Maintenance-mode detection: repos with 90+ days no commits flagged with a badge (desktop + mobile)
- [x] Velocity score: 0-100 from commit frequency + PR merge time, surfaced in expanded stats

## Portfolio Intelligence Batch (2026-09-03)

> Shipped on the `feat/v2-portfolio-intelligence` branch (PR #204). Chat-driven doc editing (proposal/apply/dismiss), cross-repo dependency mapping, token-density + comment-to-code ratio metrics, a DB scaling assessment, and velocity trending all landed together. Technical-debt trending and zombie-branch detection are still open (see TASKS.md).

- [x] Chat-driven doc-edit proposals: propose → inline diff card → apply via the existing PR flow (stages 1, 2, 4 of the TASKS.md item)
- [x] Cross-repo dependency graph (`/api/dependencies`)
- [x] Token-density + comment-to-code ratio metrics (`lib/parsers/code-density.ts`)
- [x] DB scaling assessment (`docs/db-scaling-assessment.md`)
- [x] Velocity trending via `repo_snapshots` + trend endpoint + sparkline; technical-debt trending remains open (see TASKS.md)

## Notes

- GitHub repositories and markdown remain the source of truth.
- Cross-repo orchestration and autonomous plan execution are the long-term product direction.
- Per-repo detailed execution stays in each repo's own TASKS.md; Vigil tracks aggregate state.
- Detailed execution work for vigil itself stays in TASKS.md.
