import { NextResponse } from 'next/server';
import logger from '@/lib/log';
import { auth } from '@/auth';
import { createOctokitClient } from '@/lib/githubClient';
import { coreFromHeaders } from '@/lib/rate-limit-headers';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.accessToken) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const octokit = createOctokitClient(session.accessToken);
        // /rate_limit for GraphQL; a real core request (costs 1) for the core
        // bucket, because /rate_limit can report core as unused (see lib/rate-limit-headers.ts).
        const [{ data }, probe] = await Promise.all([
            octokit.rateLimit.get(),
            // A 403 for an exhausted quota still carries the real x-ratelimit-* headers.
            octokit.rest.users.getAuthenticated().catch((e: unknown) => {
                const headers = (e as { response?: { headers?: unknown } }).response?.headers;
                if (headers) return { headers };
                logger.warn('Rate limit probe failed; falling back to /rate_limit:', e instanceof Error ? e.message : e);
                return null;
            }),
        ]);

        const graphql = data.resources?.graphql;
        if (!graphql) {
            return NextResponse.json(
                { error: 'GraphQL rate limit data unavailable' },
                { status: 502 }
            );
        }

        const reported = data.resources.core;
        const core = (probe && coreFromHeaders(probe.headers as Record<string, string | number | undefined>)) ?? {
            limit: reported.limit,
            remaining: reported.remaining,
            reset: new Date(reported.reset * 1000).toISOString(),
            used: reported.used ?? (reported.limit - reported.remaining),
        };
        const graphqlUsed = graphql.used ?? (graphql.limit - graphql.remaining);

        return NextResponse.json({
            core,
            graphql: {
                limit: graphql.limit,
                remaining: graphql.remaining,
                reset: new Date(graphql.reset * 1000).toISOString(),
                used: graphqlUsed,
            },
        });
    } catch (error: unknown) {
        logger.warn('Rate limit check error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
