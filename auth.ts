import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import logger from './lib/log';
import { applyJwt, sessionUserId } from '@/lib/auth-session';

// Exact-match check (not substring) so a host like "notlocalhost.example.com" doesn't
// falsely qualify for the localhost HTTP exemption below.
function isLocalhostHttpUrl(url: string | undefined): boolean {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' && parsed.hostname === 'localhost';
    } catch {
        return false;
    }
}

// Validate required environment variables
if (!process.env.GITHUB_ID) {
    throw new Error('Missing required environment variable: GITHUB_ID');
}
if (!process.env.GITHUB_SECRET) {
    throw new Error('Missing required environment variable: GITHUB_SECRET');
}
if (!process.env.NEXTAUTH_SECRET) {
    throw new Error('Missing required environment variable: NEXTAUTH_SECRET');
}

logger.info('Initializing NextAuth with:', {
    githubIdPresent: !!process.env.GITHUB_ID,
    githubSecretPresent: !!process.env.GITHUB_SECRET,
    nextauthSecretPresent: !!process.env.NEXTAUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
    nextauthUrl: process.env.NEXTAUTH_URL,
    netlifyUrl: process.env.URL,
    deployPrimeUrl: process.env.DEPLOY_PRIME_URL,
    deployUrl: process.env.DEPLOY_URL,
});

// Set NEXTAUTH_URL from Netlify URL if available
// This ensures NextAuth uses the correct public URL even in dev mode
// DEPLOY_PRIME_URL is the URL for this specific deploy (works for previews)
// URL is the main site URL (production)
const publicUrl = process.env.DEPLOY_PRIME_URL || process.env.URL || process.env.NEXTAUTH_URL;
if (publicUrl && !process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = publicUrl;
    logger.info('Set NEXTAUTH_URL from Netlify:', { from: process.env.DEPLOY_PRIME_URL ? 'DEPLOY_PRIME_URL' : 'URL', url: publicUrl });
}

// NextAuth v5 also checks AUTH_URL and AUTH_REDIRECT_PROXY_URL
// Force these to match NEXTAUTH_URL to prevent prod URL fallback
if (process.env.NEXTAUTH_URL) {
    process.env.AUTH_URL = process.env.NEXTAUTH_URL;
    process.env.AUTH_REDIRECT_PROXY_URL = process.env.NEXTAUTH_URL;
    logger.info('Forced AUTH_URL to match NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    secret: process.env.NEXTAUTH_SECRET,
    basePath: '/api/auth',
    debug: process.env.NODE_ENV !== 'production', // Verbose logging outside production only
    trustHost: true, // Required for Netlify preview deployments with dynamic URLs
    // Disable secure cookies only for exact HTTP localhost (needed for local dev in production
    // mode); substring matching on NEXTAUTH_URL would also match hosts like "notlocalhost.example.com"
    useSecureCookies: process.env.NODE_ENV === 'production' && !isLocalhostHttpUrl(process.env.NEXTAUTH_URL),
    session: {
        strategy: 'jwt', // Explicitly use JWT strategy to persist accessToken
    },
    // Override to ensure we use the correct URL for previews
    ...(process.env.NEXTAUTH_URL && { url: process.env.NEXTAUTH_URL }),
    providers: [
        GitHub({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            authorization: {
                params: {
                    scope: 'repo workflow read:user user:email',
                },
            },
            // Safely map profile fields; avoid undefined .toString()
            profile(profile) {
                return {
                    id: profile.id?.toString(),
                    name: profile.name ?? profile.login,
                    email: profile.email,
                    image: profile.avatar_url,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            logger.debug('JWT callback', { token, account });
            return applyJwt(token, account);
        },
        async session({ session, token }) {
            logger.debug('Session callback', { session, token });
            // Extend session with accessToken (type augmentation)
            (session as typeof session & { accessToken?: string }).accessToken = token.accessToken as string;
            // userId is the GitHub numeric id captured at sign-in (lib/auth-session.ts).
            // NOT token.sub: without an adapter Auth.js makes that a random UUID per
            // login, which matched no repo_access grant or sync_progress row.
            const userId = sessionUserId(token);
            if (userId) (session as typeof session & { userId?: string }).userId = userId;
            return session;
        },
        async redirect({ url, baseUrl }) {
            // Log redirect attempts to debug localhost issue
            logger.info('Redirect callback', { url, baseUrl, env: process.env.NODE_ENV });
            
            // Force use of NEXTAUTH_URL if baseUrl is localhost (dev mode issue)
            const isLocalhost = baseUrl.startsWith('http://localhost') || baseUrl.startsWith('https://localhost');
            const actualBaseUrl = isLocalhost && process.env.NEXTAUTH_URL
                ? process.env.NEXTAUTH_URL
                : baseUrl;
            
            // Always redirect to the same domain
            if (url.startsWith('/')) return `${actualBaseUrl}${url}`;
            else if (new URL(url).origin === actualBaseUrl) return url;
            return actualBaseUrl;
        },
    },
});
