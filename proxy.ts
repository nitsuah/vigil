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
  // validate that key themselves.
  if (
    (pathname === '/api/mcp' || pathname === '/api/context') &&
    request.headers.get('authorization')?.startsWith('Bearer ')
  ) {
    return NextResponse.next();
  }

  // A machine client with a missing or empty key gets a JSON 401, not the login
  // page: MCP clients can't read HTML and report a baffling content-type error.
  // Browsers (Accept: text/html) still redirect.
  if (
    !session &&
    (pathname === '/api/mcp' || pathname === '/api/context') &&
    !request.headers.get('accept')?.includes('text/html')
  ) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized — set Authorization: Bearer <MCP_API_KEY> (the key is missing or empty)' },
        id: null,
      },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
    );
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
