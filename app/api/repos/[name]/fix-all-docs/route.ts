
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/log';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { getNeonClient } from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';
import { denyIfNoRepoAccess } from '@/lib/repo-access-guard';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ name: string }> }
) {
    const params = await props.params;
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const repoName = params.name;
        const denied = await denyIfNoRepoAccess(repoName, session);
        if (denied) return denied;
        const db = getNeonClient();
        
        // Allow files with content to be passed directly from modal
        const body = await request.json().catch(() => ({}));
        const filesFromModal = body.files as Array<{path: string; content: string; docType: string}> | undefined;

        let filesToCreate: Array<{path: string; content: string}>;

        if (filesFromModal && filesFromModal.length > 0) {
            // Use edited content from modal
            filesToCreate = filesFromModal.map(f => ({
                path: f.path,
                content: f.content
            }));
        } else {
            // Fallback: read templates from disk (old behavior)
            const requestedDocs = body.docTypes as string[] | undefined;
            const coreDocs = requestedDocs || ['roadmap', 'tasks', 'metrics', 'features'];
            
            const existingDocTypes = new Set(
                (await db`
                    SELECT doc_type 
                    FROM doc_status 
                    WHERE repo_id = (SELECT id FROM repos WHERE name = ${repoName}) 
                    AND exists = true
                `).map(d => d.doc_type)
            );

            const missingDocs = coreDocs.filter(d => !existingDocTypes.has(d));

            if (missingDocs.length === 0) {
                return NextResponse.json({ message: 'No missing docs to fix' });
            }

            filesToCreate = [];
            for (const docType of missingDocs) {
                const templatePath = path.join(process.cwd(), 'templates', `${docType.toUpperCase()}.md`);
                try {
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToCreate.push({
                        path: `${docType.toUpperCase()}.md`,
                        content
                    });
                } catch {
                    logger.warn(`Template for ${docType} not found`);
                }
            }
        }

        if (filesToCreate.length === 0) {
            return NextResponse.json({ error: 'No templates found for missing docs' }, { status: 400 });
        }

        // Get repo owner
        const repoRows = await db`SELECT full_name FROM repos WHERE name = ${repoName} LIMIT 1`;
        if (repoRows.length === 0) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }
        const fullName = repoRows[0].full_name;
        const owner = fullName.split('/')[0];

        // Initialize GitHub client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const githubToken = (session as any).accessToken;
        if (!githubToken) throw new Error('GitHub access token not found in session');
        const github = new GitHubClient(githubToken, owner);

        const branchName = `docs-add-missing-docs-${Date.now()}`;

        const prUrl = await github.createPrForFiles(
            repoName,
            branchName,
            filesToCreate,
            `docs: add missing documentation`
        );

        return NextResponse.json({ success: true, prUrl, count: filesToCreate.length });
    } catch (error: unknown) {
        logger.warn('Error fixing all docs:', error);
        return NextResponse.json({ error: 'Failed to fix docs' }, { status: 500 });
    }
}
