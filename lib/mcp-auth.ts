/**
 * Least-privilege authorization for the machine endpoints (/api/mcp, /api/context).
 *
 * Credentials (bearer tokens, compared in constant time):
 *   MCP_API_KEY      admin key, holds every scope (unchanged behaviour)
 *   MCP_SCOPED_KEYS  optional JSON array: [{"name":"ci-bot","key":"<16+ chars>","scopes":["repo:read"]}]
 *
 * Fail closed: no key configured, malformed JSON, short keys, unknown scopes,
 * or an unknown tool all resolve to "no access". Tokens are opaque; scopes are
 * never read from the token itself.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ALL_SCOPES = [
  'repo:read',
  'portfolio:read',
  'security:read',
  'relationships:read',
  'relationships:write',
] as const;
export type Scope = (typeof ALL_SCOPES)[number];

export const MIN_SCOPED_KEY_LENGTH = 16;

// Not password storage: both sides are MACed under a per-process random key only so the
// buffers handed to timingSafeEqual have equal length and no early-exit timing leak.
const MAC_KEY = randomBytes(32);
const digest = (s: string): Buffer => createHmac('sha256', MAC_KEY).update(s).digest();
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer (.+)$/.exec(header);
  return m && m[1].trim() ? m[1] : null;
}

function loadScopedKeys(): { key: string; scopes: Scope[] }[] {
  const raw = process.env.MCP_SCOPED_KEYS;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: { key: string; scopes: Scope[] }[] = [];
    for (const e of parsed) {
      if (!e || typeof e !== 'object') continue;
      const { key, scopes } = e as { key?: unknown; scopes?: unknown };
      if (typeof key !== 'string' || key.length < MIN_SCOPED_KEY_LENGTH) continue;
      if (!Array.isArray(scopes)) continue;
      const valid = scopes.filter((s): s is Scope => (ALL_SCOPES as readonly string[]).includes(s as string));
      if (valid.length) out.push({ key, scopes: valid });
    }
    return out;
  } catch {
    return [];
  }
}

/** Scopes granted to the request's bearer token; null when it is missing, invalid or unconfigured. */
export function resolveScopes(authorization: string | null): Scope[] | null {
  const token = bearerToken(authorization);
  if (!token) return null;
  const admin = process.env.MCP_API_KEY;
  if (admin && safeEqual(token, admin)) return [...ALL_SCOPES];
  let match: Scope[] | null = null;
  // Check every entry (no early exit) to keep timing independent of position.
  for (const entry of loadScopedKeys()) {
    if (safeEqual(token, entry.key)) match = entry.scopes;
  }
  return match;
}

export function hasScopes(granted: readonly string[] | null, required: readonly string[]): boolean {
  return !!granted && required.length > 0 && required.every(s => granted.includes(s));
}
