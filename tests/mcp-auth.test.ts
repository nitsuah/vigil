import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tracked repo that is NOT in DEFAULT_REPOS, so only an authorized caller may read it.
const PRIVATE_REPO = { id: 'r1', name: 'private-repo', full_name: 'o/private-repo', is_hidden: false };
let dbRows: unknown[] = [];
vi.mock('@/lib/db', () => ({
  getNeonClient: () =>
    Object.assign(vi.fn().mockImplementation(async () => dbRows), { transaction: vi.fn().mockResolvedValue([[], [], [], [], [], []]) }),
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));

const ADMIN = 'admin-key-0123456789';
const READER = 'reader-key-0123456789';
const PORTFOLIO = 'portfolio-key-0123456789';
process.env.MCP_API_KEY = ADMIN;
process.env.MCP_SCOPED_KEYS = JSON.stringify([
  { name: 'reader', key: READER, scopes: ['repo:read'] },
  { name: 'portfolio', key: PORTFOLIO, scopes: ['portfolio:read', 'relationships:read'] },
  { name: 'short', key: 'short', scopes: ['repo:read', 'relationships:write'] },
  { name: 'bogus', key: 'bogus-scope-key-012345', scopes: ['admin', '*'] },
]);

import { POST, TOOL_SCOPES, GET as mcpGet } from '@/app/api/mcp/route';
import { GET as contextGet } from '@/app/api/context/route';
import { resolveScopes, hasScopes } from '@/lib/mcp-auth';

const rpc = (token: string | null, body: unknown): ReturnType<typeof POST> =>
  POST(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }) as never);

const call = (token: string | null, name: string, args: Record<string, unknown> = {}): ReturnType<typeof POST> =>
  rpc(token, { jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args }, id: 1 });

const MINIMAL_ARGS: Record<string, Record<string, unknown>> = {
  get_repo_health: { name: 'x' },
  list_tasks: { name: 'x' },
  get_repo_details: { name: 'x' },
  search_repos: { query: 'x' },
  propose_relationship: { source: 'a/b', target: 'c/d', kind: 'depends_on', context: 'c', evidence: 'e' },
};

describe('lib/mcp-auth', () => {
  it('denies missing, malformed and unknown credentials', () => {
    for (const h of [null, '', 'Bearer', 'Bearer ', 'Basic abc', ADMIN, `bearer ${ADMIN}`, 'Bearer nope', `Bearer ${ADMIN}x`]) {
      expect(resolveScopes(h)).toBeNull();
    }
  });
  it('admin key holds every scope; scoped key only its own', () => {
    expect(resolveScopes(`Bearer ${ADMIN}`)).toHaveLength(5);
    expect(resolveScopes(`Bearer ${READER}`)).toEqual(['repo:read']);
  });
  it('ignores short keys and unknown scopes (fail closed)', () => {
    expect(resolveScopes('Bearer short')).toBeNull();
    expect(resolveScopes('Bearer bogus-scope-key-012345')).toBeNull();
  });
  it('does not trust scopes embedded in a token', () => {
    const jwt = `x.${Buffer.from(JSON.stringify({ scopes: ['relationships:write'] })).toString('base64url')}.y`;
    expect(resolveScopes(`Bearer ${jwt}`)).toBeNull();
  });
  it('hasScopes denies null and empty requirements', () => {
    expect(hasScopes(null, ['repo:read'])).toBe(false);
    expect(hasScopes(['repo:read'], [])).toBe(false);
    expect(hasScopes(['repo:read'], ['repo:read', 'portfolio:read'])).toBe(false);
  });
  it('fails closed when MCP_API_KEY is unset', () => {
    const saved = process.env.MCP_API_KEY;
    delete process.env.MCP_API_KEY;
    expect(resolveScopes('Bearer undefined')).toBeNull();
    expect(resolveScopes('Bearer ')).toBeNull();
    process.env.MCP_API_KEY = saved;
  });
  it('fails closed on malformed MCP_SCOPED_KEYS', () => {
    const saved = process.env.MCP_SCOPED_KEYS;
    for (const bad of ['{not json', '{"key":"x"}', '"str"', 'null']) {
      process.env.MCP_SCOPED_KEYS = bad;
      expect(resolveScopes(`Bearer ${READER}`)).toBeNull();
    }
    process.env.MCP_SCOPED_KEYS = saved;
  });
});

describe('/api/mcp per-tool authorization', () => {
  it('every advertised tool has a scope entry (and vice versa)', async () => {
    const names = ((await (await mcpGet()).json()).tools as { name: string }[]).map(t => t.name).sort();
    expect(Object.keys(TOOL_SCOPES).sort()).toEqual(names);
  });

  it('rejects unauthenticated and invalid keys for every method', async () => {
    for (const token of [null, 'wrong', 'short']) {
      for (const method of ['tools/list', 'tools/call', 'initialize', 'ping']) {
        const res = await rpc(token, { jsonrpc: '2.0', method, params: { name: 'list_repos' }, id: 1 });
        expect(res.status).toBe(401);
      }
    }
  });

  it('denies each tool (403) to a key lacking its scope, before any handler runs', async () => {
    for (const [tool, [scope]] of Object.entries(TOOL_SCOPES)) {
      // a key that holds some scopes, but not this one
      const other = scope === 'repo:read' ? PORTFOLIO : READER;
      const res = await call(other, tool, MINIMAL_ARGS[tool] ?? {});
      const body = await res.json();
      expect(res.status, tool).toBe(403);
      expect(body.error.code).toBe(-32003);
      expect(body.error.message).toContain(scope);
    }
  });

  it('read-only keys can never reach the write tool', async () => {
    for (const token of [READER, PORTFOLIO]) {
      const res = await call(token, 'propose_relationship', MINIMAL_ARGS.propose_relationship);
      expect(res.status).toBe(403);
    }
  });

  it('allows a tool when the key holds its scope', async () => {
    const res = await call(READER, 'list_repos');
    expect(res.status).toBe(200);
    expect((await res.json()).error).toBeUndefined();
    expect((await call(PORTFOLIO, 'get_relationships')).status).toBe(200);
    expect((await call(ADMIN, 'get_portfolio_overview')).status).toBe(200);
  });

  it('unknown and prototype-named tools are denied', async () => {
    for (const name of ['no_such_tool', 'constructor', '__proto__', 'toString', '']) {
      const body = await (await call(ADMIN, name)).json();
      expect(body.error.code, name).toBe(-32601);
    }
  });
});

describe('/api/context bearer scopes', () => {
  const ctx = (token: string | null, q = ''): ReturnType<typeof contextGet> =>
    contextGet(new Request(`http://localhost/api/context${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }) as never);

  beforeEach(() => {
    dbRows = [PRIVATE_REPO];
  });

  it('refuses portfolio view to a repo:read key and repo view to a portfolio-only key', async () => {
    expect((await ctx(READER)).status).toBe(403);
    expect((await ctx(PORTFOLIO, '?repo=x')).status).toBe(403);
  });
  it('allows keys holding the right scope', async () => {
    expect((await ctx(READER, '?repo=private-repo')).status).toBe(200);
    expect((await ctx(PORTFOLIO)).status).toBe(200);
    expect((await ctx(ADMIN)).status).toBe(200);
  });
  it('an invalid bearer gets guest access only: the same non-default repo is hidden', async () => {
    expect((await ctx('wrong', '?repo=private-repo')).status).toBe(404);
    expect((await ctx(null, '?repo=private-repo')).status).toBe(404);
  });
});
