import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  getNeonClient: () => Object.assign(vi.fn().mockResolvedValue([]), { transaction: vi.fn().mockResolvedValue([]) }),
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

process.env.MCP_API_KEY = 'test-key-123';

import { RateLimiter, trustedClientIp } from '@/lib/mcp-rate-limit';
import { POST } from '@/app/api/mcp/route';

describe('RateLimiter', () => {
  it('blocks after the limit and resets after the window', () => {
    const rl = new RateLimiter(2, 1000, 10);
    expect(rl.hit('a', 0)).toBe(true);
    expect(rl.hit('a', 1)).toBe(true);
    expect(rl.hit('a', 2)).toBe(false);
    expect(rl.hit('a', 1000)).toBe(true);
  });

  it('stays bounded and evicts the oldest entry', () => {
    const rl = new RateLimiter(5, 60_000, 3);
    for (let i = 0; i < 100; i++) rl.hit(`k${i}`, i);
    expect(rl.size).toBeLessThanOrEqual(3);
  });

  it('sweeps expired entries before evicting live ones', () => {
    const rl = new RateLimiter(5, 100, 2);
    rl.hit('old', 0);
    rl.hit('live', 150);
    rl.hit('new', 160);
    expect(rl.hit('live', 161)).toBe(true);
    expect(rl.size).toBe(2);
  });
});

describe('trustedClientIp', () => {
  it('uses the platform header and ignores client-supplied forwarding headers', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8', 'x-nf-client-connection-ip': '9.9.9.9' });
    expect(trustedClientIp(h)).toBe('9.9.9.9');
    expect(trustedClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).toBe('unknown');
  });

  it('falls back to cf-connecting-ip and warns once when nothing is available', () => {
    expect(trustedClientIp(new Headers({ 'cf-connecting-ip': '7.7.7.7' }))).toBe('7.7.7.7');
    const warn = vi.fn();
    expect(trustedClientIp(new Headers(), warn)).toBe('unknown');
    expect(trustedClientIp(new Headers(), warn)).toBe('unknown');
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('POST /api/mcp rate limiting', () => {
  const call = (headers: Record<string, string>) =>
    POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      }) as never,
    );

  it('throttles failed authentication per trusted address, not per spoofed header', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await call({ Authorization: 'Bearer wrong', 'x-nf-client-connection-ip': '10.0.0.1', 'x-forwarded-for': `1.1.1.${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  });

  it('applies stricter caps to callers without a trustworthy address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      statuses.push((await call({ Authorization: 'Bearer wrong', 'x-forwarded-for': `1.1.1.${i}` })).status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
  });

  it('does not let failed attempts consume a valid key allowance', async () => {
    for (let i = 0; i < 15; i++) await call({ Authorization: 'Bearer wrong', 'x-nf-client-connection-ip': '10.0.0.2' });
    const ok = await call({ Authorization: 'Bearer test-key-123', 'x-nf-client-connection-ip': '10.0.0.2' });
    expect(ok.status).not.toBe(401);
    expect(ok.status).not.toBe(429);
  });
});
