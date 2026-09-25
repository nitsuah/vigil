import { test, expect, vi } from 'vitest';
import { checkBestPractices } from '../lib/best-practices';
import type { Octokit } from '@octokit/rest';

function mockOctokitWithBranch(branchProtected: boolean, hasReviews: boolean): Octokit {
  return {
    rest: {
      repos: {
        getBranch: vi.fn().mockResolvedValue({
          data: {
            protected: branchProtected,
            protection: hasReviews
              ? {
                  required_pull_request_reviews: { required_approving_review_count: 1 },
                  required_status_checks: { strict: true, contexts: [] },
                }
              : undefined,
          },
        }),
      },
    },
  } as unknown as Octokit;
}

function mockOctokitWithBranchError(): Octokit {
  return {
    rest: {
      repos: {
        getBranch: vi.fn().mockRejectedValue(new Error('Branch not found')),
      },
    },
  } as unknown as Octokit;
}

test('detects healthy branch protection with reviews', async () => {
  const octokit = mockOctokitWithBranch(true, true);
  const result = await checkBestPractices('owner', 'repo', octokit, []);

  const branchProt = result.practices.find((p) => p.type === 'branch_protection');
  // With basic protection + reviews + status checks, score = 5 (dormant)
  // Need more features for healthy (>=7)
  expect(branchProt?.status).toBe('dormant');
  expect(branchProt?.details.protected).toBe(true);
  expect(branchProt?.details.requiresReviews).toBe(true);
  expect(branchProt?.details.requiredApprovingReviews).toBe(1);
  expect(branchProt?.details.requiredStatusChecks).toBe(true);
  expect(branchProt?.details.strictStatusChecks).toBe(true);
  expect(branchProt?.details.score).toBe(5);
  expect(branchProt?.details.maxScore).toBe(10);
});

test('detects dormant branch protection without reviews', async () => {
  const octokit = mockOctokitWithBranch(true, false);
  const result = await checkBestPractices('owner', 'repo', octokit, []);

  const branchProt = result.practices.find((p) => p.type === 'branch_protection');
  // Basic protection only, score = 1 (malformed)
  expect(branchProt?.status).toBe('malformed');
  expect(branchProt?.details.protected).toBe(true);
  expect(branchProt?.details.requiresReviews).toBe(false);
  expect(branchProt?.details.score).toBe(1);
  expect(branchProt?.details.maxScore).toBe(10);
});

test('detects missing branch protection when not protected', async () => {
  const octokit = mockOctokitWithBranch(false, false);
  const result = await checkBestPractices('owner', 'repo', octokit, []);
  
  const branchProt = result.practices.find((p) => p.type === 'branch_protection');
  expect(branchProt?.status).toBe('missing');
});

test('handles branch protection check error gracefully', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, []);
  
  const branchProt = result.practices.find((p) => p.type === 'branch_protection');
  expect(branchProt?.status).toBe('missing');
});

test('detects gitignore when present', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['.gitignore', 'README.md']);
  
  const gitignore = result.practices.find((p) => p.type === 'gitignore');
  expect(gitignore?.status).toBe('healthy');
  expect(gitignore?.details.exists).toBe(true);
});

test('detects missing gitignore', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['README.md']);
  
  const gitignore = result.practices.find((p) => p.type === 'gitignore');
  expect(gitignore?.status).toBe('missing');
});

test('detects CI/CD from GitHub Actions', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['.github/workflows/ci.yml']);
  
  const cicd = result.practices.find((p) => p.type === 'ci_cd');
  expect(cicd?.status).toBe('healthy');
  expect(cicd?.details.exists).toBe(true);
});

test('detects CI/CD from Netlify', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['netlify.toml', 'package.json']);
  
  const cicd = result.practices.find((p) => p.type === 'ci_cd');
  expect(cicd?.status).toBe('healthy');
});

test('detects missing CI/CD', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['README.md']);
  
  const cicd = result.practices.find((p) => p.type === 'ci_cd');
  expect(cicd?.status).toBe('missing');
});

test('detects pre-commit hooks from husky', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['.husky/pre-commit']);
  
  const hooks = result.practices.find((p) => p.type === 'pre_commit_hooks');
  expect(hooks?.status).toBe('healthy');
  expect(hooks?.details.exists).toBe(true);
});

test('detects missing pre-commit hooks', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['README.md']);
  
  const hooks = result.practices.find((p) => p.type === 'pre_commit_hooks');
  expect(hooks?.status).toBe('missing');
});

test('detects linting from eslintrc', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['.eslintrc.json']);
  
  const linting = result.practices.find((p) => p.type === 'linting');
  expect(linting?.status).toBe('healthy');
});

test('detects linting from prettier', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['.prettierrc']);
  
  const linting = result.practices.find((p) => p.type === 'linting');
  expect(linting?.status).toBe('healthy');
});

test('detects missing linting', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['README.md']);
  
  const linting = result.practices.find((p) => p.type === 'linting');
  expect(linting?.status).toBe('missing');
});

test('detects testing framework from jest', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['jest.config.js']);
  
  const testing = result.practices.find((p) => p.type === 'testing_framework');
  expect(testing?.status).toBe('dormant'); // Config exists but may need tests
});

test('detects testing framework from vitest', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['vitest.config.ts']);
  
  const testing = result.practices.find((p) => p.type === 'testing_framework');
  expect(testing?.status).toBe('dormant'); // Config exists but may need tests
});

test('detects missing testing framework', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['README.md']);
  
  const testing = result.practices.find((p) => p.type === 'testing_framework');
  expect(testing?.status).toBe('missing');
});

test('detects Docker from Dockerfile', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['Dockerfile']);
  
  const docker = result.practices.find((p) => p.type === 'docker');
  expect(docker?.status).toBe('healthy');
});

test('detects Docker from docker-compose', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['docker-compose.yml']);
  
  const docker = result.practices.find((p) => p.type === 'docker');
  expect(docker?.status).toBe('healthy');
});

test('detects missing Docker', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['README.md']);
  
  const docker = result.practices.find((p) => p.type === 'docker');
  expect(docker?.status).toBe('missing');
});

test('detects env template from .env.example', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['.env.example']);
  
  const envTemplate = result.practices.find((p) => p.type === 'env_template');
  expect(envTemplate?.status).toBe('healthy');
});

test('detects env template from .env.template', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['.env.template']);
  
  const envTemplate = result.practices.find((p) => p.type === 'env_template');
  expect(envTemplate?.status).toBe('healthy');
});

test('detects missing env template', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['README.md']);
  
  const envTemplate = result.practices.find((p) => p.type === 'env_template');
  expect(envTemplate?.status).toBe('missing');
});

test('detects Dependabot from config', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['.github/dependabot.yml']);
  
  const dependabot = result.practices.find((p) => p.type === 'dependabot');
  expect(dependabot?.status).toBe('healthy');
});

test('detects missing Dependabot', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['README.md']);

  const dependabot = result.practices.find((p) => p.type === 'dependabot');
  expect(dependabot?.status).toBe('missing');
});

test('detects pre-commit hooks from config/.pre-commit-config.yaml', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['config/.pre-commit-config.yaml']);

  const hooks = result.practices.find((p) => p.type === 'pre_commit_hooks');
  expect(hooks?.status).toBe('healthy');
  expect(hooks?.details.exists).toBe(true);
});

test('detects linting from config/.pylintrc', async () => {
  const octokit = mockOctokitWithBranchError();
  const result = await checkBestPractices('owner', 'repo', octokit, ['config/.pylintrc']);

  const linting = result.practices.find((p) => p.type === 'linting');
  expect(linting?.status).toBe('healthy');
});
