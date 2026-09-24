# Tasks

## updated: 2026-09-24

## In Progress

## Todo

### P0 - Critical

- [x] Expanding any repo row crashes the whole dashboard ("This page couldn't load").
  - Priority: P0
  - Context: `token_density`/`comment_to_code_ratio` (Postgres NUMERIC) reach the client as strings, and `RepositoryStatsSectionStatic` called `.toFixed()` on them directly. Present in every deploy since token-density shipped (Sept 2026).
  - Status: ✅ FIXED (PR #225) — NUMERIC-backed props coerced via `toFiniteNumber()`; regression test in `RepositoryStatsSectionStatic.test.tsx`.

- [x] Add a React error boundary around expanded row details.
  - Priority: P0
  - Status: ✅ SHIPPED — `RowErrorBoundary` wraps `ExpandableRow` (desktop table + mobile card). A render error now degrades that one row to an inline "Couldn't render details" state with Retry; everything else keeps working. Unit-tested, and verified in a real browser: with the original bug reintroduced the e2e fails while the page stays up. Also hardened `RateLimitDisplay`, which threw on a malformed payload and unmounted the page.

- [x] Audit every other NUMERIC-backed field for the same string-vs-number bug.
  - Priority: P0
  - Status: ✅ SHIPPED — `lib/numeric.ts` normalizes `repos` (`coverage_score`, `commit_frequency`, `avg_pr_merge_time_hours`, `token_density`, `comment_to_code_ratio`), `repo_snapshots` and `metrics.value` at the API boundary (`/api/repos`, `/api/repo-details/[name]` + `/trend`, `/api/repos/[name]/sync`), so the client gets real numbers and the declared types are true. The UI-side `toFiniteNumber()` stays as defence in depth.

- [x] Scope the repo LIST and sibling routes by repo access (CWE-639, follow-up to PR #221).
  - Priority: P0
  - Status: ✅ SHIPPED — `GET /api/repos` returns only default repos, verified-public repos, and repos the caller has a `repo_access` grant for. Every by-name route (`debug`, `events`, `fix-*`, `generate-summary`, `hide`, `unhide`, `update-type`, `improve-doc`, `suggest-*`, `roadmap-items/[id]`, `enrich-template`) now runs `denyIfNoRepoAccess()`; `context`, `dependencies` and `pmo/overview` filter to accessible repos (the MCP bearer key keeps full-portfolio access). Also found and fixed: `debug` had **no auth at all** and dumped a repo's roadmap/tasks/features/metrics to anyone, and `hide`/`unhide`/`update-type`/`roadmap-items` let any signed-in user modify any repo.
  - Follow-ups: `name` is not unique across owners (see the trend-route ticket below); the guard requires access to every repo sharing a short name, which is conservative but correct.

- [x] Backfill `private_repo` for repos synced before PR #221.
  - Priority: P0
  - Status: ✅ SHIPPED (fails closed) — instead of trusting the `FALSE` default, a new `visibility_verified` column is set only when a sync has actually read `private` from GitHub. Unverified rows are treated as possibly-private until re-synced (default repos are always visible). **After deploy, each user must click Sync once** to re-verify and re-grant their repos; until then their own private repos will be hidden from them too. This is deliberate.

### P1 - High

- [x] Rename the GitHub repo `nitsuah/overseer` -> `nitsuah/vigil` (**post-merge step, needs a human go-ahead**).
  - Priority: P1
  - Status: code is ready — `DEFAULT_REPOS`, `repo-type`, scripts, README/templates and tests reference `vigil`, and an idempotent migration renames the existing `repos` row (`full_name`, `name`, `url`) so tasks/roadmap/snapshots/access grants survive instead of a duplicate row being created.
  - Runbook, in this order: (1) merge and let Netlify deploy (the migration runs on first request); (2) `gh repo rename vigil --repo nitsuah/overseer`; (3) `git remote set-url origin https://github.com/nitsuah/vigil.git`; (4) sign in and click Sync so the default repo re-syncs under its new name; (5) confirm the smoke workflow is green. Renaming _before_ deploying would let a sync insert a second `nitsuah/vigil` row and cause the migration to skip.
  - Netlify's GitHub link (keyed by repo ID) and OAuth (keyed by the site domain) are unaffected.
  - Status: ✅ DONE (verified 2026-09-24 PMO audit) — `gh repo view nitsuah/overseer` resolves to `https://github.com/nitsuah/vigil` and the local `origin` remote is already `https://github.com/nitsuah/vigil.git`.

- [x] Decide whether to rename the Netlify site (`ghoverseer`) / add a custom domain.
  - Priority: P1
  - Decision: **keep `ghoverseer.netlify.app` for now.** Renaming changes the live URL and requires editing the GitHub OAuth App's callback URL by hand (no API for it) in the same moment, or sign-in breaks; the only benefit is cosmetic. There is no custom domain today. Revisit if/when a custom domain is added — do the domain, the Netlify site name and the OAuth callback together, and update `SITE_URL` in `.github/workflows/smoke.yml` and `playwright.smoke.config.ts`.

- [x] Run the Playwright e2e suite for real and wire it into CI.
  - Priority: P1
  - Status: ✅ SHIPPED — the old suite needed a live DB and had never run in CI (it asserted the wrong title for weeks). New DB-free suite `e2e/mocked/ui.spec.ts` (all `/api` calls mocked; expands a row using the exact NUMERIC-string payload that crashed prod; signed-out / signed-in / sign-out chat boundary with a real Auth.js session cookie) runs in `.github/workflows/e2e.yml` on every PR and push. Executed for real in the official Playwright image (6/6 pass) and mutation-checked. The live-API suite (`e2e/dashboard.spec.ts`) remains a local, DB-backed run.

- [x] Smoke-test the deployed app after each merge.
  - Priority: P1
  - Status: ✅ SHIPPED — `.github/workflows/smoke.yml` waits until `/api/version` reports the merged commit, then runs `e2e/smoke/prod.spec.ts` against production (rows render, expanding a live row survives, API serves real numbers). Run against today's production it passes the row checks and correctly fails the API-numbers check until this ships.

- [x] Connect vigil's agent task queue to agent-board's local model runtime (dispatch bridge v0).
  - Priority: P1
  - Context: vigil exposes an Agent Task Queue API and agent-board runs a local model runtime, but no bridge routes tasks between them.
  - Acceptance Criteria: a v0 bridge dispatches at least one queued vigil task to agent-board's runtime and reports completion status back to the queue.
  - Status: ✅ SHIPPED (PR #159, hardened in PR #204) — `motorPoolBridge.dispatch()` in `lib/agent-bridge.ts` creates a session via agent-board's `POST /api/sessions`, delivers the task as the session's first message via `POST /api/sessions/:id/message`, and returns the `motorPoolSessionId`; `app/api/agent/tasks/route.ts`'s queue runner awaits the dispatch and writes the result/status (`completed`/`failed`) back onto the queued task, with a simulated-execution fallback (preserving any already-created session id) when the runtime is unreachable. Covered by `tests/agent-bridge.test.ts` and `tests/agent-tasks.test.ts` (full suite: 562 tests passing, `tsc --noEmit` clean).

### P2 - Medium

- [ ] Chat-driven doc editing (TASKS/ROADMAP/FEATURES) — stage 3 remaining.
  - Priority: P2
  - Context: the per-repo chat panel (PR #196) only answered questions before this branch — it rebuilt context and replied, but couldn't act.
  - Acceptance Criteria: broken into stages — (1) chat can propose a specific, diffable edit to one doc file and show it inline before applying; (2) accepting the proposal opens a PR via the existing fix-doc PR flow rather than writing directly; (3) the chat can check an item off in TASKS.md or move it to FEATURES.md when the user confirms it's shipped, referencing the same parser the dashboard already uses so state never diverges from what's rendered elsewhere; (4) before calling `createPrForFile`, the caller-supplied target path must be validated against the approved doc list (TASKS.md/ROADMAP.md/FEATURES.md, matching the existing `TARGET_PATHS` mapping) — never pass a chat-supplied path straight through unchecked.
  - Status: stages (1), (2), and (4) ✅ SHIPPED — `parseDocEditProposal` in `lib/repo-chat.ts` extracts a fenced ` ```proposal``` ` JSON block from the assistant's reply; `RepoChatPanel` renders it as an inline card with Apply/Dismiss; Apply routes the proposed content into the existing preview-and-PR modal (`onApplyProposal` in `app/page.tsx`) rather than writing directly; `fix-doc`'s `TARGET_PATHS` validation (already hardened in this branch) covers the PR path. Stage (3) — checking off/moving items directly from chat — still open.

- [ ] Add cross-repo dependency mapping.
  - Priority: P2
  - Context: agent-board, bb-mcp, nitsuah-io, and vigil share overlapping stacks and could benefit from surfaced cross-repo links.
  - Acceptance Criteria: the dashboard shows inferred or declared connections between related repos and surfaces shared-stack signals; visualized as an interactive 3D graph with filter and click-to-detail interactions.
  - Status: 🟡 PARTIAL (PR #204) — `GET /api/dependencies` infers connections from shared topics + primary language; rendered as a collapsible SVG graph + connection list (`DependencyGraph.tsx`) on the dashboard. The 3D/click-to-detail visualization from the original acceptance criteria is not implemented — current graph is 2D SVG.

- [ ] Thread `full_name` through to the trend endpoint instead of matching by short `name`.
  - Priority: P2
  - Context: flagged by CodeRabbit on PR #204 (2026-09-09) — `GET /api/repo-details/[name]/trend` matches `repos.name`, which is ambiguous if two tracked repos across different owners share a short name. `repo.full_name` is already available at every call site (`RepoTableRow.tsx`, `MobileRepoCard.tsx`) but isn't threaded through `ExpandableRow` -> `RepositoryStatsSectionStatic` -> the trend fetch URL. Deferred rather than rushed since it touches three component layers.
  - Acceptance Criteria: the trend route (and its callers) key on `full_name` or `repo_id`, not the bare `name` column; add a regression test with two same-named repos under different owners.

- [x] Durably persist agent task receipts instead of a fire-and-forget write.
  - Priority: P2
  - Context: flagged by CodeRabbit on PR #204 (2026-09-09) — `app/api/agent/tasks/route.ts` calls `void persistReceipt(task)` without awaiting it or handling failure, so a receipt can silently be lost if the serverless instance is recycled before the write completes. Deferred — needs a design decision (await + surface failure to the caller vs. a durable queue) rather than a blind await that could turn a background write into a slow foreground one.
  - Acceptance Criteria: task receipts are durably persisted (or the caller is told persistence failed) even when the serverless instance is recycled immediately after the response is sent.
  - Status: ✅ SHIPPED — went with option (a) (await + surface failure) rather than a durable queue: this is a single row insert into an already-Neon-backed table, so a queue's added complexity (its own persistence/retry semantics) wasn't justified by the risk being mitigated. `persistReceipt` in `app/api/agent/tasks/route.ts` now returns `{ success, error? }` and is `await`ed (not `void`-fired) from `processQueue` for both the completed and failed branches, so the write is sequenced instead of racing serverless teardown as an orphaned promise. A failure is caught (never thrown), logged loudly via `logger.warn` (matching this codebase's convention), and recorded on the task as `receiptPersisted` / `receiptError` — never masking the task's own `status`/`error`. Note: the original POST response (202 `accepted`) is sent before the task even starts executing (the queue already runs detached via `void processQueue()`), so there is no request in flight to attach a synchronous warning to; failures are instead surfaced through the existing polling path (`GET /api/agent/tasks?id=...`) where callers already read back task status. Covered by 3 new tests in `tests/agent-tasks.test.ts` (receipt-success, receipt-failure-on-completed-task, receipt-failure-on-failed-task — asserting the route doesn't crash, the task's own result/error is untouched, and `logger.warn` is called). Full suite: 565 tests passing (562 baseline + 3 new), `tsc --noEmit` clean, lint clean (0 errors).

- [x] Paginate `reviewThreads`/`refs` GraphQL connections for large PRs and repos.
  - Priority: P2
  - Context: flagged by CodeRabbit on PR #204 (2026-09-09) — two related gaps: (1) `lib/github/prs.ts`'s stale-review query requests `reviewThreads(first: 50)` unpaginated, so a PR with more than 50 threads can be misclassified as `staleReview` (only the first page is checked for `isResolved`); (2) `lib/github/repos.ts`'s `getZombieBranches` requests `refs(first: 100, ...)` unpaginated, so repos with more than 100 branches will under-report zombie branches beyond the first page. Deferred together since both need the same nested-connection pagination pattern; (2) is more tractable (single top-level connection) than (1) (nested under `pullRequests`).
  - Acceptance Criteria: both queries page through their full result set (or a documented, deliberately-capped window) rather than silently truncating at the first page.
  - Status: ✅ SHIPPED — `getZombieBranches` (`lib/github/repos.ts`) now follows `pageInfo { hasNextPage endCursor }` with `after: $cursor` until exhausted, capped at `MAX_REFS_PAGES = 20` (2,000 branches) as a documented runaway-repo safety net — refs are ordered most-recently-committed-first, so the stale branches we actually care about sit at the tail and can't be found without walking every page. `getPullRequestReadiness` (`lib/github/prs.ts`) fetches page 1 of `reviewThreads` inline as before, then a new `fetchAllThreadsResolved` helper follows further pages via `node(id: $id) { ... on PullRequest { reviewThreads(first: 100, after: $cursor) } }` — short-circuiting the moment an unresolved thread is found (no need to keep paginating a PR that's already disqualified from `staleReview`), capped at `MAX_REVIEW_THREAD_PAGES = 20` per PR (2,000 threads) as the same kind of documented safety net. Covered by 6 new tests in `lib/github.test.ts` (2 pagination-follow tests + 1 cap test for `getZombieBranches`; 2 pagination-follow tests + 1 short-circuit test for `reviewThreads`). Full suite (including the `MobileRepoCard.tsx` change below): 582 tests passing, `tsc --noEmit` clean, lint clean (0 errors).
  - Follow-up (CodeRabbit, PR #216 review): `fetchAllThreadsResolved` had two correctness gaps of its own. (1) An incomplete follow-up fetch (missing connection, or hitting the page cap while more pages remained) returned `hadThreads` — which could be `true` — instead of failing closed; a PR with genuinely-unresolved threads beyond the cutoff could be misreported as `staleReview: true`. Now returns `false` whenever the connection isn't fully exhausted. (2) A follow-up `octokit.graphql` call throwing (rate limit, network blip) propagated up through the PR loop and hit `getPullRequestReadiness`'s outer catch, zeroing out readiness data for every PR in the repo, not just the one that failed. Now caught locally in `fetchAllThreadsResolved` and contained to `false` for that one PR. 2 more regression tests added (584 total, up from 582); `tsc --noEmit` and lint still clean.

- [x] Move focusable PR/CI/homepage links out of the mobile repo card's `role="button"` wrapper.
  - Priority: P2
  - Context: flagged by CodeRabbit on PR #204 (2026-09-09) — `MobileRepoCard.tsx` renders focusable `<a>` links for CI/PR/homepage nested inside the card's outer `role="button" tabIndex={0} onKeyDown` wrapper, which is an accessibility anti-pattern (nested interactive elements produce inconsistent keyboard/screen-reader behavior). Deferred as a heavier restructure rather than a quick class-name fix. Re-flagged on PR #215 (2026-09-11): the new stale-review-PR link added there is one more instance of this exact same pre-existing wrapper pattern — not a new problem, but the eventual restructure needs to cover it too.
  - Acceptance Criteria: the card's expand/collapse affordance and the CI/PR/homepage links are structurally siblings (not nested interactive elements), verified with a keyboard-navigation and screen-reader pass.
  - Status: ✅ SHIPPED — the outer `role="button" tabIndex={0} onKeyDown` wrapper is gone. The expand/collapse control is now a real `<button>` absolutely positioned (`inset-0`) behind the card content as a SIBLING of it, not an ancestor — so the repo-name/homepage/CI/PR links and the chat/sync/hide/restore buttons are no longer descendants of anything interactive. The content wrapper is `pointer-events-none` so clicks on plain text/whitespace fall through to the expand button beneath, while each actual interactive element (and a couple of tooltip-bearing badges, to keep native `title` hover working) is individually re-enabled with `pointer-events-auto`. Every `e.stopPropagation()` that existed purely to fight the old parent's click handler is gone — there's no longer a parent to fight. `TypeEditor`/`HealthBreakdown`'s own internal `stopPropagation()` calls are untouched since those are shared components still used by `RepoTableRow.tsx`, which still has its own `<tr onClick>`. Audited `RepoTableRow.tsx` per the acceptance criteria: it does **not** have the analogous anti-pattern — its `<tr>` has an `onClick` but no `role="button"`/`tabIndex`, so it's never exposed to assistive tech as an interactive ancestor (a different, milder gap — mouse-only activation — not the doubled-interactive-semantics problem this ticket targets — left as-is to avoid scope creep). Verified via `docker compose` test run: updated 2 keyboard-activation tests in `MobileRepoCard.test.tsx` that asserted a manual `onKeyDown` handler (jsdom doesn't synthesize `click` from `fireEvent.keyDown` on a real `<button>` the way real browsers do) to instead assert the semantic guarantee — it's a native `<button>` — plus 2 new regression tests proving a click on the repo-name link doesn't bubble into the toggle and isn't nested inside it. Full suite: 582 tests passing, `tsc --noEmit` clean, lint clean (0 errors).

- [ ] Remove or redirect the stale `docs/` copies of the planning docs.
  - Priority: P2 · Type: Docs · Confidence: High
  - Context: found in the 2026-09-24 PMO audit. `docs/TASKS.md`, `docs/ROADMAP.md`, `docs/METRICS.md` and `docs/CHANGELOG.md` were last changed 2026-06-30. All five `docs/` copies were added in #159 (`docs-prep`), which built the `docs/` fallback, and the root originals were never removed and `docs/FEATURES.md` on 2026-08-23. The root copies are current (2026-09-18/19). `lib/sync.ts` reads the root file first and only falls back to `docs/`, so vigil ignores the `docs/` copies for itself. A reader browsing `docs/` still sees June data, for example `docs/METRICS.md` reporting 92.09% coverage and 255 tests from 2026-05-23.
  - Acceptance Criteria: each `docs/` duplicate is either deleted or replaced with a one-line pointer to the root file, and no doc or script links to the stale copies.
  - Status: 🟡 PARTIAL (2026-09-24, fixes F-20260924-03) — `docs/TASKS.md`, `docs/ROADMAP.md`, `docs/METRICS.md` and `docs/FEATURES.md` deleted after diffing each against its root counterpart: every docs-only line was either superseded in root (Overseer→Vigil / motor-pool→agent-board renames, items since shipped, refreshed metrics and health-score weights) or intentionally dropped (the stash deprioritize item, removed in #200). No doc, script, test or workflow linked to them; the remaining `docs/*.md` references in `lib/sync.ts` and `app/api/preview-templates/route.ts` are the generic fallback/target paths for _other_ repos and stay. Still open: `docs/CHANGELOG.md` is not a pure duplicate — it has a handful of entries missing from root `CHANGELOG.md` (AI failover integration, default model bump to `gemini-2.5-flash`, repo-detail query batching, roadmap-to-DEV-flow handoff linkage, test model candidates) that need merging into root before it can be deleted.

### DB & backend scaling

- [x] Move the authenticated shared-key rate limiter to a shared store.
  - Priority: P2
  - Context: `checkAuthedSharedKeyRateLimit` (`lib/repo-chat.ts`) tracks usage in a process-local `Map`. Netlify's Next.js serverless runtime can run separate instances per invocation, so each cold-started instance starts with an empty map — a user can receive up to `AUTHED_SHARED_KEY_RATE_LIMIT` (30) shared-key requests per instance within the same 5-minute window instead of 30 total, undermining the budget the limit exists to enforce. Flagged by CodeRabbit on PR #204 (2026-09-09); deliberately deferred rather than building a Neon-backed shared counter blind — needs a real design pass (TTL semantics, write contention under concurrent requests, and whether to reuse the existing Neon connection or add Redis) rather than a rushed fix.
  - Acceptance Criteria: the limiter's state is shared across all serverless instances (e.g. a Neon table with atomic increment + expiry, or a dedicated store), and a burst of requests for one user across multiple cold-started instances is still capped at the configured budget.
  - Status: ✅ SHIPPED (PR #204) — the process-local `Map` is gone; a new `shared_key_rate_limits` Neon table (`lib/schema-migrations.ts`, `user_email` PK + `count` + `reset_at_ms`) backs `reserveAuthedSharedKeySlot`/`releaseAuthedSharedKeySlot` (`lib/repo-chat.ts`), reached via the existing Neon connection (no new dependency). The counter is a fixed window keyed by `reset_at_ms`, updated with a single `INSERT ... ON CONFLICT (user_email) DO UPDATE` whose `CASE` branches roll the window when expired and otherwise increment in place; Postgres's per-row lock on that upsert serializes concurrent writers instead of racing. Covered by `tests/repo-chat.test.ts` (`reserveAuthedSharedKeySlot / releaseAuthedSharedKeySlot`), including a test that re-imports the module via `vi.resetModules()` between calls against the same fake table to prove a burst across simulated cold-started instances still caps at `AUTHED_SHARED_KEY_RATE_LIMIT`, and a `Promise.all` concurrency test. Full suite: 571 tests passing (1 pre-existing skip, unrelated — no `GEMINI_API_KEY` in the test env), `tsc --noEmit` clean.

- [x] Reserve shared-key quota before a personal-key fallback call, not after.
  - Priority: P2
  - Context: `app/api/repos/[name]/chat/route.ts`'s BYOK flow only checks `checkAuthedSharedKeyRateLimit` up front when no personal key is configured at all. If a configured personal key exists but fails at call time (revoked/expired/out of quota), `generateAIContent` silently falls through to the shared key, and the route only charges/warns against the budget _after_ that shared-key spend already happened (CWE-770, flagged by CodeRabbit on PR #204, 2026-09-10). The spend for that one request can't be recovered either way; a rushed pre-check can't know in advance whether the personal key will fail, so a real fix needs the rate limiter to support reserve-then-release semantics (reserve a slot before the fallback call, release it if the personal key actually succeeds) — not guessed at alongside the still-deferred shared-store work above, since both touch the same limiter.
  - Acceptance Criteria: a user whose personal key is failing cannot exceed the shared-key budget across repeated requests, verified by tests that simulate consecutive personal-key failures.
  - Status: ✅ SHIPPED (PR #204) — `reserveAuthedSharedKeySlot` is called immediately before `generateAIContent` (after repo lookup/access check/DB transaction, so a 404 or transaction failure never consumes a slot for an AI call that was never attempted), for every signed-in user regardless of whether a personal key is configured; a rejected reservation short-circuits with 429 before the AI call runs. After the call, `releaseAuthedSharedKeySlot` gives the slot back only when `usingOwnKey` is true — a configured-but-failing key keeps its reservation, closing the CWE-770 gap — and if `generateAIContent` throws outright (provider outage), the reservation is also released before the error propagates, so a total-outage burst can't permanently drain the budget either. Both the release call and the release-on-throw path are wrapped in try/catch (a transient Neon blip must not turn an already-generated reply into a 500). Covered by `tests/repo-chat-api.test.ts`'s "authenticated shared-key rate limiting" suite: consecutive personal-key failures capped at budget; a working key across 3x budget never throttled; successes interleaved with failures don't erode the budget; 2x-budget provider-outage failures don't drain the budget either. **Known trade-off, not covered by the added tests:** because the reservation is unconditional per signed-in user, a BYOK user firing genuinely _concurrent_ (not sequential) requests could theoretically see a 429 from the shared-key budget even with a fully working personal key, in the narrow window before an earlier request's release lands. Accepted (bounded shared-key cost beats a narrow high-concurrency BYOK edge case).

- [ ] Give every authenticated session a stable rate-limiter identity, not just `session.user.email`.
  - Priority: P2
  - Context: flagged by CodeRabbit on PR #211 (2026-09-11) — the entire shared-key reservation block in `app/api/repos/[name]/chat/route.ts` is gated on `session?.user?.email`. GitHub's OAuth profile can return a null email (an account with no public/verified email), in which case that gate is skipped entirely and the request proceeds through `generateAIContent` with **no shared-key rate limiting or budget at all** — a full bypass, not just a narrow edge case. Confirmed this gate predates PR #211 (the original process-local-`Map` code had the identical `if (session?.user?.email)` condition), so it's a pre-existing gap PR #211 didn't introduce — not fixed inline because it touches `auth.ts`/session-shape internals (does NextAuth's JWT session reliably expose a stable non-email id like `token.sub` on `session.user`? not currently wired up) and deserves its own scoped change + tests rather than a rushed edit alongside an already-large rate-limiter PR.
  - Acceptance Criteria: every authenticated session has a stable identifier available to the rate limiter (email when present, falling back to a stable provider id such as GitHub's numeric user id otherwise) — no authenticated session can reach `generateAIContent` without being subject to either the shared-key budget or an explicit BYOK exemption. Add a route test covering an authenticated session with no email.

- [x] Assess current DB design for scalability as repo and user count grows.
  - Priority: P2
  - Context: the current schema works at small scale; no formal review has been done for indexing strategy, query patterns at 100+ repos, or connection pooling limits.
  - Acceptance Criteria: a brief written assessment covers index coverage, slow-query candidates, and a recommendation on whether schema changes are needed before Q3 feature work.
  - Status: ✅ SHIPPED (PR #204) — `docs/db-scaling-assessment.md` covers index coverage, slow-query candidates, and connection pooling.

### P3 - Exploratory

- [ ] Add zombie-branch detection.
  - Priority: P3
  - Context: the UI does not yet surface stale long-lived branches.
  - Acceptance Criteria: stale branches are detected and flagged in the interface with a bulk-action dialog to delete selected branches (confirmation step, scaling across all repos); includes a "clean up hidden repos" action to safely purge DB cache for hidden/removed repos with a confirmation step noting the GH source is untouched.
  - Status: 🟡 PARTIAL (PMO audit 2026-09-24) — detection exists (`ZombieBranch` in `lib/github/repos.ts`, `zombie_branch_count` in `lib/db.ts`) and the count renders in `RepoTableRow.tsx` / `MobileRepoCard.tsx`. The bulk-delete dialog and the "clean up hidden repos" action from the acceptance criteria are not built yet.

- [x] Add maintenance-mode detection.
  - Priority: P3
  - Context: dormant repositories are not yet automatically classified.
  - Acceptance Criteria: inactive repos are flagged past a defined threshold.
  - Status: ✅ SHIPPED (PR #200) — `detectActivityState` in `lib/repo-signals.ts`, 90+ days no commits → "maintenance" badge on desktop + mobile cards.

- [x] Add token-density metrics.
  - Priority: P3
  - Context: token density is still only an exploratory repo-health metric.
  - Acceptance Criteria: logical-unit density is stored and surfaced usefully.
  - Status: ✅ SHIPPED (PR #204) — `lib/parsers/code-density.ts` computes `token_density` from sampled source files during sync; surfaced in expanded repo stats (desktop + mobile).

- [x] Add comment-to-code ratio metrics.
  - Priority: P3
  - Context: documentation density remains an idea rather than a measured signal.
  - Acceptance Criteria: file-level and aggregate ratios are calculated and displayed.
  - Status: ✅ SHIPPED (PR #204) — `comment_to_code_ratio` computed alongside token density in `lib/parsers/code-density.ts`, surfaced in expanded repo stats (desktop + mobile).

- [ ] Add a dark and light mode toggle.
  - Priority: P3
  - Context: theme preferences are still not user-configurable.
  - Acceptance Criteria: the UI supports a persistent theme toggle.

- [ ] Add velocity scoring and technical-debt trending.
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
