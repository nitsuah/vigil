/**
 * Pure JWT/session callback logic for auth.ts, split out so it can be tested
 * without booting NextAuth.
 *
 * Why not token.sub: without a database adapter, Auth.js v5 assigns token.sub a
 * random UUID per sign-in and ignores the id returned by the provider's
 * profile(). Everything keyed on session.userId (repo_access grants,
 * sync_progress ownership, rate-limit metering) expects the GitHub numeric id,
 * which the OAuth account carries as providerAccountId.
 */

export interface VigilToken {
    sub?: string;
    accessToken?: string;
    /** GitHub numeric user id, captured at sign-in. */
    githubId?: string;
    /** Epoch ms of the last failed githubId backfill, so a bad token isn't retried on every request. */
    githubIdLookupFailedAt?: number;
    [key: string]: unknown;
}

export interface OAuthAccount {
    provider?: string;
    providerAccountId?: string;
    access_token?: string;
}

/** jwt callback: on sign-in (account present), capture the access token and GitHub id. */
export function applyJwt(token: VigilToken, account?: OAuthAccount | null): VigilToken {
    if (account) {
        token.accessToken = account.access_token;
        if (account.provider === 'github' && account.providerAccountId) {
            token.githubId = String(account.providerAccountId);
        }
    }
    return token;
}

/**
 * The stable identity for session.userId: the GitHub id. Sessions minted before
 * githubId was captured have none; they get undefined (treated as "no grants")
 * rather than the per-login UUID, and pick the id up on their next sign-in.
 */
export function sessionUserId(token: VigilToken): string | undefined {
    return typeof token.githubId === 'string' && /^\d+$/.test(token.githubId) ? token.githubId : undefined;
}

const BACKFILL_RETRY_MS = 10 * 60_000;
/** The lookup runs inside the jwt callback, so a slow GitHub must not stall the request. */
const BACKFILL_TIMEOUT_MS = 3_000;

/**
 * jwt callback, after applyJwt: sessions minted before githubId was captured
 * (pre-#243) have an access token but no id, so every route keyed on
 * session.userId (sync progress, repo grants) treats them as anonymous until a
 * manual re-login. Look the id up once from GitHub; Auth.js then re-issues the
 * cookie with it. A failed lookup is retried at most every 10 minutes.
 */
export async function backfillGithubId(
    token: VigilToken,
    fetchImpl: typeof fetch = fetch,
    now: number = Date.now(),
): Promise<VigilToken> {
    if (sessionUserId(token) || typeof token.accessToken !== 'string' || !token.accessToken) return token;
    if (typeof token.githubIdLookupFailedAt === 'number' && now - token.githubIdLookupFailedAt < BACKFILL_RETRY_MS) return token;
    try {
        const res = await fetchImpl('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(BACKFILL_TIMEOUT_MS),
        });
        const id = res.ok ? ((await res.json()) as { id?: unknown }).id : undefined;
        if (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) {
            token.githubId = String(id);
            delete token.githubIdLookupFailedAt;
            return token;
        }
    } catch {
        // Network error or timeout: record the failure below.
    }
    token.githubIdLookupFailedAt = now;
    return token;
}
