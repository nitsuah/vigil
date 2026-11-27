import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { generateAIContent } from '@/lib/ai';
import { enrichContext, buildPracticePrompt, BestPracticeType } from '@/lib/ai-prompt-chain';
import { Octokit } from '@octokit/rest';
import { detectTemplateLanguage } from '@/lib/detectLanguage';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const githubToken = (session as any).accessToken;
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub access token not found' }, { status: 401 });
    }

    const { repoName, practiceType } = await request.json();

    if (!repoName || !practiceType) {
      return NextResponse.json(
        { error: 'Missing repoName or practiceType' },
        { status: 400 }
      );
    }

    // Parse owner/repo
    const [owner, repo] = repoName.includes('/') 
      ? repoName.split('/')
      : [session.user.name || '', repoName];

    // Validate owner and repo to prevent SSRF attacks
    const validGitHubName = /^[a-zA-Z0-9._-]+$/;
    if (!owner || !repo || !validGitHubName.test(owner) || !validGitHubName.test(repo)) {
      return NextResponse.json(
        { error: 'Invalid repository owner or name' },
        { status: 400 }
      );
    }

    // Detect language from repo files with Octokit
    const octokit = new Octokit({ auth: githubToken });
    let language: string | null = null;
    try {
      const detected = await detectTemplateLanguage(octokit, owner, repo);
      const map: Record<string, string | null> = { python: 'Python', javascript: 'JavaScript', mixed: null, other: null };
      language = map[detected] ?? null;
    } catch {
      // Fallback to GitHub's language field using Octokit instead of direct fetch
      try {
        const { data: repoData } = await octokit.repos.get({ owner, repo });
        language = repoData.language;
      } catch {
        // If both methods fail, leave language as null
        language = null;
      }
    }

    // Load template file (language-aware)
    const templatePath = path.join(process.cwd(), 'templates', getTemplateFileName(practiceType, language));
    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf-8');
      console.log(`Loaded template from: ${templatePath}`);
    } catch {
      console.warn(`Template not found at ${templatePath}, using default template`);
      template = getDefaultTemplate(practiceType, language);
    }

    // Build enriched context
    const enrichedContext = await enrichContext(
      {
        repoName: repo,
        repoOwner: owner,
        language,
        practiceType: practiceType as BestPracticeType,
        template,
      },
      githubToken
    );

    // Build prompt with context
    const prompt = buildPracticePrompt(enrichedContext);

    // Generate AI content
    const { text: generatedContent } = await generateAIContent(prompt);

    // Return generated content for modal review
    return NextResponse.json({
      success: true,
      content: generatedContent,
      context: {
        repoName,
        practiceType,
        language,
        hasReadme: !!enrichedContext.readme,
        hasContributing: !!enrichedContext.contributing,
      },
    });
  } catch (error: unknown) {
    console.error('Error generating best practice fix:', error);
    return NextResponse.json(
      { error: 'Failed to generate fix' },
      { status: 500 }
    );
  }
}

function getTemplateFileName(practiceType: string, language: string | null): string {
  const isPython = language === 'Python' || language === 'Jupyter Notebook';
  
  switch (practiceType) {
    case 'deploy_badge':
      return 'community-standards/README.md'; // Will extract badge snippet
    case 'env_template':
      return 'env/.env.example';
    case 'docker':
      return 'docker/Dockerfile';
    case 'dependabot':
      return '.github/dependabot.yml';
    case 'ci_cd':
      return isPython ? '.github/workflows/ci-python.yml' : '.github/workflows/ci.yml';
    case 'gitignore':
      return isPython ? 'gitignore/.gitignore-python' : 'gitignore/.gitignore';
    case 'pre_commit_hooks':
      return isPython ? 'pre-commit/.pre-commit-config-python.yaml' : 'pre-commit/.pre-commit-config.yaml';
    case 'testing_framework':
      return isPython ? 'testing/pytest.ini' : 'testing/vitest.config.ts';
    case 'linting':
      return isPython ? 'linting/pyproject.toml' : 'linting/eslint.config.mjs';
    default:
      return 'community-standards/README.md';
  }
}

function getDefaultTemplate(practiceType: string, language: string | null): string {
  const isPython = language === 'Python' || language === 'Jupyter Notebook';
  
  switch (practiceType) {
    case 'deploy_badge':
      return '[![Deploy Status](https://img.shields.io/badge/Deploy-Status-blue?style=for-the-badge)](DEPLOYMENT_URL_HERE)';
    
    case 'env_template':
      return `# Environment Variables

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# API Keys
API_KEY=your_api_key_here

# App Config
${isPython ? 'PYTHON_ENV=development' : 'NODE_ENV=development'}
PORT=3000`;

    case 'docker':
      if (isPython) {
        return `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "app.py"]`;
      }
      return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]`;

    case 'dependabot':
      return `version: 2
updates:
  - package-ecosystem: "${isPython ? 'pip' : 'npm'}"
    directory: "/"
    schedule:
      interval: "weekly"`;

    case 'ci_cd':
      if (isPython) {
        return `name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install pytest pytest-cov
    - name: Run tests
      run: pytest --cov`;
      }
      return `name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm ci
    - name: Run tests
      run: npm test`;

    case 'gitignore':
      if (isPython) {
        return `__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
.venv/
ENV/
.env
.pytest_cache/
.coverage
htmlcov/
dist/
build/
*.egg-info/
.DS_Store
.idea/
.vscode/`;
      }
      return `node_modules/
dist/
build/
.env
.env.local
coverage/
.DS_Store
.idea/
.vscode/`;

    case 'pre_commit_hooks':
      if (isPython) {
        return `repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: detect-private-key

  - repo: https://github.com/psf/black
    rev: 24.4.2
    hooks:
      - id: black
        language_version: python3

  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks:
      - id: isort
        language_version: python3

  - repo: https://github.com/pycqa/flake8
    rev: 7.0.0
    hooks:
      - id: flake8
        language_version: python3`;
      }
      return `repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer`;

    case 'testing_framework':
      if (isPython) {
        return `[pytest]
markers =
    slow: long-running tests
    integration: integration tests
addopts = -ra --cov --cov-report term-missing

testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

[coverage:run]
source = .
omit =
    */tests/*
    .venv/*

[coverage:report]
fail_under = 80
show_missing = True`;
      }
      return `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});`;

    case 'linting':
      if (isPython) {
        return `[tool.ruff]
line-length = 120
fix = true

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP"]
ignore = ["E203"]

[tool.black]
line-length = 120
skip-string-normalization = true`;
      }
      return `import eslint from '@eslint/js';

export default [
  eslint.configs.recommended,
];`;

    default:
      return '';
  }
}
