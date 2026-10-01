# Vigil reference

Load this only when the MCP tools in SKILL.md aren't enough: scripting against the
HTTP API, explaining a dashboard control to the user, or setting Vigil up.

## MCP tool arguments

| Tool                                   | Arguments                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_open_tasks`                       | `repos[]`, `priority[]` (`P0`–`P3`, `none`), `status` (`todo` / `in-progress`), `owner`, `limit` (default 100, max 500)                          |
| `list_tasks`                           | `name` (required), `status`                                                                                                                      |
| `list_repos`                           | `min_health`, `language`, `type` (`web-app`, `game`, `tool`, `library`, `bot`, `research`, `other`), `has_vulns`, `tier` (`T1`–`T4`, `untiered`) |
| `get_repo_health` / `get_repo_details` | `name` (required; short name or `owner/repo`)                                                                                                    |
| `search_repos`                         | `query`                                                                                                                                          |
| `get_security_summary`                 | `name` (optional; omit for the whole portfolio)                                                                                                  |
| `get_portfolio_overview`               | none                                                                                                                                             |
| `get_relationships`                    | `repo`, `kind`, `status` (`proposed` / `confirmed`)                                                                                              |
| `propose_relationship`                 | `source`, `target`, `kind`, `context` (12–500 chars), `evidence` — all required                                                                  |

Relationship kinds: `depends_on`, `calls`, `deploys`, `embeds`, `shares_data`, `tracks`.
Direction: `source` uses `target`.

## HTTP API

Session-authenticated (signed in to the dashboard) unless noted.

```text
GET    /api/repos                              # repos visible to the caller
GET    /api/repo-details/[name]                # tasks, roadmap, docs, practices
POST   /api/repos/add                          { url: "owner/repo" }
POST   /api/repos/[name]/sync                  # re-sync one repo
POST   /api/sync-repos                         # sync everything
PATCH  /api/repos/[name]/update-type           { type }
PATCH  /api/repos/[name]/update-tier           { tier: "T1" | "T2" | "T3" | "T4" | null }
PATCH  /api/repos/[name]/update-health-profile { profile: "starter" | "production" | "enterprise" }
POST   /api/repos/[name]/hide | unhide
GET    /api/pmo/tasks?priority=P0,P1&repos=a,b # same rollup as get_open_tasks
GET    /api/relationships                      # + POST / PATCH /[id] / DELETE /[id]
GET    /api/context[?repo=owner/repo]          # Bearer MCP key or session; guests get default repos
POST   /api/mcp                                # Bearer MCP key
```

Tier and health-profile writes need a write grant: the caller's own GitHub token
must have synced or added the repo. Otherwise the route returns 404 (not 403), so a
private repo's existence isn't confirmed.

## Dashboard controls worth knowing

- **Type icon** (🌐 🎮 🔧 📦 🤖 🔬): click to recategorize. Auto-detected on first sync.
- **Tier badge** (T1–T4, dashed `T–` when unset): click to set or clear. Filter by tier from the filter bar, including "Untiered" to find repos nobody has classified yet.
- **Health shields**: hover for per-component scores; the breakdown has the Starter / Production / Enterprise picker.
- **Fix / Fix All**: opens a preview of every fixable missing doc, best practice, or community standard. Edit or AI-tailor each file, then **Create PR**.
- **Improve** (on present docs): AI rewrite shown as a diff before any PR.
- **Chat icon**: per-repo chat grounded in the repo's synced state. It can propose task check-offs and doc edits, each applied as a PR.
- **PMO** (`/pmo`): portfolio roadmap pipeline, "Repos & open work" grid, relationship map (add, confirm, or reject edges), and **Hand off** on in-progress roadmap items.

## Setting Vigil up

1. Node 22, a GitHub OAuth app, and a Neon Postgres database.
2. `cp .env.example .env.local`, fill `GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `MCP_API_KEY` (`openssl rand -hex 32`), and an AI key (`GEMINI_API_KEY`, or OpenAI / Anthropic as fallbacks).
3. `npm install && npm run setup-db && npm run dev`, sign in, **Sync**.
4. Optional: a GitHub webhook to `/api/webhooks/github` with `WEBHOOK_SECRET` re-syncs a repo within seconds of each push.
5. Connect Claude Code (see SKILL.md §0) and install this skill:

```bash
mkdir -p ~/.claude/skills/vigil
curl -fsSL https://raw.githubusercontent.com/nitsuah/vigil/main/skills/vigil/SKILL.md -o ~/.claude/skills/vigil/SKILL.md
curl -fsSL https://raw.githubusercontent.com/nitsuah/vigil/main/skills/vigil/reference.md -o ~/.claude/skills/vigil/reference.md
```

Full MCP details and troubleshooting: [docs/MCP.md](../../docs/MCP.md).
