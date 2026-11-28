import { describe, it, expect } from 'vitest';
import { tourSteps, quickTourSteps } from './tour-steps';

describe('tourSteps', () => {
  it('is not empty and first step id is welcome', () => {
    expect(tourSteps.length).toBeGreaterThan(0);
    expect(tourSteps[0].id).toBe('welcome');
  });

  it('every id is unique and matches /^[a-z0-9-]+$/', () => {
    const ids = tourSteps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('title, description and target are non-empty trimmed strings on every step', () => {
    for (const step of tourSteps) {
      expect(typeof step.title).toBe('string');
      expect(step.title.trim()).toBe(step.title);
      expect(step.title.length).toBeGreaterThan(0);

      expect(typeof step.description).toBe('string');
      expect(step.description.trim()).toBe(step.description);
      expect(step.description.length).toBeGreaterThan(0);

      expect(typeof step.target).toBe('string');
      expect(step.target.trim()).toBe(step.target);
      expect(step.target.length).toBeGreaterThan(0);
    }
  });

  it('position is one of the four allowed values', () => {
    const allowed = ['top', 'bottom', 'left', 'right'] as const;
    for (const step of tourSteps) {
      expect(allowed).toContain(step.position);
    }
  });

  it('every target is either exactly "header" or matches /^\[data-tour="[a-z0-9-]+"\]$/', () => {
    const pattern = /^\[data-tour="[a-z0-9-]+"\]$/;
    for (const step of tourSteps) {
      if (step.target === 'header') continue;
      expect(step.target).toMatch(pattern);
    }
  });

  it('no two steps share the same title', () => {
    const titles = tourSteps.map((s) => s.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(titles.length);
  });

  // Two steps may share a target — not asserted as a failure.

  it('has approximately 15 steps (trimmed feature set)', () => {
    expect(tourSteps.length).toBe(15);
  });

  it('includes Priority-First Tasks Card', () => {
    const step = tourSteps.find((s) => s.id === 'priority-tasks-card');
    expect(step).toBeDefined();
    expect(step?.title).toBe('Priority-First Tasks Card');
    expect(step?.target).toBe('[data-tour="priority-tasks"]');
  });

  it('includes Nightly Journeys', () => {
    const step = tourSteps.find((s) => s.id === 'nightly-journeys');
    expect(step).toBeDefined();
    expect(step?.title).toBe('Nightly Journeys');
    expect(step?.target).toBe('[data-tour="nightly-journeys"]');
  });

  it('excludes doc filename entries', () => {
    const docFilenames = ['ROADMAP.md', 'TASKS.md', 'FEATURES.md', 'METRICS.md', 'CHANGELOG.md'];
    for (const filename of docFilenames) {
      const step = tourSteps.find((s) => s.title === filename);
      expect(step).toBeUndefined();
    }
  });

  it('excludes community standard entries', () => {
    const communityFiles = ['CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'SUPPORT.md'];
    for (const filename of communityFiles) {
      const step = tourSteps.find((s) => s.title === filename || s.description.includes(filename));
      expect(step).toBeUndefined();
    }
  });

  it('excludes tech stack entries', () => {
    const techTerms = ['React', 'TypeScript', 'Node.js', 'Next.js', 'Vercel', 'GitHub Actions'];
    for (const term of techTerms) {
      const step = tourSteps.find((s) => s.title === term || s.description.includes(term));
      expect(step).toBeUndefined();
    }
  });
});

describe('quickTourSteps', () => {
  it('starts at welcome and has at most 6 uniquely identified steps', () => {
    expect(quickTourSteps[0].id).toBe('welcome');
    expect(quickTourSteps.length).toBeLessThanOrEqual(6);
    expect(new Set(quickTourSteps.map((s) => s.id)).size).toBe(quickTourSteps.length);
  });
});