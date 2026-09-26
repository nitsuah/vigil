import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  getNeonClient: () => {
    const tag = Object.assign(
      vi.fn().mockResolvedValue([]),
      { transaction: vi.fn().mockResolvedValue([[], [], [], []]) }
    );
    return tag;
  },
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

process.env.MCP_API_KEY = 'test-key-123';

import { GET, POST } from '@/app/api/mcp/route';

const AUTH = { Authorization: 'Bearer test-key-123' };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH, ...headers },
    body: JSON.stringify(body),
  }) as never;
}

describe('GET /api/mcp', () => {
  it('returns capability doc without auth', async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.name).toBe('vigil-mcp');
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual([
      'get_repo_health',
      'list_tasks',
      'list_repos',
      'get_repo_details',
      'get_portfolio_overview',
      'search_repos',
      'get_security_summary',
      'get_open_tasks',
    ]);
  });

  it('returns 405 to a Streamable HTTP client asking for an SSE stream', async () => {
    const req = new Request('http://localhost/api/mcp', { headers: { Accept: 'text/event-stream' } }) as never;
    const res = await GET(req);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});

describe('POST /api/mcp auth', () => {
  it('returns 401 without Authorization header', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe(-32001);
  });

  it('returns 401 with wrong key', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/mcp methods', () => {
  it('initialize returns server info', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'initialize', id: 1 }));
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe('vigil-mcp');
    expect(body.result.protocolVersion).toBe('2024-11-05');
  });

  it('tools/list returns all tools', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'tools/list', id: 2 }));
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_repo_health');
    expect(names).toContain('list_tasks');
    expect(names).toContain('list_repos');
    expect(names).toContain('get_repo_details');
    expect(names).toContain('get_portfolio_overview');
    expect(names).toContain('search_repos');
    expect(names).toContain('get_security_summary');
  });

  it('unknown tool returns -32601', async () => {
    const res = await POST(
      post({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'no_such_tool', arguments: {} }, id: 3 })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it('unknown method returns -32601', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'bogus/method', id: 4 }));
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it('invalid JSON returns -32700', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: 'not-json',
    }) as never;
    const res = await POST(req);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });
});

// ---------------------------------------------------------------------------
// tools/call — per-tool coverage
// ---------------------------------------------------------------------------

async function callTool(toolName: string, args: Record<string, unknown> = {}) {
  return POST(post({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: 99,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callResult(toolName: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await callTool(toolName, args);
  const body = await res.json();
  return JSON.parse(body.result.content[0].text);
}

describe('tools/call — list_repos', () => {
  it('returns repos array and metadata when db is empty', async () => {
    const data = await callResult('list_repos');
    expect(Array.isArray(data.repos)).toBe(true);
    expect(data.count).toBe(0);
    expect(data).toHaveProperty('filters_applied');
  });

  it('passes filter args through filters_applied', async () => {
    const data = await callResult('list_repos', { min_health: 70, language: 'TypeScript' });
    expect(data.filters_applied.min_health).toBe(70);
    expect(data.filters_applied.language).toBe('TypeScript');
  });
});

describe('tools/call — list_tasks', () => {
  it('returns -32603 when name is missing', async () => {
    const res = await callTool('list_tasks', {});
    const body = await res.json();
    expect(body.error.code).toBe(-32603);
  });

  it('returns tasks array and count when db is empty', async () => {
    const data = await callResult('list_tasks', { name: 'some-repo' });
    expect(Array.isArray(data.tasks)).toBe(true);
    expect(data.count).toBe(0);
  });

  it('passes optional status filter without error', async () => {
    const data = await callResult('list_tasks', { name: 'some-repo', status: 'todo' });
    expect(data.count).toBe(0);
  });
});

describe('tools/call — get_repo_details', () => {
  it('returns -32603 when name is missing', async () => {
    const res = await callTool('get_repo_details', {});
    const body = await res.json();
    expect(body.error.code).toBe(-32603);
  });

  it('returns not-found error in result content when repo does not exist', async () => {
    const data = await callResult('get_repo_details', { name: 'no-such-repo' });
    expect(data).toHaveProperty('error');
    expect(String(data.error)).toContain('no-such-repo');
  });
});

describe('tools/call — get_portfolio_overview', () => {
  it('returns summary, security, needs_attention, top_repos', async () => {
    const data = await callResult('get_portfolio_overview');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('security');
    expect(data).toHaveProperty('needs_attention');
    expect(data).toHaveProperty('top_repos');
  });

  it('summary contains expected fields when db is empty', async () => {
    const data = await callResult('get_portfolio_overview');
    expect(data.summary).toMatchObject({
      total_repos:        0,
      avg_health_score:   0,
      grade_distribution: { 'A+': 0, A: 0, B: 0, C: 0, D: 0, F: 0 },
      ci_distribution:    { passing: 0, failing: 0, unknown: 0 },
      total_open_prs:     0,
      total_open_issues:  0,
    });
  });

  it('security totals are zero when db is empty', async () => {
    const data = await callResult('get_portfolio_overview');
    expect(data.security.total_critical_vulns).toBe(0);
    expect(data.security.total_high_vulns).toBe(0);
    expect(Array.isArray(data.security.repos_at_risk)).toBe(true);
  });
});

describe('tools/call — search_repos', () => {
  it('returns -32603 when query is missing', async () => {
    const res = await callTool('search_repos', {});
    const body = await res.json();
    expect(body.error.code).toBe(-32603);
  });

  it('returns query echo, empty results, and count when db is empty', async () => {
    const data = await callResult('search_repos', { query: 'typescript' });
    expect(data.query).toBe('typescript');
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.count).toBe(0);
  });

  it('handles LIKE metacharacters in query without error', async () => {
    const data = await callResult('search_repos', { query: 'my_repo%test' });
    expect(data).toHaveProperty('query');
    expect(data.count).toBe(0);
  });
});

describe('tools/call — get_security_summary', () => {
  it('returns portfolio scope when name is omitted', async () => {
    const data = await callResult('get_security_summary');
    expect(data.scope).toBe('portfolio');
    expect(data).toHaveProperty('totals');
    expect(data).toHaveProperty('repos_needing_action');
    expect(data).toHaveProperty('repos_without_security_policy');
  });

  it('totals are all zero when db is empty', async () => {
    const data = await callResult('get_security_summary');
    expect(data.totals).toMatchObject({
      repos_tracked:          0,
      repos_with_issues:      0,
      critical_vulns:         0,
      high_vulns:             0,
      secret_scanning_alerts: 0,
      code_scanning_alerts:   0,
    });
  });

  it('returns not-found error in result content for unknown repo name', async () => {
    const data = await callResult('get_security_summary', { name: 'no-such-repo' });
    expect(data).toHaveProperty('error');
    expect(String(data.error)).toContain('no-such-repo');
  });
});

describe('Streamable HTTP handshake', () => {
  it('initialize echoes a supported client protocol version', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2025-06-18' } }));
    expect((await res.json()).result.protocolVersion).toBe('2025-06-18');
  });

  it('initialize falls back to 2024-11-05 for an unknown version', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '1999-01-01' } }));
    expect((await res.json()).result.protocolVersion).toBe('2024-11-05');
  });

  it('acknowledges notifications/initialized with 202 and no body', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('rejects an explicit null id with -32600', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'tools/list', id: null }));
    expect((await res.json()).error.code).toBe(-32600);
  });

  it('returns 400 for an unsupported MCP-Protocol-Version header, accepts a supported one', async () => {
    const bad = await POST(post({ jsonrpc: '2.0', method: 'tools/list', id: 1 }, { 'MCP-Protocol-Version': '1999-01-01' }));
    expect(bad.status).toBe(400);
    const good = await POST(post({ jsonrpc: '2.0', method: 'tools/list', id: 1 }, { 'MCP-Protocol-Version': '2025-06-18' }));
    expect(good.status).toBe(200);
  });

  it('rejects a malformed repos filter on get_open_tasks', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'get_open_tasks', arguments: { repos: 123 } } }));
    expect((await res.json()).error.code).toBe(-32603);
  });

  it('answers ping with an empty result', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'ping', id: 7 }));
    expect((await res.json()).result).toEqual({});
  });
});

describe('tools/call — get_open_tasks', () => {
  it('returns an empty rollup with zeroed counts when db is empty', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'get_open_tasks', arguments: {} } }));
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.tasks).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.by_priority).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0, none: 0 });
    expect(data.filters_applied).toEqual({ repos: null, priority: null, status: null, owner: null });
  });

  it('echoes filters', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: {
      name: 'get_open_tasks', arguments: { repos: ['vigil'], priority: ['P0', 'P1'], status: 'todo' },
    } }));
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.filters_applied).toMatchObject({ repos: ['vigil'], priority: ['P0', 'P1'], status: 'todo' });
  });

  it('rejects an unknown priority with -32603', async () => {
    const res = await POST(post({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: {
      name: 'get_open_tasks', arguments: { priority: ['P9'] },
    } }));
    expect((await res.json()).error.code).toBe(-32603);
  });
});
