export interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

export const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Vigil',
    description:
      "A quick tour of your repository intelligence dashboard. Use Next to move through it, or Skip tour at any time.",
    target: 'header',
    position: 'bottom',
  },
  {
    id: 'repo-name',
    title: 'Open a Report',
    description:
      'Select a repository row or card, away from its links, to open its health metrics, documentation status and recommendations. The name itself opens GitHub.',
    target: '[data-tour="repo-name"]',
    position: 'right',
  },
  {
    id: 'health-score',
    title: 'Health Score',
    description:
      'Visual indicator of overall repository health. Hover or tap to see the breakdown: Testing (25%), Best Practices (25%), Documentation (20%), Community (10%), Activity (10%), and Security (10%).',
    target: '[data-tour="health-score"]',
    position: 'left',
  },
  {
    id: 'docs-column',
    title: 'Documentation Status',
    description:
      'Track core documentation files. Green = healthy, yellow = dormant, red = missing. Fix missing docs with AI assistance.',
    target: '[data-tour="docs"]',
    position: 'left',
  },
  {
    id: 'actions',
    title: 'Quick Actions',
    description:
      "Sync repository data, check build status, or hide repositories you don't need to track.",
    target: '[data-tour="actions"]',
    position: 'left',
  },
  {
    id: 'issues',
    title: 'Security Issues',
    description:
      'Monitor vulnerability alerts from Dependabot. Shows critical and high severity issues.',
    target: '[data-tour="issues"]',
    position: 'left',
  },
  {
    id: 'add-repo',
    title: 'Add Repository',
    description:
      'Manually add repositories to track. Enter owner/repo format and select the repository type.',
    target: '[data-tour="add-repo"]',
    position: 'bottom',
  },
  {
    id: 'filters',
    title: 'Filter & Search',
    description:
      'Filter repositories by type, language, or fork status.',
    target: '[data-tour="filters"]',
    position: 'bottom',
  },
  {
    id: 'sync-all',
    title: 'Sync All Repositories',
    description: 'Refresh data for all repositories at once. Authentication required for this action.',
    target: '[data-tour="sync-all"]',
    position: 'bottom',
  },
  {
    id: 'auth-status',
    title: 'Authentication Status',
    description:
      "Shows your GitHub authentication status. Green checkmark means you're authenticated and can access private repos.",
      target: '[data-tour="auth-status"]',
      position: 'bottom',
  },
  {
    id: 'gemini-status',
    title: 'AI Status',
    description:
      'Indicates Gemini AI availability. Green means AI-powered features like summaries and auto-fixes are working.',
      target: '[data-tour="gemini-status"]',
      position: 'bottom',
  },
  {
    id: 'version-info',
    title: 'Version Info',
    description: 'Current Vigil version. Useful for debugging and checking for updates.',
      target: '[data-tour="version-info"]',
      position: 'bottom',
  },
  {
    id: 'profile-close',
    title: 'Tour Complete!',
    description:
      'Click your profile picture any time to see your sign-in status, AI availability and version, restart this tour, or sign out.',
      target: '[data-tour="profile-toggle"]',
      position: 'bottom',
  },
  {
    id: 'priority-tasks-card',
    title: 'Priority-First Tasks Card',
    description: 'View and manage high‑priority tasks from TASKS.md with a dedicated card.',
    target: '[data-tour="priority-tasks"]',
    position: 'left',
  },
  {
    id: 'nightly-journeys',
    title: 'Nightly Journeys',
    description: 'Monitor scheduled journeys that run nightly to review progress and updates.',
    target: '[data-tour="nightly-journeys"]',
    position: 'left',
  },
];

const pick = (id: string): TourStep => {
  const step = tourSteps.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown tour step: ${id}`);
  return step;
};

export const quickTourSteps: TourStep[] = [
  pick('welcome'),
  pick('repo-name'),
  pick('health-score'),
  pick('docs-column'),
];