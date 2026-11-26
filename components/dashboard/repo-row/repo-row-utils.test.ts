import { describe, it, expect } from 'vitest';
import { getTypeIcon } from './repo-row-utils';
import type { RepoType } from '@/lib/repo-type';

describe('repo-row-utils', () => {
  describe('getTypeIcon', () => {
    const testCases: Array<[RepoType, string]> = [
      ['web-app', '🌐'],
      ['game', '🎮'],
      ['tool', '🔧'],
      ['library', '📦'],
      ['bot', '🤖'],
      ['research', '🔬'],
      ['unknown', '📄'],
    ];

    testCases.forEach(([type, expectedIcon]) => {
      it(`should return correct icon for ${type}`, () => {
        expect(getTypeIcon(type)).toBe(expectedIcon);
      });
    });
  });
});