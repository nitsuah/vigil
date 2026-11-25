import { describe, it, expect } from 'vitest';
import { detectTemplateLanguage, type TemplateLanguage } from './detectLanguage';
import type { Octokit } from '@octokit/rest';

function fakeOctokit(files: string[]): Octokit {
  return {
    repos: {
      getContent: async () => ({ data: files.map(name => ({ name })) }),
    },
  } as unknown as Octokit;
}

describe('detectTemplateLanguage', () => {
  it('returns python for pyproject.toml', async () => {
    const result = await detectTemplateLanguage(fakeOctokit(['pyproject.toml']), 'owner', 'repo');
    expect(result).toBe('python');
  });

  it('returns javascript for package.json', async () => {
    const result = await detectTemplateLanguage(fakeOctokit(['package.json']), 'owner', 'repo');
    expect(result).toBe('javascript');
  });

  it('returns mixed for requirements.txt and tsconfig.json', async () => {
    const result = await detectTemplateLanguage(fakeOctokit(['requirements.txt', 'tsconfig.json']), 'owner', 'repo');
    expect(result).toBe('mixed');
  });

  it('returns other for README.md', async () => {
    const result = await detectTemplateLanguage(fakeOctokit(['README.md']), 'owner', 'repo');
    expect(result).toBe('other');
  });

  it('matches names case-insensitively', async () => {
    const result = await detectTemplateLanguage(fakeOctokit(['Package.JSON']), 'owner', 'repo');
    expect(result).toBe('javascript');
  });

  it('returns other when getContent rejects', async () => {
    const octokit = {
      repos: {
        getContent: async () => { throw new Error('404'); },
      },
    } as unknown as Octokit;
    const result = await detectTemplateLanguage(octokit, 'owner', 'repo');
    expect(result).toBe('other');
  });

  it('returns other when getContent returns a single file object', async () => {
    const octokit = {
      repos: {
        getContent: async () => ({ data: { name: 'package.json' } }),
      },
    } as unknown as Octokit;
    const result = await detectTemplateLanguage(octokit, 'owner', 'repo');
    expect(result).toBe('other');
  });
});