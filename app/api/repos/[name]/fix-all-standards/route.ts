import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { getNeonClient } from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';
import logger from '@/lib/log';
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

        // Get repo details
        const db = getNeonClient();
        const repoRows = await db`SELECT id, full_name FROM repos WHERE name = ${repoName} LIMIT 1`;
        if (repoRows.length === 0) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }
        const repoId = repoRows[0].id;
        const fullName = repoRows[0].full_name;
        const owner = fullName.split('/')[0];

        // Initialize GitHub client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const githubToken = (session as any).accessToken;
        if (!githubToken) throw new Error('GitHub access token not found in session');
        const github = new GitHubClient(githubToken, owner);

        // Use the existsInGithubFallback flag already stored by sync rather than re-querying GitHub
        const allCsRows = await db`
            SELECT standard_type, details
            FROM community_standards
            WHERE repo_id = ${repoId}
        `;
        const standardsCoveredByFallback = new Set<string>(
            allCsRows
                .filter((r: Record<string, unknown>) => (r.details as Record<string, unknown> | null)?.existsInGithubFallback)
                .map((r: Record<string, unknown>) => r.standard_type as string)
        );

        // Accept optional list of selected files with content from modal
        const body = await request.json().catch(() => ({}));
        const filesFromModal = body.files as Array<{path: string; content: string; docType: string}> | undefined;

        let filesToAdd: { path: string; content: string }[];

        if (filesFromModal && filesFromModal.length > 0) {
            // Use edited content from modal
            filesToAdd = filesFromModal.map(f => ({
                path: f.path,
                content: f.content
            }));
        } else {
            // Fallback: use requested types or query DB for missing standards
            const requestedStandards = body.standardTypes as string[] | undefined;

            let csRows: { standard_type: string }[];
            if (requestedStandards && Array.isArray(requestedStandards) && requestedStandards.length > 0) {
                csRows = requestedStandards.map(s => ({ standard_type: String(s).toLowerCase() }));
            } else {
                const dbRows = await db`
                    SELECT standard_type, status 
                    FROM community_standards 
                    WHERE repo_id = ${repoId} AND status = 'missing'
                `;

                if (dbRows.length === 0) {
                    return NextResponse.json({ message: 'No missing standards to fix' }, { status: 200 });
                }
                csRows = dbRows.map((r: Record<string, string>) => ({ standard_type: r.standard_type }));
            }

            // Filter standards that have templates.
            // codeowners, issue_template, pr_template, funding may be covered by org .github fallback, so
            // standardsCoveredByFallback will skip them automatically when the fallback is populated.
            const standardsWithTemplates = [
                'contributing',
                'code_of_conduct',
                'security',
                'license',
                'changelog',
                'issue_template',
                'pr_template',
                'codeowners',
                'copilot_instructions',
                'funding',
                'flow_tasks_prompt',
                'handoff_prompt'
            ];
            const fixableStandards = csRows.filter(row =>
                standardsWithTemplates.includes(row.standard_type) &&
                !standardsCoveredByFallback.has(row.standard_type)
            );

            if (fixableStandards.length === 0) {
                return NextResponse.json({ 
                    message: standardsCoveredByFallback.size > 0
                        ? 'No fixable standards found (covered by owner .github fallback where applicable)'
                        : 'No fixable standards found'
                }, { status: 200 });
            }

            // Collect files to add by reading templates
            filesToAdd = [];
            for (const standard of fixableStandards) {
                let templatePath: string;
                let targetPath: string;

                // Handle special cases for file paths
                if (standard.standard_type === 'codeowners') {
                    templatePath = path.join(process.cwd(), 'templates', '.github', 'CODEOWNERS');
                    targetPath = '.github/CODEOWNERS';
                } else if (standard.standard_type === 'copilot_instructions') {
                    templatePath = path.join(process.cwd(), 'templates', '.github', 'copilot-instructions.md');
                    targetPath = '.github/copilot-instructions.md';
                } else if (standard.standard_type === 'funding') {
                    templatePath = path.join(process.cwd(), 'templates', '.github', 'FUNDING.yml');
                    targetPath = '.github/FUNDING.yml';
                } else if (standard.standard_type === 'pr_template') {
                    templatePath = path.join(process.cwd(), 'templates', '.github', 'pull_request_template.md');
                    targetPath = '.github/pull_request_template.md';
                } else if (standard.standard_type === 'issue_template') {
                    // Use a concrete issue template file (bug_report)
                    templatePath = path.join(process.cwd(), 'templates', '.github', 'ISSUE_TEMPLATE', 'bug_report.md');
                    targetPath = '.github/ISSUE_TEMPLATE/bug_report.md';
                } else if (standard.standard_type === 'license') {
                    templatePath = path.join(process.cwd(), 'templates', 'community-standards', 'LICENSE');
                    targetPath = 'LICENSE';
                } else if (standard.standard_type === 'flow_tasks_prompt') {
                    templatePath = path.join(process.cwd(), 'templates', '.github', 'prompts', 'FLOW-TASKS.md');
                    targetPath = '.github/prompts/FLOW-TASKS.md';
                } else if (standard.standard_type === 'handoff_prompt') {
                    templatePath = path.join(process.cwd(), 'templates', '.github', 'prompts', 'HANDOFF.md');
                    targetPath = '.github/prompts/HANDOFF.md';
                } else if (['contributing', 'code_of_conduct', 'security', 'changelog', 'roadmap', 'metrics', 'code_of_conduct', 'features', 'tasks'].includes(standard.standard_type)) {
                    // Community standards are in templates/community-standards/
                    templatePath = path.join(process.cwd(), 'templates', 'community-standards', `${standard.standard_type.toUpperCase()}.md`);
                    targetPath = `${standard.standard_type.toUpperCase()}.md`;
                } else {
                    templatePath = path.join(process.cwd(), 'templates', `${standard.standard_type.toUpperCase()}.md`);
                    targetPath = `${standard.standard_type.toUpperCase()}.md`;
                }

                try {
                    const content = await fs.readFile(/*turbopackIgnore: true*/ templatePath, 'utf-8');
                    filesToAdd.push({
                        path: targetPath,
                        content
                    });
                } catch (error) {
                    logger.warn(`Template not found for ${standard.standard_type}:`, error);
                }
            }
        }

        if (filesToAdd.length === 0) {
            return NextResponse.json({ error: 'No templates found for missing standards' }, { status: 404 });
        }

        // Create branch and PR with all files
        const branchName = `docs-add-community-standards-${Date.now()}`;
        const prUrl = await github.createPrForFiles(
            repoName,
            branchName,
            filesToAdd,
            `docs: add community standards`
        );

        return NextResponse.json({ 
            success: true, 
            branch: branchName, 
            prUrl,
            count: filesToAdd.length,
            files: filesToAdd.map(f => f.path)
        });
    } catch (error: unknown) {
        logger.warn('Error creating PR for standards:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
