import { render, screen } from '@testing-library/react';
import { HealthShields } from './HealthShields';
import { Repo, RepoDetails } from '@/types/repo';
import { describe, it, expect, vi } from 'vitest';

// Mock calculateHealthScore to control outputs
vi.mock('@/lib/health-score', () => ({
  calculateHealthScore: vi.fn(),
}));
import { calculateHealthScore } from '@/lib/health-score';

const baseRepo: Repo = {
  id: '1',
  name: 'test-repo',
  full_name: 'test/test-repo',
  repo_type: 'web-app',
  health_profile: 'production',
  ci_status: 'passing',
  security_last_checked: '2026-10-29T00:00:00Z',
  coverage_score: 90,
  last_commit_date: '2026-10-29T00:00:00Z',
  description: null,
  language: null,
  stars: 0,
  forks: 0,
  branches_count: 1,
  url: 'https://github.com/test/test-repo',
  homepage: null,
  topics: [],
  last_synced: '2026-10-29T00:00:00Z',
  is_fork: false,
  tier: null,
  health_score: 0,
  testing_status: undefined,
  ai_summary: undefined,
  open_prs: 0,
  prs_ready_count: 0,
  prs_blocked_count: 0,
  stale_review_count: 0,
  stale_review_pr_numbers: null,
  zombie_branch_count: 0,
  token_density: null,
  comment_to_code_ratio: null,
  open_issues: 0,
  open_issues_count: null,
  stale_issues_count: null,
  issue_category_counts: null,
  readme_last_updated: null,
  total_loc: 0,
  loc_language_breakdown: {},
  test_case_count: 0,
  test_describe_count: 0,
  ci_last_run: null,
  ci_workflow_name: null,
  vuln_alert_count: 0,
  vuln_critical_count: 0,
  vuln_high_count: 0,
  vuln_last_checked: null,
  contributor_count: 0,
  commit_frequency: 0,
  bus_factor: 0,
  avg_pr_merge_time_hours: 0,
  is_hidden: false,
  has_security_policy: false,
  has_security_advisories: false,
  private_vuln_reporting_enabled: false,
  dependabot_alerts_enabled: false,
  dependabot_alert_count: 0,
  code_scanning_enabled: false,
  code_scanning_alert_count: 0,
  secret_scanning_enabled: false,
  secret_scanning_alert_count: 0,
};

const baseDetails: RepoDetails = {
  tasks: [],
  roadmapItems: [],
  docStatuses: [],
  metrics: [],
  features: [],
  bestPractices: [
    { practice_type: 'testing_framework', status: 'healthy', details: {} },
  ],
  communityStandards: [],
};

const mockBreakdown = {
  total: 0,
  documentation: 0,
  testing: 0,
  bestPractices: 0,
  community: 0,
  activity: 0,
  security: 0,
  securityPosture: 0,
  healthProfile: 'production' as const,
};

describe('HealthShields', () => {
  it('displays the calculated security score when checked', () => {
    vi.mocked(calculateHealthScore).mockReturnValue({ ...mockBreakdown, security: 85 });
    render(<HealthShields repo={baseRepo} details={baseDetails} docHealth={null} />);
    const badge = screen.getByText('Sec 85%');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('title')).toBe('Security health: 85%');
  });

  it('displays Sec 0% when security controls are poor', () => {
    vi.mocked(calculateHealthScore).mockReturnValue({ ...mockBreakdown, security: 0 });
    render(<HealthShields repo={baseRepo} details={baseDetails} docHealth={null} />);
    const badge = screen.getByText('Sec 0%');
    expect(badge).toBeTruthy();
  });

  it('displays Sec — when not checked', () => {
    const uncheckedRepo = { ...baseRepo, security_last_checked: null };
    render(<HealthShields repo={uncheckedRepo} details={baseDetails} docHealth={null} />);
    const badge = screen.getByText('Sec —');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('title')).toBe('Security health unavailable (not checked yet)');
  });
});