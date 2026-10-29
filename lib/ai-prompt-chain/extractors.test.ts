import { describe, it, expect } from 'vitest';
import { extractBadges, extractBuildSteps, extractEnvVarMentions } from './extractors';

describe('extractBadges', () => {
  it('extracts badge markdown from readme', () => {
    const readme = `# Project
[![CI](https://badge.url/badge.svg)](https://github.com/actions)
[![Coverage](https://codecov.io/badge.svg)](https://codecov.io)
Some other text`;
    expect(extractBadges(readme)).toHaveLength(2);
  });

  it('returns empty array when no badges', () => {
    expect(extractBadges('# Project\nNo badges here')).toEqual([]);
  });

  it('stays fast on hostile input: 33k repeated badge openers (the unbounded pattern took ~850 ms here)', () => {
    const hostile = '[!['.repeat(33000);
    const start = Date.now();
    expect(extractBadges(hostile)).toEqual([]);
    expect(Date.now() - start).toBeLessThan(400);
  });

  it('still finds badges when a hostile run follows them', () => {
    const readme = `[![CI](https://x.io/a.svg)](https://x.io/ci)\n${'[!['.repeat(30000)}`;
    expect(extractBadges(readme)).toHaveLength(1);
  });
});

describe('extractBuildSteps', () => {
  it('captures lines under Installation section', () => {
    const readme = `# Project
## Installation
npm install
npm run build
## Usage
npm start`;
    const steps = extractBuildSteps(readme);
    expect(steps).toContain('npm install');
    expect(steps).toContain('npm run build');
    expect(steps).not.toContain('npm start');
  });

  it('returns empty string when no matching section', () => {
    const readme = '# Project\n## Overview\nJust a description';
    expect(extractBuildSteps(readme)).toBe('');
  });

  it('captures Getting Started section', () => {
    const readme = `# Project\n## Getting Started\nclone the repo\nrun setup`;
    const steps = extractBuildSteps(readme);
    expect(steps).toContain('clone the repo');
  });

  it('does not capture when heading text appears inline in prose', () => {
    const readme = `# Project\nSee ## setup for info about installation.\n## Overview\nMore text.`;
    const steps = extractBuildSteps(readme);
    expect(steps).toBe('');
  });

  it('does not treat four-space-indented ## line as a heading (code block)', () => {
    const readme = `# Project\n## Installation\nnpm install\n    ## not a heading\nmore steps\n## Usage\nnpm start`;
    const steps = extractBuildSteps(readme);
    expect(steps).toContain('npm install');
    expect(steps).toContain('    ## not a heading');
    expect(steps).toContain('more steps');
    expect(steps).not.toContain('npm start');
  });
});

describe('extractEnvVarMentions', () => {
  it('extracts UPPER_CASE identifiers from readme', () => {
    const readme = `Set DATABASE_URL and API_KEY before running`;
    const vars = extractEnvVarMentions(readme);
    expect(vars).toContain('DATABASE_URL');
    expect(vars).toContain('API_KEY');
  });

  it('extracts process.env.VAR references', () => {
    const readme = 'Use process.env.SECRET_KEY for auth';
    const vars = extractEnvVarMentions(readme);
    expect(vars).toContain('SECRET_KEY');
  });

  it('deduplicates repeated vars', () => {
    const readme = 'API_KEY is needed. Set API_KEY in your environment.';
    const vars = extractEnvVarMentions(readme);
    expect(vars.filter((v) => v === 'API_KEY')).toHaveLength(1);
  });

  it('extracts $VAR dollar-sign syntax', () => {
    const readme = 'Run with $DATABASE_URL set in your shell.';
    const vars = extractEnvVarMentions(readme);
    expect(vars).toContain('DATABASE_URL');
  });

  it('excludes common stopwords to avoid false positives', () => {
    const readme = 'MIT licensed. Uses JSON and HTTP. TODO: add CI.';
    const vars = extractEnvVarMentions(readme);
    expect(vars).not.toContain('TODO');
    expect(vars).not.toContain('MIT');
    expect(vars).not.toContain('API');
    expect(vars).not.toContain('HTTP');
    expect(vars).not.toContain('JSON');
    expect(vars).not.toContain('CI');
  });
});
