import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { getNeonClient } from '@/lib/db';
import { parseGitHubError, getOrgAuthInstructions } from '@/lib/github-errors';
import fs from 'fs/promises';
import path from 'path';
import logger from '@/lib/log';
import { detectTemplateLanguage } from '@/lib/detectLanguage';
import { denyIfNoRepoAccess } from '@/lib/repo-access-guard';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ name: string }> }
) {
    const params = await props.params;
    let fullName = ''; // Declare in outer scope for error handling

    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { practiceType, content: providedContent, path: providedPath } = await request.json();
        const repoName = params.name;
        const denied = await denyIfNoRepoAccess(repoName, session);
        if (denied) return denied;

        logger.debug('[fix-best-practice] Request details:', {
            practiceType,
            repoName,
            hasProvidedContent: !!providedContent,
            providedPath
        });

        // Get repo details
        const db = getNeonClient();
        const repoRows = await db`SELECT full_name FROM repos WHERE name = ${repoName} LIMIT 1`;
        if (repoRows.length === 0) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }
        fullName = repoRows[0].full_name;
        const owner = fullName.split('/')[0];

        // Initialize GitHub client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const githubToken = (session as any).accessToken;
        if (!githubToken) throw new Error('GitHub access token not found in session');
        const github = new GitHubClient(githubToken, owner);

        // Detect template language using file signals with fallback to repo language
        const templateLanguage = await detectTemplateLanguage(github.getOctokit(), owner, repoName);
        const isPython = templateLanguage === 'python';

        const filesToAdd: { path: string; content: string }[] = [];
        let branchName: string;
        let commitMessage: string;

        // If content provided from modal, use it directly
        if (providedContent && providedPath) {
            filesToAdd.push({ path: providedPath, content: providedContent });
            branchName = `chore-add-${practiceType}-${Date.now()}`;
            commitMessage = `chore: add ${practiceType}`;
        } else {
            // Fallback: read from template files
            // Handle different practice types
            switch (practiceType) {
                case 'dependabot': {
                    const templatePath = path.join(process.cwd(), 'templates', '.github', 'dependabot.yml');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({
                        path: '.github/dependabot.yml',
                        content
                    });
                    branchName = `chore-add-dependabot-${Date.now()}`;
                    commitMessage = 'chore: add Dependabot configuration for automatic dependency updates';
                    break;
                }

                case 'env_template': {
                    const templatePath = path.join(process.cwd(), 'templates', '.env.example');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({
                        path: '.env.example',
                        content
                    });
                    branchName = `chore-add-env-template-${Date.now()}`;
                    commitMessage = 'chore: add environment variables template';
                    break;
                }

                case 'docker': {
                    const dockerfilePath = path.join(process.cwd(), 'templates', 'Dockerfile');
                    const dockerComposeePath = path.join(process.cwd(), 'templates', 'docker-compose.yml');
                    const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');
                    const dockerComposeContent = await fs.readFile(dockerComposeePath, 'utf-8');
                    filesToAdd.push(
                        {
                            path: 'Dockerfile',
                            content: dockerfileContent
                        },
                        {
                        path: 'docker-compose.yml',
                        content: dockerComposeContent
                    }
                );
                branchName = `chore-add-docker-${Date.now()}`;
                commitMessage = 'chore: add Docker configuration';
                break;
            }

            case 'visual_docs': {
                // Add visual-docs workflow, readme script, mermaid config, and sample diagram
                const workflowTemplatePath = path.join(process.cwd(), 'templates', '.github', 'workflows', 'visual-docs.yml');
                const workflowContent = await fs.readFile(workflowTemplatePath, 'utf-8');
                filesToAdd.push({
                    path: '.github/workflows/visual-docs.yml',
                    content: workflowContent
                });

                // Add the visual-docs-readme.mjs script
                const readmeScriptPath = path.join(process.cwd(), 'scripts', 'visual-docs-readme.mjs');
                const readmeScriptContent = await fs.readFile(readmeScriptPath, 'utf-8');
                filesToAdd.push({
                    path: 'scripts/visual-docs-readme.mjs',
                    content: readmeScriptContent
                });

                // Add mermaid config (optional)
                const mermaidConfigPath = path.join(process.cwd(), 'templates', 'diagrams', 'mermaid.config.json');
                try {
                    const mermaidConfigContent = await fs.readFile(mermaidConfigPath, 'utf-8');
                    filesToAdd.push({
                        path: 'docs/diagrams/mermaid.config.json',
                        content: mermaidConfigContent
                    });
                } catch {
                    // mermaid config is optional
                }

                // Add a sample mermaid diagram
                const sampleDiagramPath = path.join(process.cwd(), 'templates', 'diagrams', 'architecture.mmd');
                try {
                    const sampleDiagramContent = await fs.readFile(sampleDiagramPath, 'utf-8');
                    filesToAdd.push({
                        path: 'docs/diagrams/architecture.mmd',
                        content: sampleDiagramContent
                    });
                } catch {
                    // sample diagram is optional
                }

                // Add README markers if README exists
                try {
                    const readme = await github.getFileContent(repoName, 'README.md');
                    if (readme && !readme.includes('<!-- visual-docs:start -->')) {
                        const lines = readme.split('\n');
                        let insertIndex = lines.length;
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].trim() === '## Screenshots & diagrams') {
                                insertIndex = i + 1;
                                break;
                            }
                        }
                        // If no Screenshots & diagrams section, append at end
                        if (insertIndex === lines.length) {
                            lines.push('', '## Screenshots & diagrams', '');
                        }
                        lines.splice(insertIndex, 0, '<!-- visual-docs:start -->', '<!-- visual-docs:end -->');
                        const newReadme = lines.join('\n');
                        filesToAdd.push({
                            path: 'README.md',
                            content: newReadme
                        });
                    }
                } catch {
                    // README not found or error - skip
                }

                branchName = `chore-add-visual-docs-${Date.now()}`;
                commitMessage = 'chore: add visual-docs CI recipe for diagrams and screenshots';
                break;
            }

            case 'deploy_badge': {
                // Special case: modify existing README
                try {
                    const readme = await github.getFileContent(repoName, 'README.md');
                    if (!readme) {
                        return NextResponse.json({ error: 'README.md not found' }, { status: 404 });
                    }

                    // Check if deploy badge already exists
                    const deployBadgePatterns = [
                        'api.netlify.com/api/v1/badges',
                        'vercel.com',
                        'img.shields.io/badge/Deployed',
                        'railway.app',
                        'render.com',
                        'fly.io',
                        'heroku.com',
                    ];
                    if (deployBadgePatterns.some(pattern => readme.includes(pattern))) {
                        return NextResponse.json({ message: 'Deploy badge already exists in README' }, { status: 200 });
                    }

                    // Add generic deployment badge placeholder at the top of README (after title if exists)
                    const lines = readme.split('\n');
                    const badgeMarkdown = `[![Deploy Status](https://img.shields.io/badge/Deploy-Status-blue?style=for-the-badge)](https://your-deployment-url.com)\n`;
                    
                    // Find first non-empty line (usually title)
                    let insertIndex = 0;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].trim().startsWith('#')) {
                            insertIndex = i + 1;
                            break;
                        }
                    }

                    lines.splice(insertIndex, 0, '', badgeMarkdown);
                    const newReadme = lines.join('\n');

                    filesToAdd.push({
                        path: 'README.md',
                        content: newReadme
                    });
                    branchName = `docs-add-deploy-badge-${Date.now()}`;
                    commitMessage = 'docs: add deployment status badge to README';
                } catch (error) {
                    logger.warn('Error adding deploy badge:', error);
                    return NextResponse.json({ error: 'Failed to add deploy badge' }, { status: 500 });
                }
                break;
            }

            case 'ci_cd': {
                const templatePath = isPython
                    ? path.join(process.cwd(), 'templates', '.github', 'workflows', 'ci-python.yml')
                    : path.join(process.cwd(), 'templates', '.github', 'workflows', 'ci.yml');
                const content = await fs.readFile(templatePath, 'utf-8');
                filesToAdd.push({
                    path: '.github/workflows/ci.yml',
                    content
                });
                branchName = `chore-add-ci-cd-${Date.now()}`;
                commitMessage = 'chore: add CI/CD workflow configuration';
                break;
            }

            case 'gitignore': {
                const templatePath = path.join(process.cwd(), 'templates', '.gitignore');
                const content = await fs.readFile(templatePath, 'utf-8');
                filesToAdd.push({
                    path: '.gitignore',
                    content
                });
                branchName = `chore-add-gitignore-${Date.now()}`;
                commitMessage = 'chore: add .gitignore file';
                break;
            }

            case 'pre_commit_hooks': {
                const templatePath = path.join(process.cwd(), 'templates', '.pre-commit-config.yaml');
                const content = await fs.readFile(templatePath, 'utf-8');
                filesToAdd.push({
                    path: '.pre-commit-config.yaml',
                    content
                });
                branchName = `chore-add-pre-commit-hooks-${Date.now()}`;
                commitMessage = 'chore: add pre-commit hooks configuration';
                break;
            }

            case 'testing_framework': {
                if (isPython) {
                    const pytestIniPath = path.join(process.cwd(), 'templates', 'testing', 'pytest.ini');
                    const pytestIniContent = await fs.readFile(pytestIniPath, 'utf-8');
                    filesToAdd.push({ path: 'pytest.ini', content: pytestIniContent });

                    // Optional: include a minimal pyproject for pytest if present
                    const pyprojectPath = path.join(process.cwd(), 'templates', 'linting', 'pyproject.toml');
                    try {
                        const pyprojectContent = await fs.readFile(pyprojectPath, 'utf-8');
                        filesToAdd.push({ path: 'pyproject.toml', content: pyprojectContent });
                    } catch {
                        // skip if template not present
                    }

                    branchName = `chore-add-testing-framework-${Date.now()}`;
                    commitMessage = 'chore: add pytest testing configuration';
                } else {
                    const templatePath = path.join(process.cwd(), 'templates', 'testing', 'vitest.config.ts');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({ path: 'vitest.config.ts', content });
                    branchName = `chore-add-testing-framework-${Date.now()}`;
                    commitMessage = 'chore: add vitest testing configuration';
                }
                break;
            }

            case 'linting': {
                if (isPython) {
                    const pyprojectPath = path.join(process.cwd(), 'templates', 'linting', 'pyproject.toml');
                    const content = await fs.readFile(pyprojectPath, 'utf-8');
                    filesToAdd.push({ path: 'pyproject.toml', content });

                    // Optional flake8/ruff configs if present
                    const flake8Path = path.join(process.cwd(), 'templates', 'linting', '.flake8');
                    try {
                        const flake8Content = await fs.readFile(flake8Path, 'utf-8');
                        filesToAdd.push({ path: '.flake8', content: flake8Content });
                    } catch { /* optional */ }

                    branchName = `chore-add-linting-${Date.now()}`;
                    commitMessage = 'chore: add Python linting (ruff/black) configuration';
                } else {
                    const templatePath = path.join(process.cwd(), 'templates', 'linting', 'eslint.config.mjs');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({ path: 'eslint.config.mjs', content });
                    branchName = `chore-add-linting-${Date.now()}`;
                    commitMessage = 'chore: add JavaScript linting configuration';
                }
                break;
            }

            default:
                return NextResponse.json({ error: `Unsupported practice type: ${practiceType}` }, { status: 400 });
            }
        }

        if (filesToAdd.length === 0) {
            return NextResponse.json({ error: 'No files to add' }, { status: 400 });
        }

        // Create branch and PR
        const prUrl = await github.createPrForFiles(
            repoName,
            branchName,
            filesToAdd,
            commitMessage
        );

        return NextResponse.json({ 
            success: true, 
            branch: branchName, 
            prUrl,
            count: filesToAdd.length,
            files: filesToAdd.map(f => f.path)
        });
    } catch (error: unknown) {
        logger.warn('Error creating PR for best practice:', error);
        
        // Parse the error and provide helpful context
        const errorDetails = parseGitHubError(error);
        
        if (errorDetails.type === 'oauth_restriction') {
            const orgName = fullName.split('/')[0];
            const instructions = getOrgAuthInstructions(orgName);
            
            return NextResponse.json({ 
                error: errorDetails.userMessage,
                type: errorDetails.type,
                instructions,
                helpUrl: errorDetails.helpUrl
            }, { status: 403 });
        }
        
        return NextResponse.json({ 
            error: errorDetails.userMessage,
            type: errorDetails.type,
            helpUrl: errorDetails.helpUrl
        }, { status: 500 });
    }
}
