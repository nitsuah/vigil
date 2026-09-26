/**
 * Vigil MCP Server — exposes repo intelligence as MCP tools.
 *
 * Transport: HTTP JSON-RPC 2.0 (MCP 2024-11-05 through 2025-06-18; Streamable HTTP, JSON-only)
 * Auth:      Authorization: Bearer <MCP_API_KEY>
 * Rate limit: 60 req/min per IP (in-memory, resets on cold start)
 *
 * Tools
 *   get_repo_health        — health score, CI, vulns, activity for one repo
 *   list_tasks             — tasks for one repo, optional status filter
 *   list_repos             — list all repos with health scores and key metrics
 *   get_repo_details       — full details: tasks, roadmap, docs, practices
 *   get_portfolio_overview — cross-repo aggregate: health, CI, security
 *   search_repos           — search by name, description, or language
 *   get_security_summary   — security posture for one repo or the whole portfolio
 *   get_open_tasks         — open TASKS.md work across every tracked repo, by priority
 *
 * Streamable HTTP: JSON responses only (no SSE stream), so `claude mcp add
 * --transport http` works directly. Notifications get 202, GET with
 * `Accept: text/event-stream` gets 405. See docs/MCP.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, ensureSchema } from '@/lib/db';
import logger from '@/lib/log';
import { healthGrade, buildGradeDist, buildCiDist } from '@/lib/health-grade';
import { loadOpenTasks, parseOpenTaskFilters, rollupOpenTasks, DEFAULT_ROLLUP_LIMIT, MAX_ROLLUP_LIMIT } from '@/lib/task-rollup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SERVER_VERSION = '0.3.0';
/** Newest first; initialize echoes the client's version when we support it. */
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
const FALLBACK_PROTOCOL_VERSION = '2024-11-05';

// ---------------------------------------------------------------------------
// Rate limiting (in-memory; resets on cold start)
// ---------------------------------------------------------------------------

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function authenticate(req: NextRequest): boolean {
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${apiKey}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'get_repo_health',
    description:
      'Returns health score (0-100), CI status, vulnerability counts, and activity metrics for a tracked repository.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Repository name (e.g. "vigil") or full name (e.g. "nitsuah/vigil")',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_tasks',
    description: 'Lists tasks for a tracked repository. Optionally filter by status.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Repository name or full name',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'done'],
          description: 'Filter by status (optional — omit for all tasks)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_repos',
    description:
      'Lists all tracked repositories with health scores, CI status, language, and open PR/issue counts. Supports optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        min_health: {
          type: 'number',
          description: 'Only return repos with health score ≥ this value (0-100)',
        },
        language: {
          type: 'string',
          description: 'Filter by primary language (case-insensitive)',
        },
        type: {
          type: 'string',
          enum: ['web-app', 'game', 'tool', 'library', 'bot', 'research', 'other'],
          description: 'Filter by repo type',
        },
        has_vulns: {
          type: 'boolean',
          description: 'true = only repos with open vulnerability alerts; false = only clean repos',
        },
      },
    },
  },
  {
    name: 'get_repo_details',
    description:
      'Returns full details for a repository: tasks, roadmap items, documentation status, best practices, and community standards.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Repository name or full name (owner/repo)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_portfolio_overview',
    description:
      'Returns a cross-repository portfolio summary: aggregate health distribution, CI pass rate, security posture, and repos needing attention. No arguments required.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_repos',
    description: 'Search tracked repositories by name, description, or primary language.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term matched against repo name, description, and language',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_security_summary',
    description:
      'Returns security posture (vulnerability counts, secret scanning, code scanning, policy status). Omit "name" for portfolio-wide summary.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Repository name for single-repo view (omit for portfolio-wide)',
        },
      },
    },
  },
  {
    name: 'get_open_tasks',
    description:
      'Cross-repo rollup of open (todo + in-progress) TASKS.md items across every tracked repository, ' +
      'sorted by priority (P0 first), with repo, status, priority, owner, and section. ' +
      'Use this to answer "what should I work on next?" across the portfolio. ' +
      'Returns counts by priority and by repo for all matches, plus up to `limit` items.',
    inputSchema: {
      type: 'object',
      properties: {
        repos: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only these repos (name or owner/repo). Omit for all tracked repos.',
        },
        priority: {
          type: 'array',
          items: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'none'] },
          description: 'Only these priorities; "none" = tasks with no priority tag. Omit for all.',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress'],
          description: 'Only this status (omit for both)',
        },
        owner: {
          type: 'string',
          description: 'Case-insensitive substring match on the task owner (from an "- Owner:" sub-bullet)',
        },
        limit: {
          type: 'number',
          description: `Max items returned (default ${DEFAULT_ROLLUP_LIMIT}, max ${MAX_ROLLUP_LIMIT}); counts always cover every match`,
        },
      },
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function getRepoHealth(args: Row): Promise<string> {
  const name = String(args.name ?? '');
  if (!name) throw new Error('"name" is required');

  const db = getNeonClient();
  const rows = await db`
    SELECT name, full_name, url, health_score, health_profile, ci_status, language,
           open_prs, last_commit_date,
           vuln_alert_count, vuln_critical_count, vuln_high_count
    FROM repos
    WHERE name = ${name} OR full_name = ${name}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return JSON.stringify({ error: `Repository "${name}" not found in Vigil` });
  }

  const r = rows[0] as Row;
  return JSON.stringify({
    name:                r.name,
    full_name:           r.full_name,
    url:                 r.url,
    health_score:        r.health_score,
    health_profile:      r.health_profile ?? 'production',
    health_grade:        healthGrade(r.health_score ?? 0),
    ci_status:           r.ci_status,
    language:            r.language,
    open_prs:            r.open_prs ?? 0,
    last_commit_date:    r.last_commit_date,
    vuln_alert_count:    r.vuln_alert_count ?? 0,
    vuln_critical_count: r.vuln_critical_count ?? 0,
    vuln_high_count:     r.vuln_high_count ?? 0,
  });
}

async function listTasks(args: Row): Promise<string> {
  const name   = String(args.name   ?? '');
  const status = typeof args.status === 'string' ? args.status : null;
  if (!name) throw new Error('"name" is required');

  const db = getNeonClient();
  const rows = status
    ? await db`
        SELECT title, status, section, subsection
        FROM tasks
        WHERE repo_id = (SELECT id FROM repos WHERE name = ${name} OR full_name = ${name})
          AND status = ${status}
        ORDER BY created_at ASC
      `
    : await db`
        SELECT title, status, section, subsection
        FROM tasks
        WHERE repo_id = (SELECT id FROM repos WHERE name = ${name} OR full_name = ${name})
        ORDER BY status, created_at ASC
      `;

  return JSON.stringify({
    tasks: (rows as Row[]).map((t) => ({
      title:      t.title,
      status:     t.status,
      section:    t.section    ?? null,
      subsection: t.subsection ?? null,
    })),
    count: rows.length,
  });
}

async function listRepos(args: Row): Promise<string> {
  const minHealth = typeof args.min_health === 'number' ? args.min_health : 0;
  const language  = typeof args.language   === 'string' ? args.language   : null;
  const type      = typeof args.type       === 'string' ? args.type       : null;
  const hasVulns  = typeof args.has_vulns  === 'boolean' ? args.has_vulns : null;

  const db = getNeonClient();
  let repos = (await db`
    SELECT name, full_name, url, health_score, ci_status, language, repo_type,
           open_prs, open_issues_count, last_commit_date, vuln_alert_count, is_hidden
    FROM repos
    WHERE is_hidden = false
    ORDER BY health_score ASC NULLS LAST
  `) as Row[];

  if (minHealth > 0) repos = repos.filter(r => (r.health_score ?? 0) >= minHealth);
  if (language)      repos = repos.filter(r => r.language?.toLowerCase() === language.toLowerCase());
  if (type)          repos = repos.filter(r => r.repo_type === type);
  if (hasVulns === true)  repos = repos.filter(r => (r.vuln_alert_count ?? 0) > 0);
  if (hasVulns === false) repos = repos.filter(r => (r.vuln_alert_count ?? 0) === 0);

  return JSON.stringify({
    repos: repos.map(r => ({
      name:             r.name,
      full_name:        r.full_name,
      url:              r.url,
      health_score:     r.health_score ?? null,
      health_grade:     healthGrade(r.health_score ?? 0),
      ci_status:        r.ci_status,
      language:         r.language,
      repo_type:        r.repo_type,
      open_prs:         r.open_prs ?? 0,
      open_issues:      r.open_issues_count ?? 0,
      last_commit_date: r.last_commit_date,
      vuln_alert_count: r.vuln_alert_count ?? 0,
    })),
    count: repos.length,
    filters_applied: {
      min_health: minHealth || null,
      language,
      type,
      has_vulns: hasVulns,
    },
  });
}

async function getRepoDetails(args: Row): Promise<string> {
  const name = String(args.name ?? '');
  if (!name) throw new Error('"name" is required');

  /** Maximum rows fetched per paginated query; used to detect truncation. */
  const ROADMAP_ROW_LIMIT = 100;

  const db = getNeonClient();
  const repoRows = await db`
    SELECT id, name, full_name, health_score, language, repo_type, description
    FROM repos
    WHERE name = ${name} OR full_name = ${name}
    LIMIT 1
  `;

  if (repoRows.length === 0) {
    return JSON.stringify({ error: `Repository "${name}" not found` });
  }

  const repo = repoRows[0] as Row;

  const [tasks, roadmapItems, docStatuses, bestPractices, communityStandards] =
    await db.transaction([
      db`SELECT title, status, section FROM tasks WHERE repo_id = ${repo.id} ORDER BY created_at DESC LIMIT 100`,
      db`SELECT title, quarter, status, linked_pr_number FROM roadmap_items WHERE repo_id = ${repo.id} ORDER BY created_at DESC LIMIT ${ROADMAP_ROW_LIMIT}`,
      db`SELECT doc_type, "exists", health_state FROM doc_status WHERE repo_id = ${repo.id}`,
      db`SELECT practice_type, status FROM best_practices WHERE repo_id = ${repo.id}`,
      db`SELECT standard_type, status FROM community_standards WHERE repo_id = ${repo.id}`,
    ]);

  const taskRows      = tasks             as Row[];
  const roadmapRows   = roadmapItems      as Row[];
  const bestPracRows  = bestPractices     as Row[];
  const communityRows = communityStandards as Row[];

  return JSON.stringify({
    name:        repo.name,
    full_name:   repo.full_name,
    health_score: repo.health_score,
    health_grade: healthGrade(repo.health_score ?? 0),
    language:    repo.language,
    repo_type:   repo.repo_type,
    description: repo.description,
    tasks: {
      total: taskRows.length,
      by_status: {
        todo:        taskRows.filter(t => t.status === 'todo').length,
        in_progress: taskRows.filter(t => t.status === 'in-progress').length,
        done:        taskRows.filter(t => t.status === 'done').length,
      },
      items: taskRows,
    },
    roadmap: {
      returned_count: roadmapRows.length,
      truncated:   roadmapRows.length === ROADMAP_ROW_LIMIT,
      by_status: {
        planned:     roadmapRows.filter(r => r.status === 'planned').length,
        in_progress: roadmapRows.filter(r => r.status === 'in-progress').length,
        completed:   roadmapRows.filter(r => r.status === 'completed').length,
      },
      items: roadmapRows,
    },
    documentation: docStatuses,
    best_practices: {
      healthy: bestPracRows.filter(p => p.status === 'healthy').length,
      total:   bestPracRows.length,
      items:   bestPracRows,
    },
    community_standards: {
      healthy: communityRows.filter(s => s.status === 'healthy').length,
      total:   communityRows.length,
      items:   communityRows,
    },
  });
}

async function getPortfolioOverview(): Promise<string> {
  const db = getNeonClient();
  const rows = (await db`
    SELECT name, full_name, health_score, ci_status, language, repo_type,
           open_prs, open_issues_count, vuln_critical_count, vuln_high_count,
           vuln_alert_count, last_commit_date, secret_scanning_alert_count
    FROM repos
    WHERE is_hidden = false
    ORDER BY health_score ASC NULLS LAST
  `) as Row[];

  const total = rows.length;
  const avgHealth = total > 0
    ? Math.round(rows.reduce((s, r) => s + (r.health_score ?? 0), 0) / total)
    : 0;

  const gradeDist = buildGradeDist(rows);
  const ciDist    = buildCiDist(rows);

  const needsAttention = rows.filter(r => (r.health_score ?? 0) < 60);
  const securityRisks  = rows.filter(r =>
    (r.vuln_critical_count ?? 0) > 0 || (r.secret_scanning_alert_count ?? 0) > 0
  );

  return JSON.stringify({
    summary: {
      total_repos:        total,
      avg_health_score:   avgHealth,
      grade_distribution: gradeDist,
      ci_distribution:    ciDist,
      total_open_prs:     rows.reduce((s, r) => s + (r.open_prs ?? 0), 0),
      total_open_issues:  rows.reduce((s, r) => s + (r.open_issues_count ?? 0), 0),
    },
    security: {
      total_critical_vulns:  rows.reduce((s, r) => s + (r.vuln_critical_count ?? 0), 0),
      total_high_vulns:      rows.reduce((s, r) => s + (r.vuln_high_count ?? 0), 0),
      repos_at_risk:         securityRisks.map(r => ({
        name:           r.name,
        vuln_critical:  r.vuln_critical_count ?? 0,
        secret_alerts:  r.secret_scanning_alert_count ?? 0,
      })),
    },
    needs_attention: needsAttention.map(r => ({
      name:         r.name,
      health_score: r.health_score,
      health_grade: healthGrade(r.health_score ?? 0),
      ci_status:    r.ci_status,
    })),
    top_repos: rows
      .filter(r => (r.health_score ?? 0) >= 80)
      .map(r => ({ name: r.name, health_score: r.health_score, health_grade: healthGrade(r.health_score ?? 0) })),
  });
}

async function searchRepos(args: Row): Promise<string> {
  const query = String(args.query ?? '').trim();
  if (!query) throw new Error('"query" is required');

  const db = getNeonClient();
  const escaped = query.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`);
  const pattern = `%${escaped}%`;
  const rows = (await db`
    SELECT name, full_name, description, language, repo_type, health_score, topics, url
    FROM repos
    WHERE is_hidden = false
      AND (
        LOWER(name) LIKE ${pattern} ESCAPE '\'
        OR LOWER(COALESCE(description, '')) LIKE ${pattern} ESCAPE '\'
        OR LOWER(COALESCE(language, '')) LIKE ${pattern} ESCAPE '\'
      )
    ORDER BY health_score DESC NULLS LAST
    LIMIT 20
  `) as Row[];

  return JSON.stringify({
    query,
    results: rows.map(r => ({
      name:         r.name,
      full_name:    r.full_name,
      description:  r.description,
      url:          r.url,
      language:     r.language,
      repo_type:    r.repo_type,
      health_score: r.health_score ?? null,
      health_grade: healthGrade(r.health_score ?? 0),
      topics:       r.topics ?? [],
    })),
    count: rows.length,
  });
}

async function getSecuritySummary(args: Row): Promise<string> {
  const name = typeof args.name === 'string' ? args.name.trim() : null;
  const db = getNeonClient();

  if (name) {
    const rows = (await db`
      SELECT name, full_name,
             vuln_alert_count, vuln_critical_count, vuln_high_count,
             has_security_policy, dependabot_alerts_enabled, code_scanning_enabled,
             secret_scanning_enabled, secret_scanning_alert_count, code_scanning_alert_count,
             private_vuln_reporting_enabled, has_security_advisories
      FROM repos
      WHERE name = ${name} OR full_name = ${name}
      LIMIT 1
    `) as Row[];

    if (rows.length === 0) return JSON.stringify({ error: `Repository "${name}" not found` });
    const r = rows[0];
    return JSON.stringify({
      scope:      'single_repo',
      name:       r.name,
      full_name:  r.full_name,
      vulnerabilities: {
        total:    r.vuln_alert_count    ?? 0,
        critical: r.vuln_critical_count ?? 0,
        high:     r.vuln_high_count     ?? 0,
      },
      secret_scanning: {
        enabled:     r.secret_scanning_enabled    ?? false,
        alert_count: r.secret_scanning_alert_count ?? 0,
      },
      code_scanning: {
        enabled:     r.code_scanning_enabled    ?? false,
        alert_count: r.code_scanning_alert_count ?? 0,
      },
      dependabot: { enabled: r.dependabot_alerts_enabled ?? false },
      policies: {
        security_policy:        r.has_security_policy               ?? false,
        security_advisories:    r.has_security_advisories           ?? false,
        private_vuln_reporting: r.private_vuln_reporting_enabled    ?? false,
      },
    });
  }

  const rows = (await db`
    SELECT name, vuln_alert_count, vuln_critical_count, vuln_high_count,
           secret_scanning_alert_count, code_scanning_alert_count, has_security_policy,
           dependabot_alerts_enabled
    FROM repos
    WHERE is_hidden = false
    ORDER BY (COALESCE(vuln_critical_count,0)*10 + COALESCE(secret_scanning_alert_count,0)*5 + COALESCE(vuln_high_count,0)) DESC
  `) as Row[];

  const withIssues = rows.filter(r =>
    (r.vuln_critical_count ?? 0) > 0 ||
    (r.secret_scanning_alert_count ?? 0) > 0 ||
    (r.vuln_high_count ?? 0) > 0
  );

  return JSON.stringify({
    scope: 'portfolio',
    totals: {
      repos_tracked:          rows.length,
      repos_with_issues:      withIssues.length,
      critical_vulns:         rows.reduce((s, r) => s + (r.vuln_critical_count ?? 0), 0),
      high_vulns:             rows.reduce((s, r) => s + (r.vuln_high_count ?? 0), 0),
      secret_scanning_alerts: rows.reduce((s, r) => s + (r.secret_scanning_alert_count ?? 0), 0),
      code_scanning_alerts:   rows.reduce((s, r) => s + (r.code_scanning_alert_count ?? 0), 0),
    },
    repos_needing_action: withIssues.map(r => ({
      name:          r.name,
      critical_vulns: r.vuln_critical_count ?? 0,
      high_vulns:    r.vuln_high_count ?? 0,
      secret_alerts: r.secret_scanning_alert_count ?? 0,
    })),
    repos_without_security_policy: rows
      .filter(r => !r.has_security_policy)
      .map(r => r.name),
  });
}

async function getOpenTasks(args: Row): Promise<string> {
  const filters = parseOpenTaskFilters(args);
  const db = getNeonClient();
  // tasks.priority/owner are added by a migration; don't depend on another route having run it.
  await ensureSchema(db);
  // Bearer key = portfolio admin, so no per-user repo scoping here.
  const rollup = rollupOpenTasks(await loadOpenTasks(db), filters);
  return JSON.stringify({
    ...rollup,
    count: rollup.tasks.length,
    filters_applied: {
      repos:    filters.repos?.length ? filters.repos : null,
      priority: filters.priorities?.length ? filters.priorities : null,
      status:   filters.status ?? null,
      owner:    filters.owner ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------

type JsonRpcRequest = {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: string | number | null;
};

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', error: { code, message }, id: id ?? null }, { status });
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', result, id: id ?? null });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/mcp — capability discovery. A Streamable HTTP client probing for a
 * server-sent event stream (Accept: text/event-stream) gets 405: we only speak
 * JSON responses to POST.
 */
export async function GET(req?: NextRequest) {
  if (req?.headers.get('accept')?.includes('text/event-stream')) {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
  }
  return NextResponse.json({
    name:            'vigil-mcp',
    version:         SERVER_VERSION,
    protocolVersion: FALLBACK_PROTOCOL_VERSION,
    supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    description:     'Vigil repo intelligence as MCP tools — portfolio health, task tracking, security posture, and roadmap status',
    tools:           TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    auth:            'Authorization: Bearer <MCP_API_KEY env var>',
    rateLimit:       `${RATE_LIMIT} requests / minute per IP`,
    endpoint:        'POST /api/mcp',
    context_endpoint: 'GET /api/context (no auth — default repos; Bearer token — full portfolio)',
  });
}

/** POST /api/mcp — JSON-RPC 2.0 handler */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return rpcError(null, -32029, 'Rate limit exceeded (60 req/min)', 429);
  }

  if (!authenticate(req)) {
    return rpcError(null, -32001, 'Unauthorized — set Authorization: Bearer <MCP_API_KEY>', 401);
  }

  // Streamable HTTP: a present-but-unsupported MCP-Protocol-Version is a 400;
  // an absent header stays on the compatibility path.
  const headerVersion = req.headers.get('mcp-protocol-version');
  if (headerVersion !== null && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(headerVersion)) {
    return rpcError(null, -32602, `Unsupported MCP-Protocol-Version "${headerVersion}"`, 400);
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error — body must be JSON-RPC 2.0');
  }

  const { method, params = {}, id } = body;

  // An explicit null id is not a notification (MCP ids are strings or numbers).
  if (id === null) {
    return rpcError(null, -32600, 'Invalid Request — id must be a string or number');
  }
  // JSON-RPC notifications (id omitted, e.g. notifications/initialized) get no body.
  if (id === undefined) {
    if (typeof method === 'string' && method.startsWith('notifications/')) {
      return new NextResponse(null, { status: 202 });
    }
  }

  try {
    switch (method) {
      case 'initialize': {
        const requested = String(params.protocolVersion ?? '');
        const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : FALLBACK_PROTOCOL_VERSION;
        return rpcResult(id, {
          protocolVersion,
          capabilities:    { tools: {} },
          serverInfo:      { name: 'vigil-mcp', version: SERVER_VERSION },
        });
      }

      case 'ping':
        return rpcResult(id, {});

      case 'tools/list':
        return rpcResult(id, { tools: TOOLS });

      case 'tools/call': {
        const toolName = String(params.name ?? '');
        const toolArgs = (params.arguments ?? {}) as Row;

        let text: string;
        switch (toolName) {
          case 'get_repo_health':        text = await getRepoHealth(toolArgs);       break;
          case 'list_tasks':             text = await listTasks(toolArgs);            break;
          case 'list_repos':             text = await listRepos(toolArgs);            break;
          case 'get_repo_details':       text = await getRepoDetails(toolArgs);       break;
          case 'get_portfolio_overview': text = await getPortfolioOverview();         break;
          case 'search_repos':           text = await searchRepos(toolArgs);          break;
          case 'get_security_summary':   text = await getSecuritySummary(toolArgs);   break;
          case 'get_open_tasks':         text = await getOpenTasks(toolArgs);         break;
          default:
            return rpcError(id, -32601, `Unknown tool: "${toolName}"`);
        }

        logger.info(`[MCP] tools/call ${toolName} (ip=${ip})`);
        return rpcResult(id, { content: [{ type: 'text', text }] });
      }

      default:
        return rpcError(id, -32601, `Method not found: "${method}"`);
    }
  } catch (error) {
    logger.warn('[MCP] Tool error:', error);
    return rpcError(id, -32603, error instanceof Error ? error.message : 'Internal error');
  }
}
