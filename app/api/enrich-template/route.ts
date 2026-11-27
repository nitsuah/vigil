import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { denyIfNoRepoAccess } from '@/lib/repo-access-guard';
import { enrichTemplateWithAI } from '@/lib/template-enricher';
import type { RepoContext } from '@/lib/template-enricher';
import logger from '@/lib/log';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (rawBody === null || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const body = rawBody as { repoName?: unknown; docType?: unknown; templateContent?: unknown };
    const { repoName, docType, templateContent } = body;

    if (
      typeof repoName !== 'string' || !repoName ||
      typeof docType !== 'string' || !docType ||
      typeof templateContent !== 'string'
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const denied = await denyIfNoRepoAccess(repoName, session);
    if (denied) return denied;

    const db = getNeonClient();
    const repoRows = await db`
      SELECT full_name, description, language, topics, homepage, created_at
      FROM repos
      WHERE name = ${repoName}
      LIMIT 1
    `;

    if (repoRows.length === 0) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }

    const raw = repoRows[0];
    const repo: RepoContext = {
      full_name: raw.full_name,
      description: raw.description ?? null,
      language: raw.language ?? null,
      topics: Array.isArray(raw.topics) ? raw.topics as string[] : [],
      homepage: raw.homepage ?? null,
      created_at: raw.created_at instanceof Date
        ? raw.created_at.toISOString()
        : String(raw.created_at ?? ''),
    };
    const enrichedContent = await enrichTemplateWithAI(docType, templateContent, repo);

    return NextResponse.json({ enrichedContent });
  } catch (error: unknown) {
    logger.warn('Error enriching template:', error);
    return NextResponse.json({ error: 'Failed to enrich template' }, { status: 500 });
  }
}
