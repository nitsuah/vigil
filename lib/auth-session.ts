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
