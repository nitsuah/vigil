import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { RepoTableRow } from './RepoTableRow';
import type { Repo, RepoDetails } from '@/types/repo';
import { calculateHealthScore } from '@/lib/health-score';
import { buildHealthScoreInputs } from '@/lib/health-score-inputs';

// Real scoring and real HealthBreakdown: only unrelated children are stubbed,
// so the inline badge and the popup are checked against the same computation.
vi.mock('@/components/dashboard/repo-row/HealthShields', () => ({
  HealthShields: () => <span data-testid="health-shields" />,
}));
vi.mock('@/components/dashboard/repo-row/TypeEditor', () => ({
  TypeEditor: () => <span data-testid="type-editor" />,
}));
vi.mock('@/components/dashboard/repo-row/TierEditor', () => ({
  TierEditor: () => <span data-testid="tier-editor" />,
}));

afterEach(cleanup);

const repo: Repo = {
  id: '1',
  name: 'my-repo',
  full_name: 'acme/my-repo',
  description: 'A test repo',
  language: 'TypeScript',
  stars: 5,
  forks: 0,
  branches_count: 1,
  url: 'https://github.com/acme/my-repo',
  homepage: null,
  topics: [],
  last_synced: new Date().toISOString(),
  health_score: 75,
  health_profile: 'production',
  repo_type: 'tool',
  security_last_checked: new Date().toISOString(),
  has_security_policy: false,
  dependabot_alerts_enabled: false,
  vuln_critical_count: 1,
};

const details: RepoDetails = {
  tasks: [],
  roadmapItems: [],
  docStatuses: [{ doc_type: 'readme', exists: true, health_state: 'healthy' }],
  metrics: [],
  features: [],
  bestPractices: [],
  communityStandards: [],
};

describe('RepoTableRow – inline security badge vs HealthBreakdown popup', () => {
  it('shows the same security score in the badge and in the popup', () => {
    const expected = calculateHealthScore(
      buildHealthScoreInputs({ ...repo, health_profile: 'production' }, details, Date.now())
    ).security;

    render(
      <table>
        <tbody>
          <RepoTableRow
            repo={repo}
            details={details}
            isExpanded={false}
            fixingDoc={false}
            syncingRepo={null}
            generatingSummary={null}
            expandedHealth={false}
            onToggleHealth={vi.fn()}
            expandedDocs={false}
            onToggleDocs={vi.fn()}
            onToggleExpanded={vi.fn()}
            onRemove={vi.fn()}
            onFixAllDocs={vi.fn()}
            onFixDoc={vi.fn()}
            onFixStandard={vi.fn()}
            onFixAllStandards={vi.fn()}
            onFixPractice={vi.fn()}
            onFixAllPractices={vi.fn()}
            onGenerateSummary={vi.fn()}
            onSyncSingleRepo={vi.fn()}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText(`Sec ${expected}%`)).toBeTruthy();

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Health grade/ }));
    const popup = screen.getByRole('dialog', { name: 'Health breakdown' });
    const row = within(popup).getByText('Security').closest('div.flex.items-center.gap-2');
    expect(row?.textContent).toContain(`${expected}`);
  });
});
