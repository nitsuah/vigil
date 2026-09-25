# 🗺️ Vigil Roadmap

> 🧭 [vigil](./README.md) · [Features](./FEATURES.md) · **Roadmap** · [Tasks](./TASKS.md) · [Changelog](./CHANGELOG.md) · [Metrics](./METRICS.md) <!-- nav -->

updated: 2026-09-24

Next Review: 2026-10-24

> 2027 planning reset (2026-09-24): Q4 2025–Q1 2026, Q2 2026 (AI & Orchestration), the v2 launch (#200), the
> Portfolio Intelligence batch (#204), and every shipped 2026 Q3/Q4 item (PMO mode, DEV-flow handoff, chat foundation,
> velocity trending, 7-tool MCP + `/api/context`, 2D dependency graph, maintenance/token-density/comment-ratio signals,
> stale-review detector) were removed from this file — see [FEATURES](./FEATURES.md) / [CHANGELOG](./CHANGELOG.md).
> Every open 2026 Q3/Q4 item was carried into 2027 Q1 below.

## 2027 Q1: PMO Intelligence & Autonomy (Planned) 🏗️

### Committed _(carried from 2026 Q3)_

- [ ] **Chat-driven doc management, stage 3** — check items off in TASKS.md / move shipped items to FEATURES.md directly from chat (proposal/apply/dismiss already shipped).
- [ ] **AI-assisted roadmap management** — auto-suggest items from repo health signals and auto-update progress from linked PR/issue state.
- [ ] **Technical-debt trending + zombie-branch detection** — velocity trending shipped (`repo_snapshots`); debt signals and a stale-branch cleanup view remain.
- [ ] **3D / click-to-detail cross-repo dependency graph** — upgrade of the shipped 2D SVG `DependencyGraph`.

### Exploratory _(carried from 2026 Q4)_

- [ ] Autonomous plan execution: agents read ROADMAP.md and TASKS.md, open PRs, and close items end to end
- [ ] Portfolio intelligence dashboard: cross-repo health roll-up, trend lines, and strategic signal view
- [ ] Evaluate enterprise auth, team collaboration, and org-wide governance workflows
- [ ] Add mobile-responsive adjustments and lightweight PWA packaging
- [ ] **Repo "mood" signal** — lightweight sentiment from recent PR descriptions, commit messages, and TASKS.md tone (grind / cleanup / blocked).
- [ ] **AI PR pairing suggestions** — when promoting a ROADMAP/TASKS item to a PR, surface related items in other repos that should co-land.
- [ ] **Agent session receipts** — per-repo log (chat panel + PMO view) of what an AI session actually did: commits, PRs, files touched, findings fixed vs. skipped-with-reason.

## Notes

- GitHub repositories and markdown remain the source of truth.
- Cross-repo orchestration and autonomous plan execution are the long-term product direction.
- Per-repo detailed execution stays in each repo's own TASKS.md; Vigil tracks aggregate state.
- Detailed execution work for vigil itself stays in TASKS.md.
- When an item ships, remove it here and condense it into FEATURES.md / CHANGELOG.md.
