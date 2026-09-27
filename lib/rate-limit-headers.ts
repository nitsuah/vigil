/**
 * GitHub's GET /rate_limit can report the core bucket as untouched
 * (used=0, remaining=5000) while real API responses in the same second carry
 * `x-ratelimit-used: 3242`. Observed 2026-09-27 for both an OAuth user token
 * and a PAT. The x-ratelimit-* headers on an actual core request are the
 * numbers GitHub enforces, so the header bar reads those instead.
 */

export interface RateBucket {
    limit: number;
    remaining: number;
    used: number;
    /** ISO timestamp. */
    reset: string;
}

type Headers = Record<string, string | number | undefined>;

const num = (v: string | number | undefined): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
};

/** The core bucket from a response's x-ratelimit-* headers, or null if they're missing or not for core. */
export function coreFromHeaders(headers: Headers): RateBucket | null {
    const resource = headers['x-ratelimit-resource'];
    if (resource !== undefined && resource !== 'core') return null;
    const limit = num(headers['x-ratelimit-limit']);
    const remaining = num(headers['x-ratelimit-remaining']);
    const reset = num(headers['x-ratelimit-reset']);
    if (limit === null || remaining === null || reset === null) return null;
    const used = num(headers['x-ratelimit-used']) ?? limit - remaining;
    return { limit, remaining, used, reset: new Date(reset * 1000).toISOString() };
}
