# Overseer Feature Audit

> 🧭 [vigil](../README.md) · [Features](../FEATURES.md) · [Roadmap](../ROADMAP.md) · [Tasks](../TASKS.md) · [Changelog](../CHANGELOG.md) · [Metrics](../METRICS.md) <!-- nav -->

Last Updated: August 9, 2026

## Summary

Documentation and implementation are aligned across the project. Key validations:

- **Test Coverage**: Docker-validated via `docker compose -f config/docker-compose.test.yml run --rm coverage`. 31 test files, 447 tests (446 passing, 1 skipped Gemini health check without API key). Coverage numbers may vary; rerun to get current statement/branch/function/line percentages.
- **Production OAuth**: Verified working on Netlify (NextAuth v5 + GitHub OAuth) — no longer a blocker.
- **AI / Gemini**: Multi-provider failover (Gemini, GPT-4, Claude) with auto-discovery, hot model swapping, and BYOK provider-order routing shipped (Q4 2025–Q1 2026) — see HANDOFF-byok-quota-provider-fallback-20260411.
- **Community Standards**: All 10 standards have templates and modal-based PR creation ✅
- **Documentation**: All 5 core docs (ROADMAP, TASKS, METRICS, FEATURES, README) have templates and modal-based PR creation ✅
- **Best Practices**: 4 of 10 template-based practices (Dependabot, Env Template, Docker, Netlify Badge) have modal-based PR creation ✅
- Centralized server-side logging via `lib/log.ts`; server routes and scripts use `logger` consistently.
- `.env.example` exists and is referenced in README and CONTRIBUTING; Dependabot and Docker are configured.
- **Security Enhancement**: Markdown rendering uses react-markdown with rehype-sanitize plugin for XSS protection ✅
- **Authentication UI**: Sync All button restricted to authenticated users only ✅
- **Docker Validation**: `docker build -t overseer-devops-check .` completes without real secrets injected at build time; runtime secrets are still required ✅

_For historical improvements and version history, see CHANGELOG.md._

## Feature Detection & Display Matrix

This matrix shows what Overseer tracks, how we detect it, health indicators, and automated fixes.

Modal-based fixes are reflected directly in the "Automated Fix" column (e.g., "✅ Modal").

| Feature/Metric               | Detection Method                                | Source         | Health Indicator | Automated | AI Improve |
| ---------------------------- | ----------------------------------------------- | -------------- | ---------------- | --------- | ---------- |
| **Core Docs**                |                                                 |                |                  |           |            |
| ROADMAP.md                   | File existence + parsing                        | GitHub API     | 4-state          | ✅ AI     | ❌ No      |
| TASKS.md                     | File existence + parsing                        | GitHub API     | 4-state          | ✅ AI     | ❌ No      |
| METRICS.md                   | File existence + parsing                        | GitHub API     | 4-state          | ✅ AI     | ❌ No      |
| FEATURES.md                  | File existence + parsing                        | GitHub API     | 4-state          | ✅ AI     | ❌ No      |
| README.md                    | File existence                                  | GitHub API     | 4-state          | ✅ AI     | ❌ No      |
| **Testing & Quality**        |                                                 |                |                  |           |            |
| Testing Framework            | Config file detection                           | File list scan | binary           | ❌ No     | ❌ No      |
| Test Files Count             | Pattern matching (.test., .spec., tests/)       | File list scan | Count display    | ❌ No     | ❌ No      |
| Test Cases Count             | Parse test files for it(), test() calls         | File parsing   | Count display    | ❌ No     | ❌ No      |
| CI/CD Build Status           | GitHub Actions API                              | GitHub API     | git-workflow     | ❌ No     | ❌ No      |
| Code Coverage                | METRICS.md parsing                              | Self-reported  | Percentage + bar | ❌ No     | ❌ No      |
| Code Coverage (DB)           | METRICS.md → repos.coverage_score               | Self-reported  | Percentage + bar | ❌ No     | ❌ No      |
| **Best Practices (10)**      |                                                 |                |                  |           |            |
| CI/CD                        | .github/workflows, .gitlab-ci.yml, netlify.toml | File list scan | binary           | ❌ No     | ❌ No      |
| Pre-commit Hooks             | .husky/, .git/hooks/                            | File list scan | binary           | ❌ No     | ❌ No      |
| Linting                      | .eslintrc, .prettierrc, biome.json              | File list scan | binary           | ❌ No     | ❌ No      |
| Branch Protection            | GitHub Branch Protection API                    | GitHub API     | 3-state          | ❌ No     | ❌ No      |
| Testing Framework            | Config files (vitest, jest, playwright, etc.)   | File list scan | binary           | ❌ No     | ❌ No      |
| .gitignore                   | File existence                                  | File list scan | binary           | ❌ No     | ❌ No      |
| Netlify Badge                | Badge URL in README                             | README content | binary           | ✅ AI     | ❌ No      |
| .env.example                 | File existence                                  | File list scan | binary           | ✅ AI     | ❌ No      |
| Dependabot                   | .github/dependabot.yml                          | File list scan | binary           | ✅ AI     | ❌ No      |
| Docker                       | Dockerfile, docker-compose.yml                  | File list scan | binary           | ✅ AI     | ❌ No      |
| **Community Standards (10)** |                                                 |                |                  |           |            |
| CODE_OF_CONDUCT.md           | File existence                                  | File list scan | binary           | ✅ AI     | ❌ No      |
| CONTRIBUTING.md              | File existence                                  | File list scan | binary           | ✅ AI     | ❌ No      |
| SECURITY.md                  | File existence                                  | File list scan | binary           | ✅ AI     | ❌ No      |
| LICENSE                      | File existence                                  | GitHub API     | binary           | ✅ AI     | ❌ No      |
| CHANGELOG.md                 | File existence                                  | GitHub API     | binary           | ✅ AI     | ❌ No      |
| Issue Templates              | .github/ISSUE_TEMPLATE/                         | File list scan | binary           | ✅ AI     | ❌ No      |
| PR Templates                 | .github/pull_request_template.md                | File list scan | binary           | ✅ AI     | ❌ No      |
| CODEOWNERS                   | .github/CODEOWNERS                              | File list scan | binary           | ✅ AI     | ❌ No      |
| Copilot Instructions         | .github/copilot-instructions.md                 | File list scan | binary           | ✅ AI     | ❌ No      |
| FUNDING                      | .github/FUNDING.yml                             | File list scan | binary           | ✅ AI     | ❌ No      |

### Legend

**Detection Method:**

- File existence: Check if file is present
- Pattern matching: Search for patterns in filenames
- Parsing: Parse file content and extract structured data
- GitHub API: Query GitHub REST API

**Source:**

- GitHub API: Direct from GitHub
- File list scan: Scan repository file tree
- Self-reported: From METRICS.md or similar
- Composite: Calculated from multiple sources

**Health Indicator:**

- 4-state: Missing, Dormant, Malformed, Healthy
- 3-state: Missing, Dormant, Healthy
- Binary: Healthy or Missing
- Percentage: 0-100% score
- Count: Numeric count
- Color-coded: Visual indicator based on thresholds
- git-workflow (Pass/Fail/Unknown with workflow name)

**Automated Fix:**

- ✅ Template PR: Create PR with template file
- ✅ Regenerate: Re-run generation
- ❌ No: No automated fix available
- N/A: Not applicable

**Status:**

- ✅: Fully implemented and displayed
- ⚠️ Partial: Implemented but not fully integrated
- ❌ Missing: Not implemented

## 🔴 Remaining Gaps

Sourced from ROADMAP.md / TASKS.md (updated 2026-08-09).

### 1. Best Practices Fix Modal (Currently 4 of 10)

Current: 4 best practices have Fix buttons with modal preview — Dependabot ✅, .env.example ✅, Docker ✅, Netlify Badge ✅.

Tracked but no Fix buttons (6 remaining): CI/CD configuration, Pre-commit Hooks, Linting configuration, Branch Protection, Testing Framework, .gitignore.

**Priority**: MEDIUM - Would complete automated fix coverage for best practices

### 2. AI-Enhanced Community Standards (Dogfooding)

Overseer tracks these but doesn't have them itself at root. Could use AI to generate personalized versions:

- CODE_OF_CONDUCT.md (exists in templates/ only)
- SECURITY.md (exists in templates/ only)
- Issue Templates (exists in templates/ only)
- PR Template (not present in overseer root)

**Priority**: LOW - Templates exist, just need to apply them to overseer itself

### 3. Security Configuration Tracking

Still tracked but not yet fully surfaced in the UI:

- Security policy presence tracking
- Security advisory configuration
- Private vulnerability reporting status

**Priority**: MEDIUM - Would complete the security visibility story

### 4. Cross-Repo Orchestration (Planned)

Agent dispatch bridge to agent-board, cross-repo dependency mapping, and chat-driven TASKS/ROADMAP management.

**Priority**: Planned - Q3 2026 candidate

## 🚀 Recommended Next Steps

**Next Priority Items**:

1. Expand the Best Practices Fix Modal to the remaining 6 checks (gap #1).
2. Apply community standards templates to overseer itself (gap #2).
3. Surface remaining security policy fields in the UI (gap #3).
4. Scope Q3 2026 cross-repo orchestration and conversational interface (gap #4).
