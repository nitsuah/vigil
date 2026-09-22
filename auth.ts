import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import logger from './lib/log';

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
    debug: true, // Enable verbose logging to debug OAuth issue
    trustHost: true, // Required for Netlify preview deployments with dynamic URLs
    // Disable secure cookies for localhost HTTP (needed for local dev in production mode)
    useSecureCookies: process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_URL?.includes('localhost'),
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
            if (account) {
                token.accessToken = account.access_token;
            }
            return token;
        },
        async session({ session, token }) {
            logger.debug('Session callback', { session, token });
            // Extend session with accessToken (type augmentation)
            (session as typeof session & { accessToken?: string }).accessToken = token.accessToken as string;
            // token.sub is the GitHub user's numeric id, set from `profile.id`
            // (see the GitHub provider's profile() above) and always present --
            // unlike session.user.email, which GitHub omits for accounts with
            // no public email when the /user/emails fallback also fails.
            // Callers that need a metering/identity key that can never be
            // silently absent should prefer this over session.user.email.
            (session as typeof session & { userId?: string }).userId = token.sub as string;
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
