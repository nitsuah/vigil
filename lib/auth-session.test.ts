import { describe, it, expect } from 'vitest';
import { applyJwt, sessionUserId } from './auth-session';

describe('auth session identity', () => {
    it('captures the GitHub numeric id from the OAuth account at sign-in, not token.sub', () => {
        const token = applyJwt(
            { sub: 'd394aaac-0c6c-420a-a9ed-58d7d30e022b' },
            { provider: 'github', providerAccountId: '88273576', access_token: 'gho_x' },
        );
        expect(token.githubId).toBe('88273576');
        expect(token.accessToken).toBe('gho_x');
        expect(sessionUserId(token)).toBe('88273576');
    });

    it('keeps the captured id on later calls without an account', () => {
        const signedIn = applyJwt({ sub: 'uuid' }, { provider: 'github', providerAccountId: '42', access_token: 't' });
        expect(sessionUserId(applyJwt(signedIn, null))).toBe('42');
    });

    it('never falls back to the per-login UUID in token.sub', () => {
        expect(sessionUserId({ sub: 'd394aaac-0c6c-420a-a9ed-58d7d30e022b' })).toBeUndefined();
        expect(sessionUserId({ githubId: 'not-a-number' })).toBeUndefined();
    });

    it('ignores non-GitHub accounts for the id', () => {
        expect(applyJwt({}, { provider: 'other', providerAccountId: '7', access_token: 't' }).githubId).toBeUndefined();
    });
});
