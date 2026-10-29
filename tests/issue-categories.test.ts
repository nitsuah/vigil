import { describe, it, expect } from 'vitest';
import { categorizeIssue, countIssuesByCategory, summarizeOpenIssues } from '../lib/issue-categories';
import { SCHEMA_MIGRATIONS } from '../lib/schema-migrations';

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

describe('summarizeOpenIssues', () => {
  it('(a) A scan of three issues plus one pull request returns the same counts as countIssuesByCategory and complete: true', () => {
    const scan = {
      issues: [
        { labels: ['security'], isPullRequest: false },
        { labels: ['bug'], isPullRequest: false },
        { labels: ['feedback'], isPullRequest: false },
        { labels: ['bug'], isPullRequest: true },
      ],
      complete: true,
    };
    const res = summarizeOpenIssues(scan);
    expect(res).toEqual({
      total: 3,
      vulnerability: 1,
      bug: 1,
      feedback: 1,
      other: 0,
      complete: true,
    });
  });

  it('(b) complete: false passes through unchanged', () => {
    const scan = {
      issues: [{ labels: ['bug'], isPullRequest: false }],
      complete: false,
    };
    const res = summarizeOpenIssues(scan);
    expect(res.complete).toBe(false);
  });

  it('(c) An empty scan with complete: false gives total 0, every category 0, and complete: false', () => {
    const scan = {
      issues: [],
      complete: false,
    };
    const res = summarizeOpenIssues(scan);
    expect(res).toEqual({
      total: 0,
      vulnerability: 0,
      bug: 0,
      feedback: 0,
      other: 0,
      complete: false,
    });
  });

  it('(d) migration-safety test', () => {
    const matchStatements = SCHEMA_MIGRATIONS.filter((s) => s.includes('issue_category_counts'));
    expect(matchStatements.length).toBe(1);
    const stmt = matchStatements[0];
    expect(stmt.startsWith('ALTER TABLE repos ADD COLUMN IF NOT EXISTS')).toBe(true);
    expect(stmt.includes('NOT NULL')).toBe(false);
    expect(/DROP|ALTER COLUMN|UPDATE|DELETE/i.test(stmt)).toBe(false);
  });
});