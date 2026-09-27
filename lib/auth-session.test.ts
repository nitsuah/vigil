import { describe, it, expect, vi } from 'vitest';
import { applyJwt, backfillGithubId, sessionUserId } from './auth-session';

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

describe('backfillGithubId', () => {
    const ok = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

    it('fills in the GitHub id for a pre-#243 token that has only an access token', async () => {
        const fetchImpl = ok({ id: 88273576 });
        const token = await backfillGithubId({ sub: 'uuid', accessToken: 'gho_x' }, fetchImpl as never);
        expect(sessionUserId(token)).toBe('88273576');
        expect(fetchImpl).toHaveBeenCalledWith('https://api.github.com/user', expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer gho_x' }),
        }));
    });

    it('does not call GitHub when the id is already known or there is no access token', async () => {
        const fetchImpl = ok({ id: 1 });
        await backfillGithubId({ githubId: '42', accessToken: 't' }, fetchImpl as never);
        await backfillGithubId({ sub: 'uuid' }, fetchImpl as never);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('records a failed lookup and waits 10 minutes before retrying', async () => {
        const fail = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
        const token = await backfillGithubId({ accessToken: 't' }, fail as never, 1_000);
        expect(token.githubIdLookupFailedAt).toBe(1_000);
        await backfillGithubId(token, fail as never, 1_000 + 60_000);
        expect(fail).toHaveBeenCalledTimes(1);
        await backfillGithubId(token, fail as never, 1_000 + 11 * 60_000);
        expect(fail).toHaveBeenCalledTimes(2);
    });

    it('treats a network error as a failed lookup', async () => {
        const boom = vi.fn().mockRejectedValue(new Error('offline'));
        const token = await backfillGithubId({ accessToken: 't' }, boom as never, 5);
        expect(token.githubId).toBeUndefined();
        expect(token.githubIdLookupFailedAt).toBe(5);
    });
});
