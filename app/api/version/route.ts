import { NextResponse } from 'next/server';

/**
 * GET /api/version -- the git commit this deploy was built from.
 *
 * Public and static-per-deploy. The post-merge smoke test
 * (.github/workflows/smoke.yml) polls this to know when the Cloudflare Workers deploy of a
 * given commit is actually live before running checks against it.
 */
export const dynamic = 'force-static';

export function GET(): NextResponse {
    return NextResponse.json({ commit: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev' });
}
