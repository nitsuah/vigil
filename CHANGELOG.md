# Changelog

> 🧭 [vigil](./README.md) · [Features](./FEATURES.md) · [Roadmap](./ROADMAP.md) · [Tasks](./TASKS.md) · **Changelog** · [Metrics](./METRICS.md) <!-- nav -->

All notable changes to Vigil (formerly Overseer) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Sync progress accuracy

- **Fixed:** "Sync All" counted the default repos (vigil, nitsuah-io) twice when the user already owns them. The total overshot (13 counted, 11 synced), so the bar finished at 85%, and both repos got a full second detailed sync. Defaults already in the user's list are now synced once (`defaultReposNotIn` in `lib/sync-filters.ts`).
- **Fixed:** the progress count only advanced during the seconds-long metadata phase, then sat still through the minutes-long health phase, so the bar looked frozen. `completedRepos` now counts repos whose detailed sync has finished (success or final failure).

### Dashboard fixes

- **Fixed:** one grade scale everywhere. The dashboard (`lib/dashboard-utils.ts`) graded 60–69 as "C" and 80–89 as "A", while MCP and `/api/context` (`lib/health-grade.ts`) graded 60–69 as "D". The dashboard now takes its letter from `healthGrade()` (A+ ≥ 95, A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F), and the grade distribution gains an `A+` bucket. A test asserts the two letters agree for every score from 0 to 100.
- **Fixed:** the header was wider than the viewport, adding a horizontal scrollbar. The collapsed status pills were invisible but still laid out past the right edge; they now collapse to zero width. Hovering the avatar no longer changes anything. Sign-out moved into the expanded profile panel (click the avatar), where it no longer overlaps the avatar or floats detached below the header.
- **Fixed:** a repo whose TASKS.md exists but has no checklist items (e.g. ats-fill) lost its Tasks card entirely, as if the file were missing. It now shows an explicit empty state.
- **Tests:** route test for `update-health-profile` (write grant keyed by `session.userId`, 404 without a grant, 400 on an unknown profile); Tasks empty states; grade-scale parity.

### Session identity fix

- **Fixed:** `session.userId` was a random per-login UUID, not the GitHub numeric id. Without a database adapter, Auth.js v5 sets `token.sub` to a UUID and ignores `profile().id`. So `/api/sync-progress` always 404'd (frozen "Sync All" bar), repo-access checks never matched the grants that Sync All writes under the GitHub id (private repos hidden from the dashboard, PMO, `/api/context` and chat), and single-repo sync and add wrote grants under a throwaway UUID. The GitHub id now comes from `account.providerAccountId` at sign-in (`lib/auth-session.ts`). Sessions from before this fix have no `userId` until the next sign-in.
- **Fixed:** the sync progress poll stopped silently on any non-OK response. It now retries through transient failures and, after ten failures in a row, drops the bar with a "still running in the background" toast.

### Visual docs signal + CI recipe

- **Added:** `visual_docs` best practice (informational, not scored): diagrams + screenshots detected from the repo tree, healthy only when the README embeds them; Best Practices panel shows a "(not scored)" tag and a link to the recipe when missing/dormant. `INFORMATIONAL_PRACTICES` keeps it out of the health score so no repo's score moves.
- **Added:** reusable recipe — `templates/.github/workflows/visual-docs.yml`, `scripts/visual-docs-readme.mjs` (rewrites the README's `<!-- visual-docs:start/end -->` block, `--check` for CI), [docs/VISUAL_DOCS.md](./docs/VISUAL_DOCS.md).
- **Added:** dogfood — `.github/workflows/visual-docs.yml` regenerates `docs/screenshots/*.png` from a DB-free Playwright spec (`e2e/visual-docs`, frozen clock) and `docs/diagrams/architecture.svg` from Mermaid, then opens a PR on `bot/visual-docs`; README gains a "Screenshots & diagrams" section.

### Cross-repo task rollup + Claude Code MCP connection

- **Added:** `get_open_tasks` MCP tool (8th tool) — open TASKS.md work across every tracked repo, sorted P0 first, filterable by repos/priority/status/owner, with counts by priority and repo.
- **Added:** `open_work` block (P0/P1 slice + counts) in `GET /api/context`; "Open work" panel on the PMO page backed by session-scoped `GET /api/pmo/tasks`.
- **Added:** TASKS parser captures `priority` (sub-bullet > inline tag > heading) and `owner`; new nullable `tasks.priority` / `tasks.owner` columns (additive migration). Unchecked items under `## In Progress` now count as in-progress.
- **Fixed:** the MCP endpoint was unreachable from any agent in production — `proxy.ts` redirected every session-less request, bearer or not, to `/login`. Bearer requests now pass through to `/api/mcp` and `/api/context`, which validate the key themselves.
- **Fixed:** MCP Streamable HTTP compatibility for `claude mcp add --transport http`: notifications return 202, `ping` is answered, `initialize` negotiates 2024-11-05 → 2025-06-18, and SSE `GET` probes get 405.
- **Docs:** [docs/MCP.md](./docs/MCP.md) — key generation, `claude mcp add` / `.mcp.json` setup, tool guide, TASKS.md priority/owner conventions.

### Health scoring profiles

- **Added:** Repository health maturity profiles: Starter, Production, and Enterprise, with persisted per-repo selection and profile-specific component weights.
- **Changed:** Security scoring now measures both security-control coverage and open findings, so zero reported alerts no longer implies a fully enabled security posture.
- **Added:** Health breakdown profile picker with immediate score recalculation.

### 2026-09-18 → 2026-09-24 (PRs #221–#233)

- **Fixed (P0):** expanding any repo row crashed the dashboard — Postgres NUMERIC fields (`token_density`, `comment_to_code_ratio`) reached the client as strings; coerced via `toFiniteNumber()` with a regression test (#225).
- **Added (P0):** `RowErrorBoundary` around expanded row details (desktop + mobile) so a render error degrades one row instead of the page; `lib/numeric.ts` normalizes every NUMERIC-backed field at the API boundary (#226).
- **Security (P0, CWE-639):** `GET /api/repos` and every by-name route are scoped by repo access (default, verified-public, or `repo_access` grant); a `visibility_verified` column fails closed for repos synced before #221 until re-synced (#226). Repo chat requires auth (#221).
- **Added (P1):** DB-free mocked Playwright suite (`e2e/mocked/ui.spec.ts`) runs in CI; `.github/workflows/smoke.yml` smoke-tests production after each merge once `/api/version` reports the merged commit (#226).
- **Changed (P1):** Overseer → Vigil rebrand finished and the GitHub repo renamed to `nitsuah/vigil` with an idempotent DB row migration (#221, #226); Netlify site intentionally kept at `ghoverseer.netlify.app`.
- **Fixed (P2):** agent task receipts are awaited and failures surfaced instead of fire-and-forget; `reviewThreads`/`refs` GraphQL connections paginate (refs capped at 20 pages) and fail closed on incomplete fetches; mobile repo card no longer nests links inside a `role="button"` wrapper; shared-key rate limiter moved to a Neon table and quota reserved before personal-key fallback calls (#204, #216).
- **Added:** `docs/` folder support for core docs and community standards, incl. `docs/.github/` (#229, #230); navbar refactor — single sync, DependencyGraph moved to PMO, Hidden filter toggle (#228); user-feedback improvements (#232).
- **Removed:** stale `docs/` copies of TASKS/ROADMAP/METRICS/FEATURES (#233) and, in the 2027 planning reset (`pmo-ff`), `docs/CHANGELOG.md` after merging its two root-missing entries (AI failover integration, test model candidates) into this file.
- **Docs:** planning docs reset for 2027 (`pmo-ff`) — completed ROADMAP/TASKS items condensed into FEATURES/CHANGELOG, open 2026 Q3/Q4 items carried into 2027 Q1, breadcrumb navigation + README docs index added.

### Added

- **MCP Server expansion (7 tools):** `list_repos`, `get_repo_details`, `get_portfolio_overview`, `search_repos`, `get_security_summary` added alongside existing `get_repo_health` and `list_tasks`; LIKE metacharacter escaping on `search_repos`; `repos_at_risk` label replaces misleading `repos_with_critical`; `doc_type, "exists"` quoting fix for PostgreSQL reserved keyword; `LIMIT 100` on roadmap sub-query (PR #181)
- **LLM Context Endpoint:** `GET /api/context` provides LLM-optimized JSON for the full portfolio or a single repo; Bearer token or NextAuth session for full access, unauthenticated for default repos only (PR #181)
- **Shared health-grade module:** `lib/health-grade.ts` extracted (`healthGrade`, `buildGradeDist`, `buildCiDist`); `/api/mcp` and `/api/context` now import from it, removing ~40 lines of duplicated grade logic (PR #181)
- **Mobile card layout:** `MobileRepoCard` component renders a compact swipeable card list at `md:hidden`; includes keyboard accessibility (`role=button`, `aria-expanded`, `aria-controls`, Enter/Space handlers); homepage link `aria-label`; native `type="button"` on action buttons (PR #180)
- **Non-disruptive background sync:** Single-repo sync triggers in the background without blocking the UI; `useEffect` timer cleanup prevents memory leaks on unmount (PR #180)
- **Request-version tracking in `useRepoDetails`:** Per-repo version counter discards stale forced-refresh responses; ref updated synchronously to prevent dedup race; timer array collected and cleared on unmount (PR #181)
- **PMO Mode dashboard:** Portfolio-wide roadmap progress at `/pmo`; 4-stage pipeline summary, per-repo health/CI cards, DEV-flow handoff to agent task queue (PR #136)
- **DEV-flow handoff:** One-click handoff button on in-progress roadmap items POSTs to `/api/agent/tasks` and links the returned `agent_task_id` back to the roadmap item (PR #136)
- **Roadmap-to-DEV-flow handoff linkage:** Roadmap items can now be linked to a tracked PR and/or Agent Task Queue entry via `PATCH /api/repos/[name]/roadmap-items/[id]`. Linked PRs and agent tasks are shown as badges; `lib/sync.ts` merges rather than delete+inserts `roadmap_items` so DB-only links survive re-syncs
- **Centralized Gemini Model Discovery:** New `gemini-model-discovery.ts` module provides single source of truth for model configuration
- **Auto-Discovery Fallback:** Automatically searches for working models when configured model fails (tries version 3, 2.5, 2.0, then pro models)
- **Model Caching:** Discovered working models are cached for 1 hour to reduce API calls
- **Unified Environment Variables:** Aligned all code to use `GEMINI_MODEL_NAME` (or `GEMINI_MODEL` as fallback) consistently

### Changed

- **Health score weights rebalanced:** Best Practices 30% (was 25%), Security 30% (was 10%), Documentation 15% (was 20%), Testing 15% (was 25%), Community Standards 5% (was 10%), Activity 5% (was 10%) — reflects the primacy of security and engineering hygiene (PR #181)
- **E2E tests moved to `e2e/`:** `tests/dashboard.spec.ts` → `e2e/dashboard.spec.ts`; `playwright.config.ts` now uses `testDir: './e2e'` (PR #181)
- **`HealthBreakdown` accessibility:** Native `<button>` replaces `<span role="button">`; `onFocus`/`onBlur` handlers; `aria-describedby` on button and `role="tooltip"` + id on popup; `id` attribute added to popup portal (PR #181)
- **Header mobile input `aria-label`:** Added `aria-label="Repository URL (owner/repo)"` to the mobile add-repo input (PR #181)
- **Repo-detail query batching:** `GET /api/repo-details/[name]` fetches all seven per-repo detail tables in a single `db.transaction([...])` call instead of seven sequential round trips
- **Default Model Updated:** Changed from deprecated `models/gemini-2.0-flash-exp` to `models/gemini-2.5-flash`
- **AI Failover Integration:** Integrated the model discovery system with the existing failover logic (merged from the retired `docs/CHANGELOG.md`)
- **Test Model Candidates:** Updated `test-model-names.mjs` with future-proof version 3 model names (merged from the retired `docs/CHANGELOG.md`)
- **Model Configuration:** All files now import from centralized `gemini-model-discovery` instead of hardcoding strings

### Fixed

- **Test assertion determinism:** `lib/health-score.test.ts` replaced range assertions with exact `toBe(31)` (PR #181)
- **`exists` reserved keyword:** Both `/api/mcp` and `/api/context` now quote `"exists"` in PostgreSQL SELECT to avoid reserved-word parse error (PR #181)
- **Auth variable shadowing in `/api/context`:** `auth` → `authHeader` to stop shadowing the NextAuth import (PR #181)
- **Model String Duplication:** Eliminated hardcoded model strings across multiple files
- **Environment Variable Inconsistency:** Fixed discrepancy between `GEMINI_MODEL` and `GEMINI_MODEL_NAME` usage
- **Health Check Accuracy:** Health endpoint now uses same model as actual generation code

## [1.7.0] - 2025-12-05

### Added

- **Guided Tour System:** 16-step interactive onboarding with spotlight overlay highlighting key features
- **Auto-Advance Tour:** 3-second timer between steps with manual navigation override
- **Smart Row Expansion:** Automatic expand/collapse during tour for Features, Roadmap, Tasks, Documentation, Best Practices, Testing, Community sections
- **Spotlight Effect:** CSS clip-path polygon creating visual cutout with 75% dark overlay
- **Data-Tour Attributes:** Comprehensive element targeting system for tour step positioning
- **Tour Navigation Controls:** Skip tour, manual next/previous with pause on interaction

### Changed

- **Section Highlighting:** Moved data-tour attributes from header divs to wrapper divs for full card highlighting
- **Deploy Badge Prompt:** Updated AI prompt from Netlify-specific to platform-agnostic badge format
- **Tour Flow:** Organized steps into logical groups (columns → expanded sections → controls → status)

### Fixed

- **ESLint Warnings:** Added eslint-disable comments for intentional setState in useEffect
- **Hook Declaration Order:** Converted functions to useCallback to prevent "variable before declaration" errors
- **Email Link in SECURITY.md:** Fixed malformed link to use proper mailto: syntax
- **HealthBreakdown Formatting:** Removed unnecessary blank line at end of metrics array

## [1.6.0] - 2025-12-01

### Added

- **Profile Section Redesign:** Compass rose pill layout (NW, W, SW positions) with rotating glow animation on profile picture
- **Pill Text Expansion:** Right-to-left text expansion (icon first, text appears left) with origin-right scaling
- **Profile Card Width Optimization:** Dynamic padding (`pr-2` collapsed, `pr-16` on hover) for compact default state
- **Filter Dropdown Enhancement:** Colored borders with subtle glows (purple Type, blue Language, fuchsia Fork) for better visual hierarchy
- **Filter Visibility Improvements:** Lighter backgrounds (`bg-slate-700/60`) and increased opacity for better contrast
- **Repository Table Reorganization:** Optimized button placement across Health, Actions columns
- **Clickable Repository Names:** Repository names now link directly to GitHub with hover underline
- **GitHub Link in Stats Section:** Added purple-themed GitHub button to Repository Stats header
- **Play Button in Health Column:** Homepage/demo links now appear as green play button after health shields
- **Refresh Button in Actions:** Moved from Links column to Actions column for better organization
- **Authenticated Sync Button:** Sync all button now only appears when user is authenticated
- **Table Column Cleanup:** Removed redundant Links column header while preserving status icons

### Changed

- **Markdown Rendering Security:** Replaced custom `dangerouslySetInnerHTML` implementation with battle-tested `react-markdown` library
- **HTML Sanitization:** Integrated `rehype-sanitize` plugin for XSS protection in markdown preview
- **GitHub Flavored Markdown:** Added `remark-gfm` support for tables, task lists, strikethrough, and autolinks
- **Dependency Cleanup:** Removed unused `baseline-browser-mapping` package from devDependencies
- **Filter Styling:** Dropdowns now use colored borders at 60% opacity with softer shadows on hover
- **Card Padding:** Profile card optimized from `pr-16` → `pr-4` → `pr-2` when collapsed for space reclamation
- **Button Distribution:** Health column now hosts play button, Actions column hosts refresh/remove buttons
- **ColSpan Adjustment:** Updated table colspan from 8 → 7 → 5 to match actual visible column count

### Fixed

- **XSS Vulnerability:** Eliminated unsafe HTML injection risk in markdown preview component
- **Build Errors:** Resolved multiple missing JSX closing tags in Actions column flex containers
- **Duplicate Buttons:** Removed duplicate play button instances during button reorganization
- **TypeScript Errors:** Fixed className prop issue in ReactMarkdown component by wrapping in div
- **Baseline Browser Mapping Warning:** Eliminated deprecation warnings by removing unused dependency

### Security

- **Markdown Content Safety:** All user-generated markdown now passes through `rehype-sanitize` before rendering
- **Link Security:** All external links include `rel="noopener noreferrer"` for security
- **Event Propagation:** Added `stopPropagation` to prevent unintended row expansion on button clicks

## [1.5.0] - 2025-11-30

### Added

- **PR Preview Modal:** Interactive file selection and preview before PR creation with pick-and-choose functionality
- **AI Template Enrichment:** Context-aware documentation generation using Gemini 2.0 with repo-specific knowledge extraction
- **Diff View Component:** LCS-based Myers diff algorithm for accurate line-by-line change detection between original and AI-generated content
- **Inline Edit/Generate Toggle:** Switch between manual template editing and AI-powered generation in preview modal
- **Gemini Health Monitoring:** Automated CI/CD integration with health check script to detect model deprecations
- **Model Auto-Discovery:** Scripts to find working Gemini models when API changes occur (test-gemini-health, test-model-names)
- **Enrich Template Endpoint:** New /api/enrich-template route supporting doc-type-specific AI prompts (TASKS, CODE_OF_CONDUCT, etc.)

### Changed

- **Gemini API Model:** Migrated from deprecated gemini-pro to gemini-2.0-flash-exp (experimental 2.0 model)
- **Netlify Build Process:** Added npm run test-gemini-health to build command for early failure detection
- **PR Creation Flow:** Now shows preview modal with diff view instead of immediate PR creation
- **Template Prompts:** Enhanced with structure preservation rules (e.g., TASKS headers, CODE_OF_CONDUCT template compliance)

### Fixed

- **Diff Algorithm:** Replaced buggy lookahead matching with proper LCS-based diff (eliminates false positives for identical lines)
- **Production OAuth:** Verified and confirmed working authentication flow on Netlify deployment
- **API Error Rate:** Reduced 500 errors during startup by improving error handling in /api/repos endpoint

## [1.4.0] - 2025-11-30

### Added

- **Detail Panel Redesign:** Complete UI overhaul with three-row layout architecture
- **Left Sidebar Layout:** AI Summary and Repository Stats consolidated in dedicated sidebar
- **Synchronized Expand/Collapse:** Row-level state management for project sections (Row 1), quality sections (Row 2), and standards sections (Row 3)
- **Gradient Backgrounds:** Unique color-coded gradients for all sections (purple AI/Roadmap, orange Features, blue Tasks/Testing, green Standards/Metrics, cyan Repo Stats, amber Documentation, red Issues)
- **Enhanced Health Shields:** Detailed tooltips showing component breakdowns for Community Standards, Best Practices, Testing, Coverage, and Documentation
- **Subsection Support:** Added subsection column to tasks table with migration script and parser support
- **AI Summary Component:** Extracted into dedicated component (AISummarySection) with generate button and dismissible state
- **Repository Stats Static Component:** Created RepositoryStatsSectionStatic with inline metrics and always-visible refresh button
- **Bold Text Parsing:** Created lib/markdown-utils.tsx for rendering **bold** markdown syntax in titles
- **Show More/Less Controls:** Granular controls for showing all quarters/subsections or completed items
- **Language Icon Mapping:** Created getLanguageIcon() helper with compact 2-3 letter labels
- **Health Shield Badges:** Coverage percentage and documentation health badges added to row displays

### Changed

- **Testing Section Header:** Moved coverage progress bar inline with section title for better space utilization
- **Refresh Button Location:** Moved from bottom of detail panel to Repository Stats header (always visible)
- **Type & Language Display:** Split type icon to Repository column (with name), language label to Description column (at end)
- **Features/Roadmap/Tasks Display:** Reversed order to show newest first with expandable card-based layout
- **Default Expansion States:** Row 1 (project) expanded by default, Rows 2-3 (quality/standards) collapsed
- **Section Organization:** Row 1 = Features/Roadmap/Tasks, Row 2 = Documentation/Best Practices/Testing, Row 3 = Standards/Metrics/Issues
- **Dashboard Table:** Removed Type and Language columns (moved to inline displays), enhanced row gradients
- **API Endpoint:** Added subsection field to tasks sync logic in sync-repos and repo sync

### Fixed

- **Array Mutation Warning:** Changed features .reverse() to .slice().reverse()
- **Doc Health Calculation:** Added bot and research repo types to getExpectedDocs()
- **Tasks Table Schema:** Added subsection column with proper index
- **Migration Endpoint:** Created /api/migrate/add_tasks_subsection for database updates

## [1.3.0] - 2025-11-27

### Added

- **OAuth Error Handling System:** Comprehensive error detection for organization access restrictions (lib/github-errors.ts)
- **GitHub Error Parsing:** Detects 5 error types (OAuth restrictions, permissions, not found, rate limits, unknown) with user-friendly messages
- **Auto-Redirect to GitHub:** Automatically opens GitHub OAuth settings when org access restrictions detected
- **Enhanced Error Responses:** API endpoints return detailed error types, instructions, and help URLs
- **OAuth Documentation:** Created GITHUB_OAUTH_ORG_ACCESS.md and OAUTH_ORG_FIX_SUMMARY.md user guides
- **Frontend Error Handling:** Enhanced useRepoActions hook with OAuth detection, toast notifications, and console logging
- **Template Path Debugging:** Added comprehensive logging to fix-doc endpoint for troubleshooting template resolution issues
- **Best Practices Fix Buttons:** Auto-fix for 4 best practices (Dependabot, Env Template, Docker, Netlify Badge) with one-click PR creation
- **Rate Limit Status Endpoint:** New /api/github-rate-limit endpoint to check current GitHub API rate limit status
- **Debug Endpoint:** New /api/repos/[name]/debug endpoint to inspect database records for troubleshooting
- **FUNDING.yml Community Standard:** 10th community standard check with template and auto-fix support
- **Refresh Button in Detail Panel:** Force re-sync individual repos with animated RefreshCw icon

### Changed

- **Error Messages:** Replaced raw GitHub API errors with actionable, user-friendly messages
- **Fix Button UX:** Now shows toast notifications with authorization instructions instead of generic errors
- **API Error Handling:** All fix endpoints now parse and classify GitHub errors before responding
- **Metrics Parser:** Enhanced to normalize percentage formats (both 0.8666 and 86.66% now correctly display as 86.66)
- **Testing Section Display:** Separated metric values from long descriptions with detail text display
- **Features Display Order:** Reversed to show newest features first (most recent at top)
- **Doc Health Calculation:** Removed LICENSE, CONTRIBUTING, and ROUTES.md from health scoring (focus on core docs)
- **Doc Health Tooltips:** Added comprehensive breakdown showing individual document states on hover
- **Doc Counter Badge:** Removed redundant 5/5 badge from Docs column (health states now in tooltip)

### Fixed

- **OAuth Organization Restrictions:** Users now get clear instructions when org blocks OAuth app access instead of cryptic errors
- **Error Context:** Console logs now show detailed error information for debugging template and authorization issues
- **Coverage Score Sync:** Always updates coverage_score in repos table (sets to NULL when no coverage found) to prevent stale values bleeding across repos
- **Batch Sync Coverage:** Sync-repos endpoint now properly extracts and updates coverage_score (was missing this logic)
- **Metrics Duplication:** Removed duplicate metrics that were accumulating from template instructions being parsed
- **Template Content Pollution:** Identified that markdown templates with example data can pollute parsing results
- **Duplicate Metrics Display:** Fixed DELETE before INSERT in metrics sync to prevent accumulation
- **Refresh Not Refetching:** Added force=true parameter to bypass cache when using refresh button
- **Array Mutation Warning:** Changed .reverse() to .slice().reverse() in FeaturesSection component
- **Duplicate Repo Type Detection:** Centralized detection logic to prevent multiple calls per render
- **TypeScript Build Error:** Extended Session interface with accessToken property via module augmentation
- **Windows Line Endings Bug:** Changed markdown parsers to use split(/\r?\n/) instead of split('\n') to handle CRLF line endings
- **GraphQL Rate Limit Type Error:** Added null safety check for data.resources.graphql before accessing properties

## [1.2.0] - 2025-11-27

### Added

- **Smart Links Column:** Issues and Dependabot alerts now show as badge buttons with counts (only when > 0)
- **Dependabot Alerts Button:** New shield icon button linking to /security/dependabot when alerts exist
- **Security Configuration Tracking:** Added Security Detail section to ROADMAP.md tracking 6 GitHub security settings
- **Activity Badge in Health Column:** Moved activity indicator to Health shields as 5th badge with time formatting
- **Health Breakdown Hover:** Interactive tooltip showing all 5 health components on grade letter hover
- **Community Standards Templates:** Expanded Fix buttons to 6 standards (CODE_OF_CONDUCT, SECURITY, LICENSE, CHANGELOG, ISSUE_TEMPLATE, PR_TEMPLATE)
- **Template Health Detection (Phase 4):** Content hashing to detect unchanged/stale templates marked as "dormant"
- **Template Version Tracking (Phase 4):** Track which template version docs are based on with template_version column
- **Malformed Detection (Phase 4):** Detect docs with template markers like "TODO:" or <50 characters
- **Contributor Analytics (Phase 5):** Track contributor count, commit frequency, bus factor, PR merge time
- **Bus Factor Analysis (Phase 5):** Calculate contributor concentration risk using 80/20 rule
- **Commit Frequency Tracking (Phase 5):** Average commits/week from last 12 weeks
- **PR Merge Time Tracking (Phase 5):** Average hours from PR creation to merge for last 30 PRs
- **Contributor Metrics Display (Phase 5):** Show contributor count, commits/week, bus factor, PR merge time in Repository Stats
- Database migrations: 006_add_template_version.sql, 007_add_contributor_metrics.sql
- Lines of Code (LOC) metrics with language breakdown from GitHub API
- LOC display in Repository Stats section with K suffix formatting (e.g., "12.5K")
- Test case counting parser (detects it(), test(), describe() calls in test files)
- Test case count display in Testing section with prominent badge
- CI/CD build status integration via GitHub Actions API
- CI/CD status badge in Best Practices section (passing/failing with workflow name and last run date)
- Vulnerability alerts integration via GitHub Security/Dependabot API
- Vulnerability count display in Repository Stats with severity-based color coding
- Critical vulnerability count highlighted in parentheses
- Database migrations: 002_add_loc_metrics.sql, 003_add_test_counts.sql, 004_add_ci_status.sql, 005_add_vulnerability_alerts.sql
- Health score component breakdown display with progress bars (Documentation 30%, Testing 20%, Best Practices 20%, Community 15%)
- README freshness tracking with color-coded staleness indicators (Fresh/Recent/Aging/Stale)
- Coverage score sync from METRICS.md to database during repository sync
- Docker as 10th best practice check (detects Dockerfile, docker-compose files, .dockerignore)
- PR Template correctly categorized under Community Standards (now 9 checks total: added CODEOWNERS and Copilot Instructions)
- Toast notification system replacing browser alerts
- Testing section enhancement with framework detection and test file counting
- Comprehensive feature audit and documentation accuracy review (November 2025)
- Feature detection matrix tracking 60+ items with detection/health/fix status
- AUDIT.md documenting critical gaps, strengths, and opportunities
- Repository stats (stars, forks, branches) in detail panel
- LICENSE.md tracking as a document type
- Comprehensive FEATURES.md documentation
- Code coverage visualization with progress bars
- AI summary display in expandable rows
- Activity tracking (last commit, PRs, issues)
- Default repositories feature
- Dynamic OAuth URL support for Netlify deployments
- 2-column layout for detail panels
- Repository type detection and badges

### Changed

- **Table Structure:** Removed Activity column (now 8 columns: Links, Repository, Type, Description, Language, Health, Docs, Actions)
- **Column Order:** Links moved to first position, Activity badge integrated into Health shields
- **AI Summary Display:** Changed condition from `includes('unavailable')` to `startsWith('Summary unavailable')` for better accuracy
- **Health Breakdown Positioning:** Moved hover group to grade span only (not entire Health column)
- **Doc Tooltips:** Enhanced with multiline status showing individual doc health states
- Reordered dashboard columns: Health, Activity, Links, Docs (previously Health, Docs, Activity, Links)
- GitHub link icon changed to purple Github icon, homepage link to green ExternalLink icon
- Hide button changed to red X icon with toast notification (removed confirmation dialog)
- Login redirect from header now correctly redirects to homepage instead of /api/auth/signin
- Moved Stats column from main table to detail panel
- Description column now hidden on smaller screens (xl+ only)
- Updated Gemini API model to `gemini-1.5-flash`
- Reorganized ExpandableRow component for better space utilization

### Removed

- **Activity Column:** Removed redundant Activity column from main table (functionality moved to Health shields)

### Fixed

- Coverage score from METRICS.md now properly stored in database and displayed in UI
- Health score breakdown now visible to users (previously calculated but not shown)
- Login redirect loop when signing in from header
- React key warnings in metrics mapping
- Null safety checks for metric names
- OAuth callback URL configuration for Netlify

## [0.1.0] - 2025-11-24

### Implemented

- Initial release
- GitHub OAuth authentication
- Repository dashboard with health scores
- Documentation tracking (ROADMAP, TASKS, METRICS)
- AI-powered repository summaries with Google Gemini
- Auto-fix missing documentation feature
- Batch "Fix All Docs" functionality
- Custom repository support
- Netlify deployment with Neon PostgreSQL
- Repository filtering and sorting
- Expandable detail rows

### Technical

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS
- NextAuth v5
- Neon (PostgreSQL) database
- Netlify Functions

---

_This changelog is maintained manually. For detailed commit history, see the Git log._

<!--
AGENT INSTRUCTIONS:
This file tracks all notable changes using Keep a Changelog format.

CRITICAL FORMAT REQUIREMENTS:
1. Use ## [Version] - YYYY-MM-DD for releases
2. Use ## [Unreleased] for upcoming changes
3. Group changes under: Added, Changed, Deprecated, Removed, Fixed, Security
4. Keep entries concise and user-focused
5. Link to issues/PRs where relevant

When updating:
1. Add new changes to [Unreleased] section
2. When releasing, rename [Unreleased] to version number with date
3. Create new empty [Unreleased] section
4. Follow semantic versioning (MAJOR.MINOR.PATCH)
-->
