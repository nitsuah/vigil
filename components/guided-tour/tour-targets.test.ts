// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tourSteps, quickTourSteps } from './tour-steps';

const components = join(process.cwd(), 'components');
const source = readdirSync(components, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
  .map((file) => readFileSync(join(components, file), 'utf8'))
  .join('\n');

describe('tour targets', () => {
  it('are each set by a component', () => {
    const targets = [...tourSteps, ...quickTourSteps].map((step) => step.target).filter((t) => t !== 'header');
    const missing = [...new Set(targets)].filter((t) => !source.includes(t.slice(1, -1)));
    expect(missing).toEqual([]);
  });
});
