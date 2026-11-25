import path from 'path';
import { describe, it, expect } from 'vitest';
import { DOC_TARGET_PATHS, resolveDocTargetPath } from './doc-target-paths';

describe('resolveDocTargetPath', () => {
  it('resolves core docs', () => {
    expect(resolveDocTargetPath('readme')).toBe('README.md');
    expect(resolveDocTargetPath('license')).toBe('LICENSE');
  });

  it('resolves .github paths', () => {
    expect(resolveDocTargetPath('codeowners')).toBe(path.join('.github', 'CODEOWNERS'));
    expect(resolveDocTargetPath('funding')).toBe(path.join('.github', 'FUNDING.yml'));
  });

  it('is case-insensitive', () => {
    expect(resolveDocTargetPath('README')).toBe('README.md');
    expect(resolveDocTargetPath('Readme')).toBe('README.md');
  });

  it('returns undefined for unknown types', () => {
    expect(resolveDocTargetPath('nope')).toBeUndefined();
    expect(resolveDocTargetPath('')).toBeUndefined();
    expect(resolveDocTargetPath('constructor')).toBeUndefined();
    expect(resolveDocTargetPath('__proto__')).toBeUndefined();
    expect(resolveDocTargetPath('toString')).toBeUndefined();
  });

  it('resolves aliases to the same path', () => {
    expect(resolveDocTargetPath('copilot')).toBe(resolveDocTargetPath('copilot_instructions'));
    expect(resolveDocTargetPath('pr_template')).toBe(resolveDocTargetPath('pull_request_template'));
  });

  it('every value is a relative path without .. segments', () => {
    for (const v of Object.values(DOC_TARGET_PATHS)) {
      expect(path.isAbsolute(v)).toBe(false);
      expect(v.split(/[\/\\]/)).not.toContain('..');
    }
  });
});