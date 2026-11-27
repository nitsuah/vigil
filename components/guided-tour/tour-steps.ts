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
      "A quick tour of your repository intelligence dashboard. We'll walk through the key features automatically. Click Skip Tour anytime to exit.",
    target: 'header',
    position: 'bottom',
  },
  {
    id: 'repo-name',
    title: 'Repository Name',
    description:
      'Click any repository name to expand and view detailed health metrics, documentation status, and recommendations.',
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
    id: 'features',
    title: 'Features Section',
    description: 'View parsed features from your FEATURES.md file. Track what your project offers.',
    target: '[data-tour="features-section"]',
    position: 'left',
  },
  {
    id: 'roadmap',
    title: 'Roadmap Section',
    description:
      'Monitor project roadmap items parsed from ROADMAP.md. Track progress and upcoming work.',
    target: '[data-tour="roadmap-section"]',
    position: 'left',
  },
  {
    id: 'tasks',
    title: 'Tasks Section',
    description: 'View and manage tasks from TASKS.md. Track high-priority items and subsections.',
    target: '[data-tour="tasks-section"]',
    position: 'left',
  },
  {
    id: 'documentation',
    title: 'Documentation',
    description:
      'Track core documentation files: README, ROADMAP, TASKS, METRICS, and FEATURES. Fix missing docs with AI.',
    target: '[data-tour="documentation"]',
    position: 'left',
  },
  {
    id: 'best-practices',
    title: 'Best Practices',
    description:
      'Monitor development practices: CI/CD, testing, linting, Dependabot, Docker, and deployment badges.',
    target: '[data-tour="best-practices"]',
    position: 'left',
  },
  {
    id: 'testing',
    title: 'Testing',
    description:
      "View test coverage, test counts, and testing infrastructure. Track your project's test quality.",
    target: '[data-tour="testing"]',
    position: 'left',
  },
  {
    id: 'community',
    title: 'Community Standards',
    description:
      'Monitor community health files: CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, LICENSE, and templates.',
    target: '[data-tour="community"]',
    position: 'left',
  },
  {
    id: 'metrics',
    title: 'Custom Metrics',
    description:
      'Track custom repository metrics from METRICS.md. Self-reported data for project-specific measurements.',
    target: '[data-tour="metrics"]',
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
];
