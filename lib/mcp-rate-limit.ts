/**
 * In-memory, per-instance rate limiting for /api/mcp.
 *
 * - The client address comes only from the platform-set header (Netlify's
 *   `x-nf-client-connection-ip` by default, overridable with
 *   MCP_CLIENT_IP_HEADER). Client-supplied forwarding headers are ignored;
 *   without a platform header every caller shares one "unknown" bucket.
 * - Authenticated and failed-auth requests are counted in separate buckets, so
 *   failed attempts are throttled hard without starving a legitimate key.
 * - The map is bounded: expired entries are swept and, at capacity, the oldest
 *   entry is evicted.
 */

export const RATE_WINDOW_MS = 60_000;
export const RATE_LIMIT = 60;
export const AUTH_FAILURE_LIMIT = 10;
export const MAX_TRACKED_CLIENTS = 5_000;

interface Entry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number = RATE_WINDOW_MS,
    private readonly maxEntries: number = MAX_TRACKED_CLIENTS,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** Counts one hit for `key`; false once the window's limit is exceeded. */
  hit(key: string, now: number = Date.now()): boolean {
    const entry = this.entries.get(key);
    if (entry && now < entry.resetAt) {
      if (entry.count >= this.limit) return false;
      entry.count++;
      return true;
    }
    this.entries.delete(key);
    this.makeRoom(now);
    this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
    return true;
  }

  /** True when `key` has already used up its window (without counting a hit). */
  isLimited(key: string, now: number = Date.now()): boolean {
    const entry = this.entries.get(key);
    return !!entry && now < entry.resetAt && entry.count >= this.limit;
  }

  private makeRoom(now: number): void {
    if (this.entries.size < this.maxEntries) return;
    for (const [k, v] of this.entries) {
      if (now >= v.resetAt) this.entries.delete(k);
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

export const UNKNOWN_CLIENT = 'unknown';
/** Stricter limits for the shared bucket used when no trustworthy client address is available. */
export const SHARED_RATE_LIMIT = 20;
export const SHARED_AUTH_FAILURE_LIMIT = 5;

let warnedNoClientIp = false;

/**
 * Client address as reported by the hosting platform, or UNKNOWN_CLIENT.
 *
 * Looks at one platform-set header (default Netlify's `x-nf-client-connection-ip`),
 * then `cf-connecting-ip` (Cloudflare). MCP_CLIENT_IP_HEADER MUST name a header
 * that the platform itself sets and overwrites on every request; pointing it at
 * a header a client can send (for example `x-forwarded-for` on a host that
 * passes it through) reintroduces spoofable rate-limit keys. Callers that get
 * UNKNOWN_CLIENT share one stricter bucket, and a warning is logged once.
 */
export function trustedClientIp(headers: Headers, warn: (message: string) => void = () => {}): string {
  const name = (process.env.MCP_CLIENT_IP_HEADER || 'x-nf-client-connection-ip').toLowerCase();
  const value = (headers.get(name) ?? headers.get('cf-connecting-ip'))?.trim();
  if (value) return value.slice(0, 64);
  if (!warnedNoClientIp) {
    warnedNoClientIp = true;
    warn('No platform client-IP header on /api/mcp request; using the shared strict rate-limit bucket');
  }
  return UNKNOWN_CLIENT;
}
