import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BestPracticesSection } from './BestPracticesSection';

const basePractices = [
  {
    practice_type: 'visual_docs',
    status: 'missing',
    details: { rows: [], elements: { screenshots: 'missing', diagrams: 'missing', videos: 'missing', pages: 'missing' } },
  },
  {
    practice_type: 'actions_pr_permission',
    status: 'missing',
    details: { fix: { kind: 'handoff', command: 'gh api -X PUT /repos/o/x/actions/permissions/workflow -F can_approve_pull_request_reviews=true', inputs: [] } },
  },
];

afterEach(cleanup);

describe('BestPracticesSection nesting actions_pr_permission under visual_docs', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Actions PR permission once nested under visual_docs with fix link', () => {
    const practices = [
      {
        practice_type: 'visual_docs',
        status: 'missing',
        details: { rows: [], elements: { screenshots: 'missing', diagrams: 'missing', videos: 'missing', pages: 'missing' } },
      },
      {
        practice_type: 'actions_pr_permission',
        status: 'missing',
        details: { fix: { kind: 'handoff', command: 'gh api -X PUT /repos/o/x/actions/permissions/workflow -F can_approve_pull_request_reviews=true', inputs: [] } },
      },
    ];

    render(
      <BestPracticesSection
        bestPractices={practices}
        repoName="o/x"
        isAuthenticated={true}
        isExpanded={true}
      />
    );

    // Should find the nested "Actions Pr Permission" under visual_docs (capitalized by getLabel)
    const actionsPrText = screen.getByText('Actions Pr Permission');
    expect(actionsPrText).toBeTruthy();

    // Should have the Fix in Settings link with correct href
    const fixLink = screen.getByRole('link', { name: /Fix in Settings/ });
    expect(fixLink.getAttribute('href')).toBe('https://github.com/o/x/settings/actions');
  });

  it('renders Actions PR permission without Fix link when healthy', () => {
    const practices = [
      {
        practice_type: 'visual_docs',
        status: 'missing',
        details: { rows: [], elements: { screenshots: 'missing', diagrams: 'missing', videos: 'missing', pages: 'missing' } },
      },
      {
        practice_type: 'actions_pr_permission',
        status: 'healthy',
        details: { fix: null },
      },
    ];

    render(
      <BestPracticesSection
        bestPractices={practices}
        repoName="o/x"
        isAuthenticated={true}
        isExpanded={true}
      />
    );

    // Should find the nested "Actions Pr Permission" under visual_docs
    const actionsPrText = screen.getByText('Actions Pr Permission');
    expect(actionsPrText).toBeTruthy();

    // Should NOT have the Fix in Settings link when healthy
    expect(screen.queryByRole('link', { name: /Fix in Settings/ })).toBeNull();
  });

  it('renders Actions PR permission at top-level when no visual_docs row', () => {
    const practices = [
      {
        practice_type: 'actions_pr_permission',
        status: 'missing',
        details: { fix: { kind: 'handoff', command: 'gh api -X PUT /repos/o/x/actions/permissions/workflow -F can_approve_pull_request_reviews=true', inputs: [] } },
      },
    ];

    render(
      <BestPracticesSection
        bestPractices={practices}
        repoName="o/x"
        isAuthenticated={true}
        isExpanded={true}
      />
    );

    // Should find "Actions Pr Permission" at top-level
    const actionsPrText = screen.getByText('Actions Pr Permission');
    expect(actionsPrText).toBeTruthy();

    // Should have the Fix in Settings link
    const fixLink = screen.getByRole('link', { name: /Fix in Settings/ });
    expect(fixLink.getAttribute('href')).toBe('https://github.com/o/x/settings/actions');
  });
});

describe('BestPracticesSection journeys handoff', () => {
  const handoff = {
    kind: 'handoff',
    skill: '/journeys',
    command: '/journeys x',
    inputs: ['repo: ~/code/x', 'add Playwright journeys that write docs/screenshots/<feature-id>.png (docs/VISUAL_DOCS.md)'],
  };

  it('shows the journeys handoff command and inputs under the label when not healthy', () => {
    render(
      <BestPracticesSection
        bestPractices={[
          { practice_type: 'journeys', status: 'missing', details: { exists: false, dirs: [], workflow: null, informational: true, fix: handoff } },
        ]}
        repoName="o/x"
        isAuthenticated={true}
        isExpanded={true}
      />
    );

    expect(screen.getByText('Journeys')).toBeTruthy();
    expect(screen.getByText('/journeys x')).toBeTruthy();
    expect(screen.getByText('repo: ~/code/x')).toBeTruthy();
  });

  it('shows no journeys handoff when healthy, even if a fix is present', () => {
    render(
      <BestPracticesSection
        bestPractices={[
          { practice_type: 'journeys', status: 'healthy', details: { exists: true, dirs: ['e2e/journeys'], workflow: '.github/workflows/journeys.yml', informational: true, fix: handoff } },
        ]}
        repoName="o/x"
        isAuthenticated={true}
        isExpanded={true}
      />
    );

    expect(screen.getByText('Journeys')).toBeTruthy();
    expect(screen.queryByText('/journeys x')).toBeNull();
  });
});
