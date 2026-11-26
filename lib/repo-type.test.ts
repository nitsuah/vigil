import { describe, it, expect } from 'vitest';
import { detectRepoType, getTypeColor, type RepoType } from './repo-type';

describe('repo-type', () => {
  describe('detectRepoType', () => {
    it('should detect game repos by name', () => {
      const result = detectRepoType('my-game', 'A cool project', null, []);
      expect(result.type).toBe('game');
      expect(result.icon).toBe('🎮');
      expect(result.color).toBe('purple');
    });

    it('should detect game repos by description', () => {
      const result = detectRepoType('project', 'This is a game', null, []);
      expect(result.type).toBe('game');
    });

    it('should detect game repos by topic', () => {
      const result = detectRepoType('project', 'A cool project', null, ['game']);
      expect(result.type).toBe('game');
    });

    it('should detect darkmoon as game', () => {
      const result = detectRepoType('darkmoon', 'A project', null, []);
      expect(result.type).toBe('game');
    });

    it('should detect bot repos by name', () => {
      const result = detectRepoType('discord-bot', 'A cool project', null, []);
      expect(result.type).toBe('bot');
      expect(result.icon).toBe('🤖');
      expect(result.color).toBe('cyan');
    });

    it('should detect bot repos by description', () => {
      const result = detectRepoType('project', 'This is a bot', null, []);
      expect(result.type).toBe('bot');
    });

    it('should detect bot repos by topic', () => {
      const result = detectRepoType('project', 'A cool project', null, ['bot']);
      expect(result.type).toBe('bot');
    });

    it('should detect osrs as bot', () => {
      const result = detectRepoType('osrs', 'A project', null, []);
      expect(result.type).toBe('bot');
    });

    it('should detect web-app by nextjs topic', () => {
      const result = detectRepoType('project', 'A cool project', null, ['nextjs']);
      expect(result.type).toBe('web-app');
      expect(result.icon).toBe('🌐');
      expect(result.color).toBe('blue');
    });

    it('should detect web-app by react topic', () => {
      const result = detectRepoType('project', 'A cool project', null, ['react']);
      expect(result.type).toBe('web-app');
    });

    it('should detect web-app by vue topic', () => {
      const result = detectRepoType('project', 'A cool project', null, ['vue']);
      expect(result.type).toBe('web-app');
    });

    it('should detect web-app by website topic', () => {
      const result = detectRepoType('project', 'A cool project', null, ['website']);
      expect(result.type).toBe('web-app');
    });

    it('should detect web-app by portfolio topic', () => {
      const result = detectRepoType('project', 'A cool project', null, ['portfolio']);
      expect(result.type).toBe('web-app');
    });

    it('should detect web-app by .io in name', () => {
      const result = detectRepoType('project.io', 'A cool project', null, []);
      expect(result.type).toBe('web-app');
    });

    it('should detect web-app by web in name', () => {
      const result = detectRepoType('webapp', 'A cool project', null, []);
      expect(result.type).toBe('web-app');
    });

    it('should detect tool by description', () => {
      const result = detectRepoType('project', 'A useful tool', null, []);
      expect(result.type).toBe('tool');
      expect(result.icon).toBe('🔧');
      expect(result.color).toBe('orange');
    });

    it('should detect tool by cli description', () => {
      const result = detectRepoType('project', 'A cli utility', null, []);
      expect(result.type).toBe('tool');
    });

    it('should detect tool by utility description', () => {
      const result = detectRepoType('project', 'A utility', null, []);
      expect(result.type).toBe('tool');
    });

    it('should detect tool by cli topic', () => {
      const result = detectRepoType('project', 'A project', null, ['cli']);
      expect(result.type).toBe('tool');
    });

    it('should detect tool by tool topic', () => {
      const result = detectRepoType('project', 'A project', null, ['tool']);
      expect(result.type).toBe('tool');
    });

    it('should detect kryptos as tool', () => {
      const result = detectRepoType('kryptos', 'A project', null, []);
      expect(result.type).toBe('tool');
    });

    it('should detect gcp as tool', () => {
      const result = detectRepoType('gcp', 'A project', null, []);
      expect(result.type).toBe('tool');
    });

    it('should detect library by description', () => {
      const result = detectRepoType('project', 'A library', null, []);
      expect(result.type).toBe('library');
      expect(result.icon).toBe('📦');
      expect(result.color).toBe('green');
    });

    it('should detect library by package description', () => {
      const result = detectRepoType('project', 'An npm package', null, []);
      expect(result.type).toBe('library');
    });

    it('should detect library by library topic', () => {
      const result = detectRepoType('project', 'A project', null, ['library']);
      expect(result.type).toBe('library');
    });

    it('should detect library by npm-package topic', () => {
      const result = detectRepoType('project', 'A project', null, ['npm-package']);
      expect(result.type).toBe('library');
    });

    it('should detect research by description', () => {
      const result = detectRepoType('project', 'Research project', null, []);
      expect(result.type).toBe('research');
      expect(result.icon).toBe('🔬');
      expect(result.color).toBe('pink');
    });

    it('should detect research by experiment description', () => {
      const result = detectRepoType('project', 'An experiment', null, []);
      expect(result.type).toBe('research');
    });

    it('should detect research by topic', () => {
      const result = detectRepoType('project', 'A project', null, ['research']);
      expect(result.type).toBe('research');
    });

    it('should return unknown for unrecognized repos', () => {
      const result = detectRepoType('project', 'A project', null, []);
      expect(result.type).toBe('unknown');
      expect(result.icon).toBe('📄');
      expect(result.color).toBe('gray');
    });

    it('should handle case insensitivity', () => {
      const result1 = detectRepoType('MY-GAME', 'A COOL PROJECT', null, []);
      expect(result1.type).toBe('game');

      const result2 = detectRepoType('project', 'This is a GAME', null, []);
      expect(result2.type).toBe('game');

      const result3 = detectRepoType('project', 'A project', null, ['GAME']);
      expect(result3.type).toBe('game');
    });

    it('should prioritize game over other types', () => {
      const result = detectRepoType('game-bot', 'A game bot tool', null, ['game', 'bot', 'tool']);
      expect(result.type).toBe('game');
    });

    it('should prioritize bot over web-app', () => {
      const result = detectRepoType('web-bot', 'A web bot', null, ['bot', 'react']);
      expect(result.type).toBe('bot');
    });

    it('should prioritize web-app over tool', () => {
      const result = detectRepoType('project', 'A web application tool', null, ['react', 'tool']);
      expect(result.type).toBe('web-app');
    });

    it('should prioritize bot over tool', () => {
      const result = detectRepoType('bot-tool', 'A bot tool', null, ['bot', 'cli']);
      expect(result.type).toBe('bot');
    });

    it('should prioritize tool over library', () => {
      const result = detectRepoType('tool-lib', 'A tool library', null, ['tool', 'library']);
      expect(result.type).toBe('tool');
    });

    it('should prioritize library over research', () => {
      const result = detectRepoType('lib-research', 'A library for research', null, ['library', 'research']);
      expect(result.type).toBe('library');
    });

    it('should prioritize research over unknown', () => {
      const result = detectRepoType('research-proj', 'An experiment', null, ['research']);
      expect(result.type).toBe('research');
    });

    it('should handle null description', () => {
      const result = detectRepoType('my-game', null, null, []);
      expect(result.type).toBe('game');
    });

    it('should handle empty topic array', () => {
      const result = detectRepoType('project', 'A game', null, []);
      expect(result.type).toBe('game');
    });

    it('should handle case-insensitive topics', () => {
      const result1 = detectRepoType('project', 'A project', null, ['GAME']);
      expect(result1.type).toBe('game');

      const result2 = detectRepoType('project', 'A project', null, ['NextJS', 'REACT']);
      expect(result2.type).toBe('web-app');

      const result3 = detectRepoType('project', 'A project', null, ['CLI', 'TOOL']);
      expect(result3.type).toBe('tool');
    });

    it('should detect bot by phaser topic', () => {
      const result = detectRepoType('project', 'A project', null, ['phaser']);
      expect(result.type).toBe('game');
    });

    it('should detect game when name is "games"', () => {
      const result = detectRepoType('games', 'A project', null, []);
      expect(result.type).toBe('game');
    });

    it('should detect tool by vigil name', () => {
      const result = detectRepoType('vigil', 'A project', null, []);
      expect(result.type).toBe('tool');
    });
  });

  describe('getTypeColor', () => {
    const testCases: Array<[RepoType, string]> = [
      ['web-app', 'bg-blue-900/30 text-blue-300 border-blue-800'],
      ['game', 'bg-purple-900/30 text-purple-300 border-purple-800'],
      ['tool', 'bg-orange-900/30 text-orange-300 border-orange-800'],
      ['library', 'bg-green-900/30 text-green-300 border-green-800'],
      ['bot', 'bg-cyan-900/30 text-cyan-300 border-cyan-800'],
      ['research', 'bg-pink-900/30 text-pink-300 border-pink-800'],
      ['unknown', 'bg-slate-900/30 text-slate-300 border-slate-800'],
    ];

    testCases.forEach(([type, expectedColor]) => {
      it(`should return correct color for ${type}`, () => {
        expect(getTypeColor(type)).toBe(expectedColor);
      });
    });
  });
});
