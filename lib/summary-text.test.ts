import { describe, it, expect } from 'vitest';
import { finishedSummary } from './summary-text';

describe('finishedSummary', () => {
  it('keeps a finished summary as it is', () => {
    expect(finishedSummary(' A tool. It reads package.json. ')).toBe('A tool. It reads package.json.');
  });
  it('drops an unfinished last sentence', () => {
    expect(finishedSummary('A tool. It targets developers who,')).toBe('A tool.');
  });
  it('does not treat the dots inside a version number as sentence ends', () => {
    expect(finishedSummary('Version v1.2.3')).toBeNull();
    expect(finishedSummary('A tool. Needs Node v22.1')).toBe('A tool.');
  });
  it('does not stop at common initialisms or titles', () => {
    expect(finishedSummary('The tool uses U.S.A. data. It works.')).toBe('The tool uses U.S.A. data. It works.');
    expect(finishedSummary('Dr. Smith built it. Next step.')).toBe('Dr. Smith built it. Next step.');
  });
  it('keeps a last sentence that ends in an abbreviation', () => {
    expect(finishedSummary('A tool. Supports React, Vue, etc.')).toBe('A tool. Supports React, Vue, etc.');
    expect(finishedSummary('A tool. Built for teams in the U.S.')).toBe('A tool. Built for teams in the U.S.');
    expect(finishedSummary('A tool. Built by Dr.')).toBe('A tool.');
  });
  it('rejects text with no finished sentence', () => {
    expect(finishedSummary('A site built with Next.js and,')).toBeNull();
  });
});
