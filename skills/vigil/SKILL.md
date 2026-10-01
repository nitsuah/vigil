---
name: vigil
description: Use Vigil (repo-portfolio dashboard + MCP server) to decide what to work on across many GitHub repos, check a repo's health before changing it, respect cross-repo relationships, and keep TASKS.md / ROADMAP.md / FEATURES.md in the shape Vigil parses. Trigger on "what should I work on next", "what's open across my repos", "which repos need attention", "is <repo> healthy", "what depends on <repo>", before any cross-repo change, and before opening a PR that finishes a tracked task.
---

# Vigil

Vigil syncs every GitHub repo you track, grades each one 0–100, parses each repo's
`TASKS.md` / `ROADMAP.md` / `FEATURES.md` / `METRICS.md`, and exposes all of it to
agents through an MCP server (`vigil`) and `GET /api/context`. Use it so you don't
have to open 17 `TASKS.md` files to know what matters.

The data is only as fresh as the last sync and only as good as the docs in each
repo. Most of this skill is about reading it correctly and writing docs it can parse.

## 0. Check the connection first

The tools are named `mcp__vigil__<tool>`. If they aren't available, don't guess
at portfolio state. Tell the user and point them at setup:

```bash
claude mcp add --transport http --scope user vigil https://<vigil-host>/api/mcp --header "Authorization: Bearer $VIGIL_MCP_KEY"
claude mcp get vigil   # expect: Status: ✔ Connected
```

- The URL must end in `/api/mcp`. The bare site URL fails to connect.
- In PowerShell use `$env:VIGIL_MCP_KEY`; plain `$VIGIL_MCP_KEY` registers an empty `Bearer` header and every call 401s.
- `-32603 Error connecting to database` means the server's `DATABASE_URL` is unreachable (common for local dev), not a bug in your call.

## 1. Pick the right tool

| Question                          | Tool                                        | Notes                                                                                                         |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| What should I work on next?       | `get_open_tasks`                            | P0 first. Start with `priority: ["P0","P1"]`; widen only if empty.                                            |
| What's open in repo X / X and Y?  | `get_open_tasks` with `repos: [...]`        | Use `list_tasks` only when you also need done items.                                                          |
| Which repos matter most?          | `list_repos` with `tier: "T1"`              | Tiers are user-assigned (T1 critical → T4 low); `"untiered"` finds unclassified repos.                        |
| Which repos need attention?       | `get_portfolio_overview`, then `list_repos` | `list_repos` is sorted worst health first; filter with `min_health`, `has_vulns`, `language`, `type`, `tier`. |
| Is repo X healthy / safe to ship? | `get_repo_health`, `get_security_summary`   | Health is graded against the repo's profile (starter / production / enterprise).                              |
| Full picture of one repo          | `get_repo_details`                          | Tasks, roadmap, docs, best practices, community standards.                                                    |
| Find a repo by fuzzy name         | `search_repos`                              | Use before other tools when the user gives a partial name.                                                    |
| What uses / is used by X?         | `get_relationships` with `repo`             | Check **before** changing an API, schema, or deploy shape.                                                    |
| I found a real dependency         | `propose_relationship`                      | Evidence required (file path, URL, PR). Lands as `proposed` for a human to confirm.                           |
| One-shot dump for a long session  | `GET /api/context` (or `?repo=owner/repo`)  | Same bearer key. Has `open_work` (P0/P1) and `relationships` blocks.                                          |

Repo arguments accept the short name (`vigil`) or `owner/repo`. Prefer `owner/repo`
when two owners could share a short name. `list_tasks` takes `name`, not `repo`.

## 2. Core workflows

### "What should I work on next?"

1. `get_open_tasks` with `priority: ["P0","P1"]`.
2. If the user has tiers set, cross-check with `list_repos` `tier: "T1"`. A P1 in a T1 repo beats a P1 in a T4 repo.
3. Present a short ranked list: priority, repo, title, owner if set. Say which are `in-progress` already.
4. If everything is empty, say so and offer P2, rather than inventing work.

### Before a change that crosses repo boundaries

1. `get_relationships` with `repo` set to the repo you're changing.
2. For every edge where your repo is the `target`, the `source` repo is a consumer. Name them to the user and check the contract they rely on (the `context` line says how).
3. If you discover an undocumented dependency while working, `propose_relationship` with evidence. Never claim a proposed edge is confirmed.

### Triage one repo

1. `get_repo_health`. Grades: A+ ≥ 95, A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, else F.
2. `get_repo_details` for missing docs, best practices, and community standards.
3. Fix the cheapest high-weight gaps first. Security carries the most weight in the production and enterprise profiles, and disabled detection controls (Dependabot, code scanning, secret scanning) cost points even with zero open alerts.
4. Missing docs or standards can be opened as a PR from the dashboard (**Fix** / **Fix All**). Vigil never pushes to the default branch.

### Finishing tracked work (do this every time)

Vigil and any status reports read `TASKS.md` from `main`. A PR that finishes a tracked item must close it **in the same PR**:

1. Code and tests first.
2. Before the last push: tick the item `- [x]` with a one-line `Done <date>: <what>` note (or remove it and condense into `CHANGELOG.md` / `FEATURES.md` if the file's footer says so). Tick or condense the matching `ROADMAP.md` line, add a `CHANGELOG.md` Unreleased line, and fix `README.md` / `FEATURES.md` if the change alters what they claim.
3. Name the closed items in the PR description.
4. Pre-merge check: `git diff origin/main...HEAD --stat` includes the tracking docs.

Never "merge now, docs PR later". That is how finished work keeps showing as open.

## 3. Write docs Vigil can parse

Vigil re-parses these on every sync (or within seconds of a push when the webhook is set up).

**TASKS.md**

```markdown
## In Progress

- [ ] Migrate auth to the new session shape
  - Priority: P1
  - Owner: claude

## Todo

### P0 - Critical

- [ ] Rate-limit the public webhook endpoint

### P2 - Medium

- [ ] Add CSV export (P2, M)
```

- One checkbox per line, starting at column 0: `- [ ]` todo, `- [/]` in progress, `- [x]` done. Titles can't wrap onto a second line; indented lines are only read as `Priority` / `Owner` sub-bullets.
- Priority, most explicit wins: `- Priority: P1` sub-bullet → inline `(P2, M)` / `[P1]` tag → enclosing `### P1 - High` / `## P2` heading → `none`.
- Owner: `- Owner: <name>` or `- Assignee: <name>`. Use it to mark work for a specific agent or "you — manual step".
- Anything unchecked under `## In Progress` counts as in progress.
- Every task with `priority: null` usually means the repo hasn't synced since the parser changed. Ask the user to sync; don't rewrite the file.

**ROADMAP.md**: `##` quarter headings (`## 2027 Q1: ...`) with checkbox items at column 0 (`[ ]` planned, `[/]` in progress, `[x]` completed). `###` sub-headings don't start a new quarter. Add `(IN PROGRESS)` to the active quarter's heading so the dashboard shows it first.

**FEATURES.md**: `##` / `###` category headings with `- **Name**: description` bullets. Shipped work moves here from TASKS.md.

**METRICS.md**: coverage and other numbers are self-reported here; Vigil reads them, it doesn't run your tests.

When editing a docs-only status PR, change only the lines for the items you're closing. Don't reorder, reword, or regenerate the file from a template.

## 4. Tiers and health profiles

- **Tier** (T1 Critical, T2 Important, T3 Standard, T4 Low) is the user's call about how much a repo matters. It's set from the badge next to the type icon on the dashboard and never auto-detected. Use it to order work, not to judge quality.
- **Health profile** (starter / production / enterprise) changes how the score is weighted. A starter repo with a B isn't "worse" than an enterprise repo with a B; they're measured differently. Don't suggest changing a profile just to raise a score.

## 5. Gotchas

- Hidden repos are excluded from every MCP tool. If the user asks about a repo that "isn't there", it may be hidden on the dashboard or never synced.
- The MCP key is a portfolio-admin key: it sees every repo. Don't paste it into files, PR bodies, or logs.
- Rate limit is 60 requests/minute per IP. Batch with filters (`repos`, `priority`) rather than calling per repo in a loop.
- `-32602` means a bad argument name or value; re-read the table above rather than retrying.
- Data is a snapshot from the last sync. If the user just pushed, say the numbers may lag, or suggest a sync from the dashboard.

For the HTTP API, dashboard actions, and environment setup, see [reference.md](reference.md).
