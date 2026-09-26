import { describe, it, expect, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { headers });

const isRedirectToLogin = (res: Response) =>
  [307, 308].includes(res.status) && (res.headers.get('location') ?? '').includes('/login');

describe('proxy — machine clients on MCP routes', () => {
  it('redirects browsers on /api/mcp and /api/context to /login without a session or bearer', async () => {
    const browser = { accept: 'text/html,application/xhtml+xml' };
    expect(isRedirectToLogin(await proxy(req('/api/mcp', browser)))).toBe(true);
    expect(isRedirectToLogin(await proxy(req('/api/context', browser)))).toBe(true);
  });

  it('returns a JSON 401 to machine clients with a missing or empty bearer', async () => {
    for (const headers of <Record<string, string>[]>[
      {},
      { accept: 'application/json, text/event-stream' },
      { authorization: 'Bearer' },
    ]) {
      for (const path of ['/api/mcp', '/api/context']) {
        const res = await proxy(req(path, headers));
        expect(res.status).toBe(401);
        expect(res.headers.get('content-type')).toContain('application/json');
        expect((await res.json()).error.code).toBe(-32001);
      }
    }
  });

  it('lets a bearer request through to /api/mcp and /api/context (route validates the key)', async () => {
    const auth = { authorization: 'Bearer anything' };
    expect(isRedirectToLogin(await proxy(req('/api/mcp', auth)))).toBe(false);
    expect(isRedirectToLogin(await proxy(req('/api/context', auth)))).toBe(false);
  });

  it('does not let a bearer header bypass session auth elsewhere', async () => {
    const auth = { authorization: 'Bearer anything' };
    expect(isRedirectToLogin(await proxy(req('/pmo', auth)))).toBe(true);
    expect(isRedirectToLogin(await proxy(req('/api/pmo/tasks', auth)))).toBe(true);
    expect(isRedirectToLogin(await proxy(req('/api/mcp/extra', auth)))).toBe(true);
  });
});
