import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MobileRepoCard } from './MobileRepoCard';
import type { Repo, RepoDetails } from '@/types/repo';

// ── Child-component mocks ─────────────────────────────────────────────────────

vi.mock('@/components/ExpandableRow', () => ({
  default: () => <div data-testid="expandable-row" />,
}));

vi.mock('@/components/dashboard/repo-row/HealthBreakdown', () => ({
  HealthBreakdown: ({ health }: { health: { grade: string } }) => (
    <span data-testid="health-breakdown">{health.grade}</span>
  ),
}));

vi.mock('@/components/dashboard/repo-row/TypeEditor', () => ({
  TypeEditor: () => <span data-testid="type-editor" />,
}));

vi.mock('@/components/dashboard/repo-row/repo-row-utils', () => ({
  getTypeIcon: () => null,
}));

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
};

const baseDetails: RepoDetails = {
  tasks: [],
  roadmapItems: [],
  docStatuses: [
    { doc_type: 'readme',  exists: true,  health_state: 'healthy' },
    { doc_type: 'roadmap', exists: false, health_state: 'missing' },
    { doc_type: 'tasks',   exists: false, health_state: 'missing' },
    { doc_type: 'metrics', exists: false, health_state: 'missing' },
    { doc_type: 'features',exists: false, health_state: 'missing' },
  ],
  metrics: [],
  features: [],
  bestPractices: [],
  communityStandards: [],
};

/** Create complete default props for MobileRepoCard tests. */
function baseProps(
  overrides: Partial<Parameters<typeof MobileRepoCard>[0]> = {}
): Parameters<typeof MobileRepoCard>[0] {
  return {
    repo: baseRepo,
    details: undefined,
    isExpanded: false,
    syncingRepo: null,
    generatingSummary: null,
    isAuthenticated: true,
    onToggleHealth: vi.fn(),
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

// ── Collapsed rendering ───────────────────────────────────────────────────────

describe('MobileRepoCard – collapsed', () => {
  it('shows the repo name', () => {
    render(<MobileRepoCard {...baseProps()} />);
    expect(screen.getByText('my-repo')).toBeTruthy();
  });

  it('shows the health grade letter when details are absent', () => {
    render(<MobileRepoCard {...baseProps()} />);
    // 75 → C on the shared scale (lib/health-grade.ts)
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('does not render the expanded row when isExpanded is false', () => {
    render(<MobileRepoCard {...baseProps()} />);
    expect(screen.queryByTestId('expandable-row')).toBeNull();
  });
});

/** Return the outer expansion element (the one with aria-controls) in the rendered card. */
function getCard(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[aria-controls]')!;
}

// ── Expansion ─────────────────────────────────────────────────────────────────

describe('MobileRepoCard – expansion', () => {
  it('calls onToggleExpanded when the card is clicked', () => {
    const onToggleExpanded = vi.fn();
    const { container } = render(<MobileRepoCard {...baseProps({ onToggleExpanded })} />);
    fireEvent.click(getCard(container));
    expect(onToggleExpanded).toHaveBeenCalledOnce();
  });

  // The expand/collapse control is a real <button> (not a role="button" div
  // with a manual onKeyDown), so Enter/Space activation is a native HTML
  // guarantee rather than application logic — real browsers synthesize a
  // `click` from those keys automatically. jsdom's fireEvent.keyDown does not
  // reproduce that native synthesis, so there's nothing meaningful to assert
  // by firing a bare keydown here; instead we assert the semantic contract
  // that makes keyboard activation guaranteed: it must actually be a button.
  it('renders the expand/collapse control as a native <button>', () => {
    const { container } = render(<MobileRepoCard {...baseProps()} />);
    expect(getCard(container).tagName).toBe('BUTTON');
  });

  it('renders ExpandableRow when isExpanded and details are provided', () => {
    render(<MobileRepoCard {...baseProps({ isExpanded: true, details: baseDetails })} />);
    expect(screen.getByTestId('expandable-row')).toBeTruthy();
  });

  it('does not render ExpandableRow when isExpanded but details absent', () => {
    render(<MobileRepoCard {...baseProps({ isExpanded: true, details: undefined })} />);
    expect(screen.queryByTestId('expandable-row')).toBeNull();
  });

  it('sets aria-expanded to true when expanded', () => {
    const { container } = render(<MobileRepoCard {...baseProps({ isExpanded: true, details: baseDetails })} />);
    expect(getCard(container).getAttribute('aria-expanded')).toBe('true');
  });

  it('sets aria-expanded to false when collapsed', () => {
    const { container } = render(<MobileRepoCard {...baseProps({ isExpanded: false })} />);
    expect(getCard(container).getAttribute('aria-expanded')).toBe('false');
  });

  // Regression test for the nested-interactive a11y anti-pattern (CodeRabbit,
  // PR #204/#215): the expand toggle used to be an ancestor `role="button"`
  // wrapper around the repo-name link, homepage link, etc., which needed
  // `stopPropagation()` on every one of them to avoid double-triggering the
  // toggle. It's now a sibling <button> instead, so a click on the repo-name
  // link structurally cannot bubble into it — no stopPropagation required.
  it('does not call onToggleExpanded when the repo name link is clicked', () => {
    const onToggleExpanded = vi.fn();
    render(<MobileRepoCard {...baseProps({ onToggleExpanded })} />);
    fireEvent.click(screen.getByText('my-repo'));
    expect(onToggleExpanded).not.toHaveBeenCalled();
  });

  it('does not nest the repo name link inside the expand/collapse button', () => {
    const { container } = render(<MobileRepoCard {...baseProps()} />);
    const toggleButton = getCard(container);
    const nameLink = screen.getByText('my-repo');
    expect(toggleButton.contains(nameLink)).toBe(false);
  });
});

// ── Detail-loading skeletons ──────────────────────────────────────────────────

describe('MobileRepoCard – loading state', () => {
  it('shows loading skeleton when details are loading', () => {
    render(<MobileRepoCard {...baseProps({ isLoadingDetails: true })} />);
    expect(screen.getByLabelText('Loading docs')).toBeTruthy();
  });

  it('does not show loading skeleton when details have arrived', () => {
    render(<MobileRepoCard {...baseProps({ details: baseDetails, isLoadingDetails: false })} />);
    expect(screen.queryByLabelText('Loading docs')).toBeNull();
  });

  it('shows HealthBreakdown (not plain grade) when details are present', () => {
    render(<MobileRepoCard {...baseProps({ details: baseDetails })} />);
    expect(screen.getByTestId('health-breakdown')).toBeTruthy();
  });
});

// ── Authenticated actions ─────────────────────────────────────────────────────

describe('MobileRepoCard – authenticated actions', () => {
  it('shows the sync (hold-to-sync) button when authenticated', () => {
    render(<MobileRepoCard {...baseProps({ isAuthenticated: true })} />);
    expect(screen.getByTitle('Hold to sync')).toBeTruthy();
  });

  it('hides the sync button when not authenticated', () => {
    render(<MobileRepoCard {...baseProps({ isAuthenticated: false })} />);
    expect(screen.queryByTitle('Hold to sync')).toBeNull();
  });

  // Mobile/half-width sync is deliberately a long press (not a tap) — the
  // actions row is dense enough that a stray tap shouldn't kick off a
  // background sync. See the onPointerDown/onPointerUp handlers in
  // MobileRepoCard.
  it('does not call onSyncSingleRepo on a plain click', () => {
    const onSyncSingleRepo = vi.fn();
    render(<MobileRepoCard {...baseProps({ onSyncSingleRepo })} />);
    fireEvent.click(screen.getByTitle('Hold to sync'));
    expect(onSyncSingleRepo).not.toHaveBeenCalled();
  });

  it('does not call onSyncSingleRepo on a short press', () => {
    vi.useFakeTimers();
    try {
      const onSyncSingleRepo = vi.fn();
      render(<MobileRepoCard {...baseProps({ onSyncSingleRepo })} />);
      const button = screen.getByTitle('Hold to sync');
      fireEvent.pointerDown(button);
      vi.advanceTimersByTime(200); // well under the ~550ms long-press threshold
      fireEvent.pointerUp(button);
      vi.advanceTimersByTime(1000);
      expect(onSyncSingleRepo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls onSyncSingleRepo after a long press', () => {
    vi.useFakeTimers();
    try {
      const onSyncSingleRepo = vi.fn();
      render(<MobileRepoCard {...baseProps({ onSyncSingleRepo })} />);
      const button = screen.getByTitle('Hold to sync');
      fireEvent.pointerDown(button);
      vi.advanceTimersByTime(600); // past the ~550ms long-press threshold
      expect(onSyncSingleRepo).toHaveBeenCalledOnce();
      fireEvent.pointerUp(button);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows hide button when authenticated', () => {
    render(<MobileRepoCard {...baseProps({ isAuthenticated: true })} />);
    expect(screen.getByTitle('Hide')).toBeTruthy();
  });

  it('hides hide button when not authenticated', () => {
    render(<MobileRepoCard {...baseProps({ isAuthenticated: false })} />);
    expect(screen.queryByTitle('Hide')).toBeNull();
  });

  it('calls onRemove when hide button is clicked', () => {
    const onRemove = vi.fn();
    render(<MobileRepoCard {...baseProps({ onRemove })} />);
    fireEvent.click(screen.getByTitle('Hide'));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('MobileRepoCard – accessibility', () => {
  it('homepage link has an accessible name when homepage is set', () => {
    const repo = { ...baseRepo, homepage: 'https://my-repo.dev' };
    render(<MobileRepoCard {...baseProps({ repo })} />);
    const link = screen.getByRole('link', { name: /visit my-repo homepage/i });
    expect(link.getAttribute('href')).toBe('https://my-repo.dev');
  });

  it('shows restore button (not hide/sync) for hidden repos', () => {
    const repo = { ...baseRepo, is_hidden: true };
    render(<MobileRepoCard {...baseProps({ repo })} />);
    expect(screen.getByText('Restore')).toBeTruthy();
    expect(screen.queryByTitle('Hide')).toBeNull();
    expect(screen.queryByTitle('Sync')).toBeNull();
  });
});
