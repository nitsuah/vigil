import { describe, it, expect, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { NextRequest } from 'next/server';
import { proxy, config } from '@/proxy';

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

describe('proxy — seed-defaults', () => {
  it('redirects unauthenticated requests to /login', async () => {
    expect(isRedirectToLogin(await proxy(req('/api/seed-defaults')))).toBe(true);
  });
});

describe('proxy — unknown addresses', () => {
  it('serves the 404 page without ever opening the requested path', async () => {
    for (const path of ['/this-does-not-exist', '/pmo/hidden', '/loginx']) {
      const res = await proxy(req(path));
      expect(res.status).toBe(404);
      expect(res.headers.get('x-middleware-rewrite')).toBe('http://localhost/404-not-found');
      expect(res.headers.get('x-middleware-next')).toBeNull();
    }
  });

  it('still sends signed-out visitors of real pages to /login', async () => {
    for (const path of ['/metrics', '/pmo', '/test-health', '/pmo/']) {
      expect(isRedirectToLogin(await proxy(req(path)))).toBe(true);
    }
  });
});

describe('proxy — matcher', () => {
  it('excludes icon.svg and og-1200x630.jpg, includes /pmo and /api/mcp', () => {
    const re = new RegExp('^' + config.matcher[0] + '$');
    expect(re.test('/icon.svg')).toBe(false);
    expect(re.test('/og-1200x630.jpg')).toBe(false);
    // Dots are literal: look-alike paths still go through the login check.
    expect(re.test('/iconXsvg')).toBe(true);
    expect(re.test('/faviconXico')).toBe(true);
    expect(re.test('/pmo')).toBe(true);
    expect(re.test('/api/mcp')).toBe(true);
  });
});
