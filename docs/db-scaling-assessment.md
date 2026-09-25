# DB Scaling Assessment

> 🧭 [vigil](../README.md) · [Features](../FEATURES.md) · [Roadmap](../ROADMAP.md) · [Tasks](../TASKS.md) · [Changelog](../CHANGELOG.md) · [Metrics](../METRICS.md) <!-- nav -->

**Date:** 2026-09-01
**Scope:** Neon serverless Postgres schema + query patterns at 100+ repos / growing user count.
**Status:** Assessment only — no schema changes required before Q3 feature work.

## 1. Current shape

- **`repos`** — one wide row per repo (~60 columns). PK `id` (UUID), `full_name` UNIQUE. Indexed: `repo_type`, `health_score`, `coverage_score`, `last_commit_date`, `contributor_count`, `has_security_policy`.
- **Detail tables** — `tasks`, `roadmap_items`, `metrics`, `doc_status`, `features`, `best_practices`, `community_standards`, all `repo_id` FK → `repos(id)` ON DELETE CASCADE, all indexed on `repo_id` (plus `status`/`health_state`/`subsection` where filtered).
- **`users`** — `github_id` UNIQUE, `github_username` UNIQUE. FORCE RLS; every write must set `app.current_github_id`.
- **`agent_task_receipts`** — append-only log, indexed on `created_at`, `type`.
- **`repo_snapshots`** — time-series per repo, indexed on `(repo_id, captured_at)`.
- RLS: "Allow all" policies on all tables except `users` (FORCE RLS).

## 2. Index coverage

| Table                                | Filter/join columns                                                                        | Indexed?             |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------- |
| repos                                | `full_name` (lookup)                                                                       | ✅ UNIQUE            |
| repos                                | `is_hidden`, `is_archived`, `is_fork`, `repo_type`, `stars`, `updated_at` (dashboard sort) | ⚠️ partial           |
| tasks                                | `repo_id`, `status`, `subsection`                                                          | ✅                   |
| roadmap_items                        | `repo_id`, `status`                                                                        | ✅                   |
| metrics                              | `repo_id`, `timestamp`                                                                     | ⚠️ `repo_id` only    |
| doc_status                           | `repo_id`, `health_state`                                                                  | ✅                   |
| features                             | `repo_id`                                                                                  | ✅                   |
| best_practices / community_standards | `repo_id`                                                                                  | ✅                   |
| agent_task_receipts                  | `submitted_by_email`, `created_at`                                                         | ⚠️ `created_at` only |
| repo_snapshots                       | `(repo_id, captured_at)`                                                                   | ✅                   |

**Gaps (low priority at current scale):**

- `metrics(repo_id, timestamp)` composite — the repo-details query orders by `timestamp` per repo. Fine at ~100 repos; add composite if metrics rows per repo grow large.
- `agent_task_receipts(submitted_by_email, created_at)` — the `?receipts=true` query filters by email then orders by `created_at`. Add composite when receipt volume grows.
- Dashboard sort on `repos` uses a `CASE` on `repo_type` + `stars DESC` + `updated_at DESC`. A composite index won't help the `CASE` expression; acceptable since the row count is bounded by portfolio size (~100).

## 3. Slow-query candidates

1. **`SELECT * FROM repos` (dashboard)** — full scan + sort. Bounded by portfolio size; fine. If it ever grows past ~1k rows, add a partial index on `(is_hidden, is_archived)` and consider dropping `SELECT *` to a column list.
2. **repo-details 7-table transaction** — already batched into one `db.transaction()` (PR #128). Each query is `repo_id`-indexed. Good.
3. **`syncRepo` upsert** — `ON CONFLICT (full_name)` uses the UNIQUE index. Good.
4. **`repo_snapshots` insert per sync** — indexed on `(repo_id, captured_at)`. Good.
5. **`agent_task_receipts` insert** — append-only, no contention. Good.

## 4. Connection pooling

- Neon serverless: each `getNeonClient()` call creates a pooled connection. The app uses short-lived queries per request — no long-lived transactions held across awaits except the batched repo-details transaction (single round trip).
- **Recommendation:** keep using the pooled endpoint (`NETLIFY_DATABASE_URL` / `DATABASE_URL` with `-pooler` host). No PgBouncer config needed — Neon's pooler handles it. If request volume spikes, the main lever is caching (see §5), not more connections.

## 5. Recommendations before Q3 feature work

1. **No schema changes required.** Current indexes cover all hot paths.
2. **Add `metrics(repo_id, timestamp)` composite** when per-repo metric rows exceed ~1k (trending queries will hit it).
3. **Add `agent_task_receipts(submitted_by_email, created_at)` composite** when receipt volume grows (chat panel + PMO receipts view).
4. **Cache the dashboard repos query** (5-min TTL, mirroring `lib/github-cache.ts`) — it's the hottest read and re-runs on every page load.
5. **Keep `SELECT *` on `repos`** for now — the row is wide but the count is bounded; revisit if the portfolio exceeds ~1k repos.
6. **`repo_snapshots` growth** — one row per repo per sync. At 100 repos × daily sync = ~36k rows/year. Trivial. Add a retention cleanup (e.g. keep 2 years) only if sync frequency increases.

## 6. Verdict

Schema is healthy for the Q3 feature set. The only must-do is the two composite indexes **when** the relevant tables grow — neither is blocking today. Connection pooling is already handled by Neon's pooler.
