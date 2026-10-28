import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RepoTableRow } from './RepoTableRow';
import type { Repo, RepoDetails } from '@/types/repo';
import type { HealthScoreInputs } from '@/lib/health-score';
import * as healthScoreModule from '@/lib/health-score';
import * as healthScoreInputsModule from '@/lib/health-score-inputs';

// Helper to wrap the row in a table for valid HTML
const renderRow = (props: Parameters<typeof RepoTableRow>[0]): ReturnType<typeof render> => {
  return render(
    <table>
      <tbody>
        <RepoTableRow {...props} />
      </tbody>
    </table>
  );
};

// ── Child-component mocks ─────────────────────────────────────────────────────

vi.mock('@/components/dashboard/repo-row/HealthBreakdown', () => ({
  HealthBreakdown: ({ health }: { health: { grade: string; color: string } }) => (
    <span data-testid="health-breakdown" style={{ color: health.color }}>{health.grade}</span>
  ),
}));

vi.mock('@/components/dashboard/repo-row/HealthShields', () => ({
  HealthShields: () => <span data-testid="health-shields" />,
}));

vi.mock('@/components/dashboard/repo-row/TypeEditor', () => ({
  TypeEditor: () => <span data-testid="type-editor" />,
}));

vi.mock('@/components/dashboard/repo-row/TierEditor', () => ({
  TierEditor: () => <span data-testid="tier-editor" />,
}));

vi.mock('@/components/dashboard/repo-row/repo-row-utils', () => ({
  getTypeIcon: () => null,
}));

// Mock the health score modules
vi.mock('@/lib/health-score', () => ({
  calculateHealthScore: vi.fn(),
}));

vi.mock('@/lib/health-score-inputs', () => ({
  buildHealthScoreInputs: vi.fn(),
}));

const calculateHealthScore = vi.mocked(healthScoreModule.calculateHealthScore);
const buildHealthScoreInputs = vi.mocked(healthScoreInputsModule.buildHealthScoreInputs);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseRepo: Repo = {
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
};

const baseDetails: RepoDetails = {
  tasks: [],
  roadmapItems: [],
  docStatuses: [
    { doc_type: 'readme', exists: true, health_state: 'healthy' },
    { doc_type: 'roadmap', exists: false, health_state: 'missing' },
    { doc_type: 'tasks', exists: false, health_state: 'missing' },
    { doc_type: 'metrics', exists: false, health_state: 'missing' },
    { doc_type: 'features', exists: false, health_state: 'missing' },
  ],
  metrics: [],
  features: [],
  bestPractices: [
    { practice_type: 'testing_framework', status: 'healthy', details: {} },
    { practice_type: 'ci_cd', status: 'healthy', details: {} },
  ],
  communityStandards: [
    { standard_type: 'contributing', status: 'healthy', details: {} },
    { standard_type: 'code_of_conduct', status: 'missing', details: {} },
  ],
  securityConfig: {
    hasSecurityPolicy: true,
    hasSecurityAdvisories: false,
    privateVulnerabilityReportingEnabled: true,
    dependabotAlertsEnabled: true,
    dependabotAlertCount: 0,
    codeScanningEnabled: true,
    codeScanningAlertCount: 0,
    secretScanningEnabled: true,
    secretScanningAlertCount: 0,
  },
};

/** Minimal valid score inputs; the scoring module is mocked so values are irrelevant. */
const emptyInputs: HealthScoreInputs = {
  docHealth: 0,
  hasTests: false,
  bestPracticesCount: 0,
  bestPracticesHealthy: 0,
  communityStandardsCount: 0,
  communityStandardsHealthy: 0,
  hasCI: false,
  lastCommitDays: 0,
  openIssuesCount: 0,
  openPRsCount: 0,
};

/** Create complete default props for RepoTableRow tests. */
function baseProps(
  overrides: Partial<Parameters<typeof RepoTableRow>[0]> = {}
): Parameters<typeof RepoTableRow>[0] {
  return {
    repo: baseRepo,
    details: baseDetails,
    isExpanded: false,
    fixingDoc: false,
    syncingRepo: null,
    generatingSummary: null,
    expandedHealth: false,
    onToggleHealth: vi.fn(),
    expandedDocs: false,
    onToggleDocs: vi.fn(),
    onToggleExpanded: vi.fn(),
    onRemove: vi.fn(),
    onFixAllDocs: vi.fn(),
    onFixDoc: vi.fn(),
    onFixStandard: vi.fn(),
    onFixAllStandards: vi.fn(),
    onFixPractice: vi.fn(),
    onFixAllPractices: vi.fn(),
    onGenerateSummary: vi.fn(),
    onSyncSingleRepo: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

// ── Security health badge tests ────────────────────────────────────────────────

describe('RepoTableRow – security health badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: security score of 85 (green)
    calculateHealthScore.mockReturnValue({
      total: 80,
      documentation: 100,
      testing: 80,
      bestPractices: 100,
      community: 50,
      activity: 90,
      security: 85,
      securityPosture: 100,
      healthProfile: 'production',
    });
    buildHealthScoreInputs.mockReturnValue(emptyInputs);
  });

  it('shows security health percentage when security_last_checked exists and details available', () => {
    renderRow(baseProps());
    const badge = screen.getByText('Sec 85%').closest('span');
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute('aria-label')).toBe('Security health: 85%');
  });

  it('shows green badge for security score >= 80', () => {
    calculateHealthScore.mockReturnValue({
      total: 80,
      documentation: 100,
      testing: 80,
      bestPractices: 100,
      community: 50,
      activity: 90,
      security: 90,
      securityPosture: 100,
      healthProfile: 'production',
    });
    renderRow(baseProps());
    const badge = screen.getByText('Sec 90%').closest('span');
    expect(badge?.className).toContain('bg-green-500/20');
    expect(badge?.className).toContain('text-green-400');
  });

  it('shows yellow badge for security score >= 60 and < 80', () => {
    calculateHealthScore.mockReturnValue({
      total: 80,
      documentation: 100,
      testing: 80,
      bestPractices: 100,
      community: 50,
      activity: 90,
      security: 70,
      securityPosture: 100,
      healthProfile: 'production',
    });
    renderRow(baseProps());
    const badge = screen.getByText('Sec 70%').closest('span');
    expect(badge?.className).toContain('bg-yellow-500/20');
    expect(badge?.className).toContain('text-yellow-400');
  });

  it('shows red badge for security score < 60', () => {
    calculateHealthScore.mockReturnValue({
      total: 80,
      documentation: 100,
      testing: 80,
      bestPractices: 100,
      community: 50,
      activity: 90,
      security: 45,
      securityPosture: 100,
      healthProfile: 'production',
    });
    renderRow(baseProps());
    const badge = screen.getByText('Sec 45%').closest('span');
    expect(badge?.className).toContain('bg-red-500/20');
    expect(badge?.className).toContain('text-red-400');
  });

  it('shows "Sec —" placeholder when security_last_checked is null', () => {
    const repoWithoutSecurityCheck = {
      ...baseRepo,
      security_last_checked: null,
    };
    renderRow(baseProps({ repo: repoWithoutSecurityCheck }));
    const badge = screen.getByText('Sec —').closest('span');
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute('aria-label')).toBe('Security health unavailable (not checked yet)');
  });

  it('does not show security badge when details are not available', () => {
    renderRow(baseProps({ details: undefined }));
    expect(screen.queryByText(/Sec/)).toBeNull();
  });

  it('computes the security score once per render of the row', () => {
    renderRow(baseProps());
    expect(calculateHealthScore).toHaveBeenCalledTimes(1);
    expect(buildHealthScoreInputs).toHaveBeenCalledTimes(1);
  });
});

// ── General rendering tests ──────────────────────────────────────────────────

describe('RepoTableRow – basic rendering', () => {
  it('shows the repo name', () => {
    renderRow(baseProps());
    expect(screen.getByText('my-repo')).toBeTruthy();
  });

  it('shows the health grade letter when details are absent', () => {
    renderRow(baseProps({ details: undefined }));
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('shows HealthBreakdown when details are present', () => {
    renderRow(baseProps());
    expect(screen.getByTestId('health-breakdown')).toBeTruthy();
  });

  it('shows TypeEditor when details are present', () => {
    renderRow(baseProps());
    expect(screen.getByTestId('type-editor')).toBeTruthy();
  });
});

// ── Responsive behavior ──────────────────────────────────────────────────────

describe('RepoTableRow – responsive columns', () => {
  it('renders all table cells', () => {
    renderRow(baseProps());
    // The row renders multiple <td> elements (name, health, docs, metrics, etc.)
    // Verify the structure by checking for multiple td elements
    const tds = screen.getByRole('row').querySelectorAll('td');
    expect(tds.length).toBeGreaterThan(3);
  });
});