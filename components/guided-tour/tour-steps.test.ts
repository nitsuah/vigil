import { describe, it, expect } from 'vitest';
import { tourSteps } from './tour-steps';

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
    // Note: step with id 'sync-all' has a malformed target in source (target: target: ...).
    // The actual runtime value satisfies the pattern; this test asserts the expected format.
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
});