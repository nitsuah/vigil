# Vigil MCP server

> 🧭 [vigil](../README.md) · [Features](../FEATURES.md) · [Roadmap](../ROADMAP.md) · [Tasks](../TASKS.md) · [Changelog](../CHANGELOG.md) · [Metrics](../METRICS.md) <!-- nav -->

Connect Claude Code (or any MCP client) to vigil so an agent session can ask
"what's open across my repos?" instead of reading 17 TASKS.md files.

- **Endpoint:** `POST https://ghoverseer.netlify.app/api/mcp` (local dev: `http://localhost:3000/api/mcp`)
- **Transport:** MCP Streamable HTTP, JSON responses only (no SSE stream). Protocol versions 2024-11-05, 2025-03-26, 2025-06-18.
- **Auth:** `Authorization: Bearer <MCP_API_KEY>`, one shared portfolio-admin key.
- **Rate limit:** 60 requests/minute per IP.
- **Discovery:** `GET /api/mcp` returns the tool list. Unauthenticated browser requests are redirected to `/login` like the rest of the app, so send the bearer header.

## 1. Create the key

There is one key, not per-user tokens. Generate it once:

```bash
openssl rand -hex 32
```

Set it as `MCP_API_KEY` in Netlify (Site configuration → Environment variables) and redeploy. Keep a copy in your shell profile as `VIGIL_MCP_KEY`. To rotate, change both. Every holder of the key sees the whole portfolio, so treat it like a password.

## 2. Add it to Claude Code

User scope makes it available in every repo:

```bash
claude mcp add --transport http --scope user vigil https://ghoverseer.netlify.app/api/mcp --header "Authorization: Bearer $VIGIL_MCP_KEY"
```

Check it:

```bash
claude mcp get vigil
```

It should report `Status: ✔ Connected`.

The shell expands `$VIGIL_MCP_KEY` when you run `claude mcp add`, so the literal key lands in `~/.claude.json`. To keep the key out of config files, use a project `.mcp.json` instead. Claude Code expands `${VAR}` there at startup:

```json
{
  "mcpServers": {
    "vigil": {
      "type": "http",
      "url": "https://ghoverseer.netlify.app/api/mcp",
      "headers": { "Authorization": "Bearer ${VIGIL_MCP_KEY}" }
    }
  }
}
```

## 3. Tools

| Tool                          | Use it for                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_open_tasks`              | **Cross-repo open work.** Every todo and in-progress TASKS.md item across tracked repos, P0 first. Filters: `repos[]`, `priority[]` (`P0`–`P3`, `none`), `status`, `owner`, `limit` (default 100, max 500). Counts by priority and repo always cover every match. |
| `list_tasks`                  | All tasks, including done ones, for **one** repo                                                                                                                                                                                                                  |
| `get_repo_details`            | One repo's tasks, roadmap, docs, best practices, community standards                                                                                                                                                                                              |
| `get_repo_health`             | One repo's health score, CI, vulnerabilities                                                                                                                                                                                                                      |
| `list_repos` / `search_repos` | Portfolio listing and search                                                                                                                                                                                                                                      |
| `get_portfolio_overview`      | Health and CI distribution, what needs attention                                                                                                                                                                                                                  |
| `get_security_summary`        | Security posture, one repo or all                                                                                                                                                                                                                                 |

`GET /api/context` (same bearer key) returns a one-shot JSON portfolio dump. Its `open_work` block holds the P0/P1 slice; call `get_open_tasks` for the rest.

Example prompts in a Claude Code session:

- "Use vigil to list open P0 and P1 tasks across all repos."
- "What's in progress in skyview and darkmoon?"
- "Which repos have no prioritized tasks?" (Use `priority: ["none"]` and read `by_repo`.)

## How tasks get their priority and owner

Vigil parses each repo's `TASKS.md` (root or `docs/`) on sync. For each unchecked `- [ ]` item:

- **Priority**, most explicit wins:
  1. An indented `- Priority: P1` sub-bullet.
  2. An inline tag in the title: `(P2, M)`, `[P1]`, `(P3 · Tech Debt)`.
  3. The enclosing heading: `### P1 - High` or `## P2`.
  4. Otherwise `none`.
- **Owner:** an indented `- Owner: <name>` or `- Assignee: <name>` sub-bullet. It is null when absent, which is normal for a single-owner portfolio. Use it to mark work for a specific agent or for "you — manual step".
- **Status:** `[/]`, or any unchecked item under an `## In Progress` heading, counts as `in-progress`.

These fields populate on the next sync after deploy.

## Which repos are "tracked"

The rollup covers every **non-hidden** repo in vigil. The canonical portfolio list is the `## Tracked` table in the stash vault's `agent/projects/scope.md`. Keep vigil's visible repos in step with it: hide anything scope.md lists as a fork or utility repo. Pass `repos` to narrow a single query.

## Troubleshooting

| Symptom                                                 | Cause                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `307` to `/login`                                       | No `Authorization: Bearer …` header was sent.                      |
| `401` / `-32001`                                        | Wrong key, or `MCP_API_KEY` is unset in that environment.          |
| `-32029`                                                | Rate limited (60/min/IP).                                          |
| Tool call returns `-32603 Error connecting to database` | The server's `DATABASE_URL` is unreachable. Common locally.        |
| Every task has `priority: null`                         | The repo hasn't been synced since this parser shipped. Run a sync. |
