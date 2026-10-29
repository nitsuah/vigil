import { describe, it, expect } from 'vitest';
import { categorizeIssue, countIssuesByCategory } from '../lib/issue-categories';

describe('categorizeIssue', () => {
  it('maps labels to categories case-insensitively', () => {
    expect(categorizeIssue(['Bug'])).toBe('bug');
    expect(categorizeIssue(['enhancement'])).toBe('feedback');
    expect(categorizeIssue(['Security'])).toBe('vulnerability');
    expect(categorizeIssue(['docs'])).toBe('other');
    expect(categorizeIssue([])).toBe('other');
  });

  it('uses vulnerability > bug > feedback when labels overlap', () => {
    expect(categorizeIssue(['bug', 'security'])).toBe('vulnerability');
    expect(categorizeIssue(['enhancement', 'bug'])).toBe('bug');
  });

  it('honours a custom label map', () => {
    const map = { vulnerability: [], bug: ['defect-x'], feedback: [] };
    expect(categorizeIssue(['defect-x'], map)).toBe('bug');
    expect(categorizeIssue(['bug'], map)).toBe('other');
  });
});

describe('countIssuesByCategory', () => {
  it('counts each issue once, skips pull requests, and the total is the sum', () => {
    const counts = countIssuesByCategory([
      { labels: ['bug', 'security'] },
      { labels: ['bug'] },
      { labels: ['enhancement'] },
      { labels: [] },
      { labels: ['bug'], isPullRequest: true },
    ]);
    expect(counts).toEqual({ total: 4, vulnerability: 1, bug: 1, feedback: 1, other: 1 });
  });
});