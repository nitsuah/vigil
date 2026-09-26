import { describe, it, expect, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { headers });

const isRedirectToLogin = (res: Response) =>
  [307, 308].includes(res.status) && (res.headers.get('location') ?? '').includes('/login');

describe('proxy — machine clients on MCP routes', () => {
  it('redirects /api/mcp and /api/context to /login without a session or bearer', async () => {
    expect(isRedirectToLogin(await proxy(req('/api/mcp')))).toBe(true);
    expect(isRedirectToLogin(await proxy(req('/api/context')))).toBe(true);
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
