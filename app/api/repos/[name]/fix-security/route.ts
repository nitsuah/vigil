import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { getNeonClient } from '@/lib/db';
import { parseGitHubError, getOrgAuthInstructions } from '@/lib/github-errors';
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

        const { featureType, content: providedContent, path: providedPath } = await request.json();
        const repoName = params.name;
        const denied = await denyIfNoRepoAccess(repoName, session);
        if (denied) return denied;

        logger.debug('[fix-security] Request details:', {
            featureType,
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

        const filesToAdd: { path: string; content: string }[] = [];
        let branchName: string;
        let commitMessage: string;

        // If content provided from modal, use it directly
        if (providedContent && providedPath) {
            filesToAdd.push({ path: providedPath, content: providedContent });
            branchName = `chore-add-${featureType}-${Date.now()}`;
            commitMessage = `chore: add ${featureType}`;
        } else {
            // Handle different security feature types
            switch (featureType) {
                case 'security_policy': {
                    const templatePath = path.join(process.cwd(), 'templates', 'community-standards', 'SECURITY.md');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({
                        path: 'SECURITY.md',
                        content
                    });
                    branchName = `chore-add-security-policy-${Date.now()}`;
                    commitMessage = 'chore: add Security Policy (SECURITY.md)';
                    break;
                }

                case 'security_advisories': {
                    // Security advisories are enabled via GitHub repo settings API
                    // This requires admin permissions - create a PR that documents the setting
                    // and add a workflow to enable it via GitHub CLI if needed
                    const templatePath = path.join(process.cwd(), 'templates', 'community-standards', 'SECURITY.md');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({
                        path: 'SECURITY.md',
                        content
                    });

                    // Add a setup script to enable security advisories via GitHub CLI
                    // Uses the proper endpoint: PATCH /repos/{owner}/{repo} with security_and_analysis
                    const setupScript = `#!/bin/bash
# Enable GitHub Security Advisories for this repository
# Run this script locally with: gh auth login && bash enable-security-advisories.sh

set -e

REPO="\${GITHUB_REPOSITORY}"
echo "Enabling Security Advisories for \${REPO}..."

# Enable security advisories via GitHub API using JSON input
gh api --method PATCH /repos/\${REPO} --input - <<'EOF'
{
  "security_and_analysis": {
    "security_advisories": {
      "status": "enabled"
    }
  }
}
EOF

echo "Security Advisories enabled for \${REPO}"
`;
                    filesToAdd.push({
                        path: 'scripts/enable-security-advisories.sh',
                        content: setupScript
                    });

                    branchName = `chore-enable-security-advisories-${Date.now()}`;
                    commitMessage = 'chore: enable GitHub Security Advisories';
                    break;
                }

                case 'private_reporting': {
                    // Private vulnerability reporting is enabled via dedicated GitHub API endpoint
                    const setupScript = `#!/bin/bash
# Enable Private Vulnerability Reporting for this repository
# Run this script locally with: gh auth login && bash enable-private-reporting.sh

set -e

REPO="\${GITHUB_REPOSITORY}"
echo "Enabling Private Vulnerability Reporting for \${REPO}..."

# Enable private vulnerability reporting via dedicated GitHub API endpoint
gh api --method PUT /repos/\${REPO}/private-vulnerability-reporting

echo "Private Vulnerability Reporting enabled for \${REPO}"
`;
                    filesToAdd.push({
                        path: 'scripts/enable-private-reporting.sh',
                        content: setupScript
                    });

                    // Also add SECURITY.md if not present
                    const templatePath = path.join(process.cwd(), 'templates', 'community-standards', 'SECURITY.md');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({
                        path: 'SECURITY.md',
                        content
                    });

                    branchName = `chore-enable-private-reporting-${Date.now()}`;
                    commitMessage = 'chore: enable Private Vulnerability Reporting';
                    break;
                }

                case 'dependabot_alerts': {
                    // Dependabot alerts are enabled via repository settings API
                    // .github/dependabot.yml configures dependency updates, not the alerts themselves
                    const templatePath = path.join(process.cwd(), 'templates', '.github', 'dependabot.yml');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({
                        path: '.github/dependabot.yml',
                        content
                    });

                    // Add a setup script to enable Dependabot alerts via GitHub API
                    const setupScript = `#!/bin/bash
# Enable Dependabot Alerts for this repository
# Run this script locally with: gh auth login && bash enable-dependabot-alerts.sh

set -e

REPO="\${GITHUB_REPOSITORY}"
echo "Enabling Dependabot Alerts for \${REPO}..."

# Enable Dependabot alerts via GitHub API
gh api --method PATCH /repos/\${REPO} --input - <<'EOF'
{
  "security_and_analysis": {
    "dependabot_security_updates": {
      "status": "enabled"
    }
  }
}
EOF

echo "Dependabot Alerts enabled for \${REPO}"
`;
                    filesToAdd.push({
                        path: 'scripts/enable-dependabot-alerts.sh',
                        content: setupScript
                    });

                    branchName = `chore-enable-dependabot-alerts-${Date.now()}`;
                    commitMessage = 'chore: enable Dependabot alerts';
                    break;
                }

                case 'code_scanning': {
                    // CodeQL workflow for code scanning
                    const workflowPath = path.join(process.cwd(), 'templates', '.github', 'workflows', 'codeql.yml');
                    let content: string;
                    try {
                        content = await fs.readFile(workflowPath, 'utf-8');
                    } catch {
                        // Create default CodeQL workflow if template doesn't exist
                        content = `name: CodeQL Analysis

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 0'

permissions:
  contents: read
  security-events: write
  actions: read

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      security-events: write

    strategy:
      fail-fast: false
      matrix:
        language: [javascript, typescript]

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: \${{ matrix.language }}
          queries: security-extended,security-and-quality

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:\${{ matrix.language }}"
`;
                    }
                    filesToAdd.push({
                        path: '.github/workflows/codeql.yml',
                        content
                    });
                    branchName = `chore-enable-code-scanning-${Date.now()}`;
                    commitMessage = 'chore: add CodeQL workflow for code scanning';
                    break;
                }

                case 'secret_scanning': {
                    // Secret scanning is enabled via GitHub repo settings API
                    const setupScript = `#!/bin/bash
# Enable Secret Scanning for this repository
# Run this script locally with: gh auth login && bash enable-secret-scanning.sh

set -e

# Resolve the repository - use GITHUB_REPOSITORY if set (in Actions), otherwise detect from git remote
REPO="\${GITHUB_REPOSITORY}"
if [ -z "\${REPO}" ]; then
    REPO="\$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)"
    if [ -z "\${REPO}" ]; then
        echo "Error: Could not determine repository. Set GITHUB_REPOSITORY or run from a git repository with gh CLI."
        exit 1
    fi
fi

echo "Enabling Secret Scanning for \${REPO}..."

# Enable secret scanning via GitHub API using structured JSON
gh api --method PATCH /repos/\${REPO} --input - <<'EOF'
{
  "security_and_analysis": {
    "secret_scanning": {
      "status": "enabled"
    }
  }
}
EOF

# Enable secret scanning push protection
gh api --method PATCH /repos/\${REPO} --input - <<'EOF'
{
  "security_and_analysis": {
    "secret_scanning_push_protection": {
      "status": "enabled"
    }
  }
}
EOF

echo "Secret Scanning enabled for \${REPO}"
`;
                    filesToAdd.push({
                        path: 'scripts/enable-secret-scanning.sh',
                        content: setupScript
                    });

                    // Also add SECURITY.md if not present
                    const templatePath = path.join(process.cwd(), 'templates', 'community-standards', 'SECURITY.md');
                    const content = await fs.readFile(templatePath, 'utf-8');
                    filesToAdd.push({
                        path: 'SECURITY.md',
                        content
                    });

                    branchName = `chore-enable-secret-scanning-${Date.now()}`;
                    commitMessage = 'chore: enable Secret Scanning';
                    break;
                }

                default:
                    return NextResponse.json({ error: `Unsupported security feature type: ${featureType}` }, { status: 400 });
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
        logger.warn('Error creating PR for security feature:', error);

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