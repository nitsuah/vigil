import { test, expect } from 'vitest';
import { checkBestPractices } from '../lib/best-practices';
import type { Octokit } from '@octokit/rest';

function mockOctokit(): Octokit {
  // Minimal mock: getBranch throws so branch protection defaults
  return {
    rest: {
      repos: {
        getBranch: async () => { throw new Error('mock'); }
      }
    }
  } as unknown as Octokit;
}

test('detects Netlify deploy badge', async () => {
  const readme = `[![Netlify Status](https://api.netlify.com/api/v1/badges/25a0a90d-195b-4e53-9d94-9a4107321939/deploy-status)](https://app.netlify.com/projects/nitsuah-arcade/deploys)`;
  const res = await checkBestPractices('owner','repo', mockOctokit(), [], readme);
  const deploy = res.practices.find(p=>p.type==='deploy_badge');
  expect(deploy?.status).toBe('healthy');
});

test('detects GitHub Actions deploy badge', async () => {
  const readme = `[![Deploy Status](https://github.com/nitsuah/avatar/actions/workflows/deploy.yml/badge.svg)](https://github.com/nitsuah/avatar/actions)`;
  const res = await checkBestPractices('owner','repo', mockOctokit(), [], readme);
  const deploy = res.practices.find(p=>p.type==='deploy_badge');
  expect(deploy?.status).not.toBe('missing');
});

test('detects Vercel deployed-on shields badge', async () => {
  const readme = `[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/)`;
  const res = await checkBestPractices('owner','repo', mockOctokit(), [], readme);
  const deploy = res.practices.find(p=>p.type==='deploy_badge');
  expect(deploy?.status).toBe('healthy');
});

test('mixed badges: CI + Deploy yields healthy', async () => {
  const readme = `
[![CI](https://github.com/nitsuah/games/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/nitsuah/games/actions)
[![Netlify Status](https://api.netlify.com/api/v1/badges/25a0a90d-195b-4e53-9d94-9a4107321939/deploy-status)](https://app.netlify.com/sites/nitsuah-arcade/deploys)
`;
  const res = await checkBestPractices('owner','repo', mockOctokit(), [], readme);
  const deploy = res.practices.find(p=>p.type==='deploy_badge');
  expect(deploy?.status).toBe('healthy');
});

test('low-confidence deploy indicator yields dormant', async () => {
  const readme = `
![Status](https://img.shields.io/badge/deploy-ready-blue)
`;
  const res = await checkBestPractices('owner','repo', mockOctokit(), [], readme);
  const deploy = res.practices.find(p=>p.type==='deploy_badge');
  expect(deploy?.status).toBe('dormant');
});

test('CI badge on non-deployable repo (tool/library) yields healthy', async () => {
  const readme = `[![CI](https://github.com/nitsuah/osrs/actions/workflows/ci.yml/badge.svg)](https://github.com/nitsuah/osrs/actions)`;
  const fileList: string[] = ['.github/workflows/ci.yml', 'setup.py', 'README.md']; // No deploy config
  const res = await checkBestPractices('owner','repo', mockOctokit(), fileList, readme);
  const deploy = res.practices.find(p=>p.type==='deploy_badge');
  expect(deploy?.status).toBe('healthy');
  expect(deploy?.details.hasCI).toBe(true);
  expect(deploy?.details.isDeployable).toBe(false);
});

test('CI badge on deployable repo (has netlify.toml) yields dormant', async () => {
  const readme = `[![CI](https://github.com/nitsuah/games/actions/workflows/ci.yml/badge.svg)](https://github.com/nitsuah/games/actions)`;
  const fileList: string[] = ['.github/workflows/ci.yml', 'netlify.toml', 'package.json']; // Has deploy config
  const res = await checkBestPractices('owner','repo', mockOctokit(), fileList, readme);
  const deploy = res.practices.find(p=>p.type==='deploy_badge');
  expect(deploy?.status).toBe('dormant'); // Should have deploy badge since it's deployable
  expect(deploy?.details.hasCI).toBe(true);
  expect(deploy?.details.isDeployable).toBe(true);
});

test('handles a pathological unterminated HTML img tag quickly', async () => {
  const pathologicalInput = '<img src="x" ' + 'a="b" '.repeat(50000);
  const start = Date.now();
  const res = await checkBestPractices('owner', 'repo', mockOctokit(), [], pathologicalInput);
  expect(Date.now() - start).toBeLessThan(500);
  expect(res.practices.find((p) => p.type === 'deploy_badge')).toBeDefined();
});

test('HTML img badge still uses alt text and src (netlify badge in an img tag is a deploy badge)', async () => {
  const readme = '<a href="https://app.netlify.com"><img alt="Netlify deploy status" src="https://api.netlify.com/api/v1/badges/0a1b2c3d-0000-0000-0000-000000000000/deploy-status"></a>';
  const res = await checkBestPractices('owner', 'repo', mockOctokit(), [], readme);
  expect(res.practices.find((p) => p.type === 'deploy_badge')?.status).toBe('healthy');
});

test('multiple CI badges (linting, fast, slow) on research repo yields healthy', async () => {
  const readme = `
[![CI fast](https://github.com/nitsuah/kryptos/actions/workflows/ci-fast.yml/badge.svg)](https://github.com/nitsuah/kryptos/actions)
[![CI (smoke)](https://github.com/nitsuah/kryptos/actions/workflows/demo-smoke.yml/badge.svg)](https://github.com/nitsuah/kryptos/actions)
[![CI (slow)](https://github.com/nitsuah/kryptos/actions/workflows/ci-slow.yml/badge.svg)](https://github.com/nitsuah/kryptos/actions)
`;
  const fileList: string[] = [
    '.github/workflows/ci-fast.yml',
    '.github/workflows/demo-smoke.yml', 
    '.github/workflows/ci-slow.yml',
    'pyproject.toml'
  ];
  const res = await checkBestPractices('owner','repo', mockOctokit(), fileList, readme);
  const deploy = res.practices.find(p=>p.type==='deploy_badge');
  expect(deploy?.status).toBe('healthy');
});

