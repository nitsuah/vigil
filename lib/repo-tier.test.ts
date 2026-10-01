import { describe, it, expect } from 'vitest';
import { isRepoTier, getRepoTierInfo, matchesTierFilter, REPO_TIER_IDS } from './repo-tier';

describe('repo-tier', () => {
    it('lists tiers in priority order', () => {
        expect(REPO_TIER_IDS).toEqual(['T1', 'T2', 'T3', 'T4']);
    });

    it('validates tier ids', () => {
        expect(isRepoTier('T1')).toBe(true);
        expect(isRepoTier('t1')).toBe(false);
        expect(isRepoTier('T5')).toBe(false);
        expect(isRepoTier(null)).toBe(false);
    });

    it('looks up tier info, null for untiered', () => {
        expect(getRepoTierInfo('T1')?.label).toBe('Critical');
        expect(getRepoTierInfo(null)).toBeNull();
        expect(getRepoTierInfo('bogus')).toBeNull();
    });

    it('matches dashboard tier filters', () => {
        expect(matchesTierFilter('T2', 'all')).toBe(true);
        expect(matchesTierFilter(null, 'all')).toBe(true);
        expect(matchesTierFilter('T2', 'T2')).toBe(true);
        expect(matchesTierFilter('T3', 'T2')).toBe(false);
        expect(matchesTierFilter(null, 'untiered')).toBe(true);
        expect(matchesTierFilter('T1', 'untiered')).toBe(false);
    });
});
