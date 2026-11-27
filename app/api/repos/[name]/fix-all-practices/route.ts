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
  let fullName = '';
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const filesFromModal = body.files as Array<{path: string; content: string; practiceType: string}> | undefined;

    const repoName = params.name;
    const denied = await denyIfNoRepoAccess(repoName, session);
    if (denied) return denied;
    const db = getNeonClient();
    const repoRows = await db`SELECT full_name FROM repos WHERE name = ${repoName} LIMIT 1`;
    if (repoRows.length === 0) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }
    fullName = repoRows[0].full_name;
    const owner = fullName.split('/')[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const githubToken = (session as any).accessToken;
    if (!githubToken) throw new Error('GitHub access token not found in session');
    const github = new GitHubClient(githubToken, owner);

    // Fetch repo language once for template selection
    const { data: repoData } = await github.getOctokit().repos.get({
      owner,
      repo: repoName,
    });
    const isPython = repoData.language?.toLowerCase() === 'python';

    let filesToAdd: { path: string; content: string }[];
    let addedTypes: string[];

    if (filesFromModal && filesFromModal.length > 0) {
      // Use edited content from modal
      filesToAdd = filesFromModal.map(f => ({
        path: f.path,
        content: f.content
      }));
      addedTypes = filesFromModal.map(f => String(f.practiceType));
    } else {
      // Fallback: read templates from disk (old behavior)
      const { practiceTypes } = body;
      if (!practiceTypes || !Array.isArray(practiceTypes) || practiceTypes.length === 0) {
        return NextResponse.json({ error: 'practiceTypes array or files array required' }, { status: 400 });
      }

      filesToAdd = [];
      addedTypes = [];

      // Aggregate files for each requested practice type
      for (const practiceType of practiceTypes) {
        switch (practiceType) {
          case 'dependabot': {
            const templatePath = path.join(process.cwd(), 'templates', '.github', 'dependabot.yml');
            const content = await fs.readFile(templatePath, 'utf-8');
            filesToAdd.push({ path: '.github/dependabot.yml', content });
            addedTypes.push('dependabot');
            break;
          }
          case 'env_template': {
            const templatePath = path.join(process.cwd(), 'templates', 'env', '.env.example');
            const content = await fs.readFile(templatePath, 'utf-8');
            filesToAdd.push({ path: '.env.example', content });
            addedTypes.push('env_template');
            break;
          }
          case 'docker': {
            const dockerfilePath = path.join(process.cwd(), 'templates', 'docker', 'Dockerfile');
            const dockerComposePath = path.join(process.cwd(), 'templates', 'docker', 'docker-compose.yml');
            const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');
            const dockerComposeContent = await fs.readFile(dockerComposePath, 'utf-8');
            filesToAdd.push({ path: 'Dockerfile', content: dockerfileContent });
            filesToAdd.push({ path: 'docker-compose.yml', content: dockerComposeContent });
            addedTypes.push('docker');
            break;
          }
          case 'deploy_badge': {
            try {
              const readme = await github.getFileContent(repoName, 'README.md');
              if (!readme) {
                // If README missing, skip gracefully
                logger.warn('README.md not found for deploy_badge');
                break;
              }
              if (readme.includes('api.netlify.com/api/v1/badges')) {
                break; // already present
              }
              const hasNetlify = await github.getFileContent(repoName, 'netlify.toml');
            if (!hasNetlify) {
              logger.warn('netlify.toml not found - cannot add badge with site ID');
              break;
            }
            const lines = readme.split('\n');
            const badgeMarkdown = `[![Netlify Status](https://api.netlify.com/api/v1/badges/YOUR_SITE_ID/deploy-status)](https://app.netlify.com/sites/YOUR_SITE_NAME/deploys)`;
            let insertIndex = 0;
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].trim().startsWith('#')) {
                insertIndex = i + 1;
                break;
              }
            }
            lines.splice(insertIndex, 0, '', badgeMarkdown);
            const newReadme = lines.join('\n');
            filesToAdd.push({ path: 'README.md', content: newReadme });
            addedTypes.push('deploy_badge');
          } catch (error) {
            logger.warn('Error adding deploy badge:', error);
          }
          break;
        }
        case 'ci_cd': {
          const templatePath = isPython
            ? path.join(process.cwd(), 'templates', '.github', 'workflows', 'ci-python.yml')
            : path.join(process.cwd(), 'templates', '.github', 'workflows', 'ci.yml');
          const content = await fs.readFile(templatePath, 'utf-8');
          filesToAdd.push({ path: '.github/workflows/ci.yml', content });
          addedTypes.push('ci_cd');
          break;
        }
        case 'gitignore': {
          const templatePath = path.join(process.cwd(), 'templates', 'gitignore', '.gitignore');
          const content = await fs.readFile(templatePath, 'utf-8');
          filesToAdd.push({ path: '.gitignore', content });
          addedTypes.push('gitignore');
          break;
        }
        case 'pre_commit_hooks': {
          const templatePath = isPython
            ? path.join(process.cwd(), 'templates', 'pre-commit', '.pre-commit-config-python.yaml')
            : path.join(process.cwd(), 'templates', 'pre-commit', '.pre-commit-config.yaml');
          const content = await fs.readFile(templatePath, 'utf-8');
          filesToAdd.push({ path: '.pre-commit-config.yaml', content });
          addedTypes.push('pre_commit_hooks');
          break;
        }
        case 'testing_framework': {
          const templatePath = isPython
            ? path.join(process.cwd(), 'templates', 'testing', 'pytest.ini')
            : path.join(process.cwd(), 'templates', 'testing', 'vitest.config.ts');
          const fileName = isPython ? 'pytest.ini' : 'vitest.config.ts';
          const content = await fs.readFile(templatePath, 'utf-8');
          filesToAdd.push({ path: fileName, content });
          addedTypes.push('testing_framework');
          break;
        }
        case 'linting': {
          const templatePath = isPython
            ? path.join(process.cwd(), 'templates', 'linting', 'pyproject.toml')
            : path.join(process.cwd(), 'templates', 'linting', 'eslint.config.mjs');
          const fileName = isPython ? 'pyproject.toml' : 'eslint.config.mjs';
          const content = await fs.readFile(templatePath, 'utf-8');
          filesToAdd.push({ path: fileName, content });
          addedTypes.push('linting');
          break;
        }
        default:
          // Ignore unsupported types in batch
          break;
        }
      }
    }

    if (filesToAdd.length === 0) {
      return NextResponse.json({ error: 'No files to add' }, { status: 400 });
    }

    const branchName = `chore-add-best-practices-${Date.now()}`;
    const commitMessage = `chore: add best practices`;

    const prUrl = await github.createPrForFiles(
      repoName,
      branchName,
      filesToAdd,
      commitMessage
    );

    return NextResponse.json({ success: true, prUrl, count: filesToAdd.length, addedTypes });
  } catch (error: unknown) {
    logger.warn('Error fixing all best practices:', error);
    return NextResponse.json({ error: 'Failed to fix best practices' }, { status: 500 });
  }
}