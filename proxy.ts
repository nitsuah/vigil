import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';

export async function proxy(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  // Allow access to login page, main dashboard, and API routes without authentication
  if (
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname === '/' ||
    pathname === '/api/health' ||
    pathname === '/api/version' ||
    pathname === '/api/github-rate-limit' ||
    pathname.startsWith('/api/repos') ||
    pathname.startsWith('/api/repo-details') ||
    pathname === '/api/seed-defaults' ||
    pathname === '/api/version'
  ) {
    return NextResponse.next();
  }

  // Machine clients (Claude Code, other MCP agents) carry the MCP_API_KEY as a
  // bearer token instead of a session cookie. Let them reach the two routes that
  // validate that key themselves; without a bearer header they still redirect.
  if (
    (pathname === '/api/mcp' || pathname === '/api/context') &&
    request.headers.get('authorization')?.startsWith('Bearer ')
  ) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!session) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
