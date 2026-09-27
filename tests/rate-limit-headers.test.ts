import { describe, it, expect } from 'vitest';
import { coreFromHeaders } from '@/lib/rate-limit-headers';
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
