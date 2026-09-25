# Metrics

> 🧭 [vigil](./README.md) · [Features](./FEATURES.md) · [Roadmap](./ROADMAP.md) · [Tasks](./TASKS.md) · [Changelog](./CHANGELOG.md) · **Metrics** <!-- nav -->

Last Validated: 2026-09-24 (PMO audit — Docker: `docker compose -f config/docker-compose.test.yml run --rm coverage`)
Health Score: 95/100
Compliance: Vigil/PM core metrics and health scoring validated for Q3 2026

## Core Metrics

| Metric              | Value  | Notes                                                                                                                                                                                                                         |
| ------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Coverage       | 81.18% | Overall statement coverage from Docker `docker compose -f config/docker-compose.test.yml run --rm coverage` (2026-09-24). Branch: 67.87%, Function: 74.40%, Line: 82.83%.                                                     |
| Build Time          | ~6s    | Local dev build                                                                                                                                                                                                               |
| Bundle Size         | TBD    | Not measured yet                                                                                                                                                                                                              |
| Test Files          | 46     | All vitest test files pass in Docker (2026-09-24).                                                                                                                                                                            |
| Test Cases          | 631    | Docker coverage run (2026-09-24): 630 passing, 1 skipped (Gemini health check skips when no API key is set). Duration 31.55s.                                                                                                 |
| E2E Test Files      | 3      | Playwright specs: `e2e/dashboard.spec.ts` (live-API, local DB-backed), `e2e/mocked/ui.spec.ts` (DB-free, runs in `.github/workflows/e2e.yml`), `e2e/smoke/prod.spec.ts` (post-deploy smoke in `.github/workflows/smoke.yml`). |
| E2E Test Cases      | TBD    | Not re-run in the 2026-09-24 audit. The old figure of 34 counted only `e2e/dashboard.spec.ts`.                                                                                                                                |
| Database Tables     | 8      | repos, tasks, roadmap_items, metrics, doc_status, features, best_practices, community_standards                                                                                                                               |
| Repo Columns        | 30+    | Including LOC, test counts, CI status, vulnerabilities, contributor analytics, template health tracking, subsection                                                                                                           |
| API Routes          | 25+    | Including auth, repos CRUD, fix operations, sync, debug, rate-limit, enrich-template, generate-best-practice, and admin utilities                                                                                             |
| Utility Files       | 20+    | Including parsers (roadmap, tasks, features, metrics), github.ts, ai.ts, ai-prompt-chain.ts, ai-failover.ts, sync.ts, date-utils, etc.                                                                                        |
| Docs Files          | 15+    | Including core docs (README, ROADMAP, TASKS, FEATURES, METRICS, CHANGELOG), OAuth guides, templates, and PM.md agent instructions                                                                                             |
| Component Files     | 30+    | Dashboard, ExpandableRow, Header, GuidedTour, MarkdownPreview, PRPreviewModal, DiffView, detail sections, Toast notifications                                                                                                 |
| Community Standards | 12     | CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, LICENSE, CHANGELOG, Issue/PR templates, CODEOWNERS, Copilot Instructions, FUNDING.yml, FLOW-TASKS Prompt, HANDOFF Prompt                                                             |
| Best Practices      | 10     | CI/CD, pre-commit hooks, linting, branch protection, testing, gitignore, deployment badge, env template, Dependabot, Docker                                                                                                   |

## Health

| Metric        | Value      | Notes                                     |
| ------------- | ---------- | ----------------------------------------- |
| Open Issues   | 0          | GitHub issues                             |
| PR Turnaround | < 1 day    | Typical merge time                        |
| Skipped Tests | 1          | Gemini health check skips without API key |
| Health Score  | 95/100     | Vigil's own score                         |
| Last Updated  | 2026-09-24 | PMO audit: Docker unit/coverage re-run    |

## Verification

- Coverage command: `docker compose -f docker-compose.test.yml run --rm coverage`
- Docker build smoke test: `docker build -t vigil-devops-check .`
- Production image note: the Docker build now uses placeholder auth values only during the build stage; runtime containers still require real auth secrets.

<!--
AGENT INSTRUCTIONS:
1. Update these metrics regularly (e.g., before a merge/last commit weekly or after major releases).
2. Use automated tools to fetch values where possible.
3. Keep this file focused on actual project metrics, not feature documentation.
4. For feature status tracking, see docs/AUDIT.md
5. For health score component breakdown, see FEATURES.md
-->
