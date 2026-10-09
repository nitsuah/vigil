/**
 * The fictional demo portfolio shared by the DB-free Playwright suites
 * (e2e/visual-docs screenshots and e2e/journeys). Every /api call the UI makes
 * on these screens is mocked here, and the clock is frozen, so output only
 * changes when the UI does.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';

export const NOW = new Date('2026-09-25T12:00:00Z');

const repo = <T extends { name: string; health_score: number }>(over: T) => ({
  id: over.name, full_name: `nitsuah/${over.name}`, url: `https://github.com/nitsuah/${over.name}`,
  homepage: null, topics: [], is_fork: false, is_hidden: false, is_archived: false,
  stars: 4, forks: 1, open_issues: 1, open_prs: 1, branches_count: 3, contributor_count: 1, bus_factor: 1,
  commit_frequency: '9.5', avg_pr_merge_time_hours: '14.2', token_density: '7.9', comment_to_code_ratio: '0.16',
  ci_status: 'passing', last_commit_date: '2026-09-24T00:00:00Z', last_synced: '2026-09-25T00:00:00Z',
  updated_at: '2026-09-25T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
  ...over,
});

export const REPOS = [
  repo({ name: 'vigil', tier: 'T1', description: 'Portfolio health dashboard, PMO, and MCP server', language: 'TypeScript', repo_type: 'web-app', health_score: 92, total_loc: 48210, coverage_score: '81.2' }),
  repo({ name: 'agent-board', tier: 'T2', description: 'Local agent runtime and task board', language: 'Python', repo_type: 'tool', health_score: 78, total_loc: 15320, coverage_score: '64.0' }),
  repo({ name: 'darkmoon', tier: 'T3', description: 'Multiplayer browser game', language: 'TypeScript', repo_type: 'game', health_score: 71, total_loc: 30110, coverage_score: '52.5', ci_status: 'failing' }),
  repo({ name: 'skyview', description: 'Drone services marketplace', language: 'JavaScript', repo_type: 'web-app', health_score: 64, total_loc: 21900, coverage_score: '40.1' }),
];

export const DETAILS = {
  repo: REPOS[0],
  tasks: [
    { id: 't1', title: 'Chat-driven doc editing, stage 3', status: 'todo', section: 'Todo', subsection: 'P2 - Medium' },
    { id: 't2', title: 'Zombie-branch bulk cleanup dialog', status: 'todo', section: 'Todo', subsection: 'P3 - Exploratory' },
  ],
  roadmapItems: [
    { id: 'r1', title: 'AI-assisted roadmap management', quarter: '2027 Q1', status: 'planned' },
    { id: 'r2', title: 'Technical-debt trending', quarter: '2027 Q1', status: 'in-progress' },
  ],
  metrics: [{ name: 'Code Coverage', value: 81.2, unit: '%' }],
  features: [],
  docStatuses: ['readme', 'tasks', 'roadmap', 'features', 'metrics', 'changelog'].map((d) => ({ doc_type: d, exists: true, health_state: 'healthy' })),
  bestPractices: [
    ['branch_protection', 'healthy'], ['ci_cd', 'healthy'], ['gitignore', 'healthy'], ['pre_commit_hooks', 'healthy'],
    ['testing_framework', 'healthy'], ['linting', 'healthy'], ['docker', 'healthy'], ['env_template', 'healthy'],
    ['dependabot', 'healthy'], ['deploy_badge', 'healthy'], ['visual_docs', 'healthy'],
  ].map(([practice_type, status]) => ({ practice_type, status, details: { exists: true, informational: practice_type === 'visual_docs' } })),
  communityStandards: [],
  securityConfig: null,
};

export const PMO = {
  repos: REPOS.map((r, i) => ({
    id: r.id, name: r.name, full_name: r.full_name, url: r.url, health_score: r.health_score, ci_status: r.ci_status,
    last_commit_date: r.last_commit_date, open_prs: r.open_prs,
    roadmap: { total: 6 - i, planned: 3, in_progress: 1, in_review: i % 2, done: 2 - (i % 2), stale_count: i === 2 ? 1 : 0 },
    tasks: { total: 9 - i, todo: 6 - i, in_progress: 1, done: 2 },
    in_progress_items: [{ id: `ip-${i}`, repo_id: r.id, title: ['Technical-debt trending', 'GPU model portfolio', '21st.dev UI pass', 'Marketplace backend live'][i], quarter: '2027 Q1', linked_pr_number: i === 2 ? null : 240 + i, agent_task_id: null }],
  })),
  portfolio: { repo_count: 4, roadmap_planned: 12, roadmap_in_progress: 4, roadmap_in_review: 2, roadmap_done: 6, tasks_in_progress: 4, stale_count: 1 },
};

export const OPEN_TASKS = (() => {
  const t = (name: string, title: string, priority: string | null, status = 'todo') => ({
    repo: name, full_name: `nitsuah/${name}`, repo_url: `https://github.com/nitsuah/${name}`,
    title, status, priority, owner: null, section: 'Todo', subsection: null,
  });
  const tasks = [
    t('skyview', 'Bring the marketplace backend live in production', 'P0'),
    t('skyview', 'Verify production auth/env end-to-end', 'P1', 'in-progress'),
    t('skyview', 'Set up the email sending domain', 'P2'),
    t('darkmoon', 'Open-source safety scrub', 'P1'),
    t('darkmoon', 'UI/UX interactivity improvements', 'P1'),
    t('vigil', 'Durable cross-repo relationship map', 'P1', 'in-progress'),
    t('vigil', 'Chat-driven doc editing, stage 3', 'P2'),
    t('agent-board', 'Wire the board to bb-mcp', 'P3'),
  ];
  const by_priority: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0, none: 0 };
  const by_repo: Record<string, number> = {};
  for (const x of tasks) { by_priority[x.priority ?? 'none']++; by_repo[x.full_name] = (by_repo[x.full_name] ?? 0) + 1; }
  return { tasks, total: tasks.length, truncated: false, by_priority, by_repo };
})();

export const RELATIONSHIPS = (() => {
  const e = (source: string, kind: string, target: string, context: string, status = 'confirmed', evidence: string | null = null) => ({
    id: `${source}-${kind}-${target}`, source: `nitsuah/${source}`, target: `nitsuah/${target}`, kind, context, evidence,
    status, origin: status === 'confirmed' ? 'manual' : 'agent', created_by: null,
    created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:00Z', confirmed_at: null,
  });
  return {
    relationships: [
      e('agent-board', 'calls', 'bb-mcp', 'Posts chat turns to the bb-mcp server over HTTP'),
      e('vigil', 'tracks', 'skyview', 'PMO rollup of TASKS.md and roadmap'),
      e('vigil', 'tracks', 'darkmoon', 'PMO rollup of TASKS.md and roadmap'),
      e('skyview', 'depends_on', 'vigil', 'Reads the visual-docs CI recipe', 'proposed', '.github/workflows/visual-docs.yml'),
    ],
    kinds: { depends_on: 'Source installs or imports target.', calls: 'Source calls target at runtime.', deploys: 'Source deploys target.', embeds: 'Source embeds target.', shares_data: 'Both use the same data store.', tracks: 'Source tracks target.' },
  };
})();

export async function mockApi(target: Page | BrowserContext): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await target.route('**/api/repos?*', (route) => route.fulfill(json(REPOS)));
  await target.route('**/api/repo-details/*/trend?*', (route) => route.fulfill(json({ success: true, snapshots: [] })));
  await target.route('**/api/repo-details/*', (route) => route.fulfill(json(DETAILS)));
  await target.route('**/api/relationships', (route) => route.fulfill(json(RELATIONSHIPS)));
  await target.route('**/api/gemini-status', (route) => route.fulfill(json({ status: 'ok' })));
  await target.route('**/api/github-rate-limit', (route) => route.fulfill(json({ core: { remaining: 5000, limit: 5000, reset: 0 } })));
  await target.route('**/api/pmo/overview', (route) => route.fulfill(json(PMO)));
  await target.route('**/api/pmo/tasks?*', (route) => route.fulfill(json(OPEN_TASKS)));
}

export async function signedInContext(page: Page): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET must be set for the visual-docs server and tests');
  const value = await encode({
    token: { name: 'Demo Owner', email: 'demo@example.com', sub: 'demo-owner' },
    secret,
    salt: 'authjs.session-token',
  });
  await page.context().addCookies([{ name: 'authjs.session-token', value, domain: 'localhost', path: '/' }]);
}

/** Frozen clock, mocked API, and no `next dev` overlay. Call before page.goto. */
export async function prepare(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  // `next dev` renders its dev-tools badge in a <nextjs-portal>; keep it out of screenshots.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.head.appendChild(style);
    });
  });
}
