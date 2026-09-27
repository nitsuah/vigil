import { describe, it, expect } from 'vitest';
import { coreFromHeaders, rateLimitExhausted } from '@/lib/rate-limit-headers';
import { shouldRetryAfterThrottle, MAX_THROTTLE_WAIT_SECONDS } from '@/lib/githubClient';

describe('coreFromHeaders', () => {
    it('reads the enforced core bucket from x-ratelimit-* headers', () => {
        expect(coreFromHeaders({
            'x-ratelimit-resource': 'core',
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '1758',
            'x-ratelimit-used': '3242',
            'x-ratelimit-reset': '1790500000',
        })).toEqual({ limit: 5000, remaining: 1758, used: 3242, reset: new Date(1790500000 * 1000).toISOString() });
    });

    it('derives used when the header is absent', () => {
        expect(coreFromHeaders({
            'x-ratelimit-limit': 5000, 'x-ratelimit-remaining': 4000, 'x-ratelimit-reset': 1,
        })?.used).toBe(1000);
    });

    it('returns null for missing headers or a non-core bucket', () => {
        expect(coreFromHeaders({})).toBeNull();
        expect(coreFromHeaders({
            'x-ratelimit-resource': 'search', 'x-ratelimit-limit': '30', 'x-ratelimit-remaining': '29', 'x-ratelimit-reset': '1',
        })).toBeNull();
    });
});

describe('shouldRetryAfterThrottle', () => {
    it('waits out short pauses once', () => {
        expect(shouldRetryAfterThrottle(5, 0)).toBe(true);
        expect(shouldRetryAfterThrottle(MAX_THROTTLE_WAIT_SECONDS, 0)).toBe(true);
        expect(shouldRetryAfterThrottle(5, 1)).toBe(false);
    });

    it('never sleeps until an hourly reset (the 25-minute sync freeze)', () => {
        expect(shouldRetryAfterThrottle(1396, 0)).toBe(false);
    });
});

describe('rateLimitExhausted', () => {
    const headers = (remaining: string) => ({
        'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': remaining, 'x-ratelimit-used': '5000',
        'x-ratelimit-reset': String(1_000 + 17 * 60), 'x-ratelimit-resource': 'core',
    });

    it('recognizes an exhausted hourly quota and returns minutes to reset', () => {
        expect(rateLimitExhausted({ status: 403, response: { headers: headers('0') } }, 1_000_000)).toEqual({ minutes: 17 });
    });

    it('ignores real auth failures and 403s with quota left', () => {
        expect(rateLimitExhausted({ status: 401, response: { headers: headers('0') } })).toBeNull();
        expect(rateLimitExhausted({ status: 403, response: { headers: headers('12') } })).toBeNull();
        expect(rateLimitExhausted(new Error('boom'))).toBeNull();
    });
});
