/**
 * Shoots the real vigil UI for promo spots: `next dev` serves the app and every
 * /api call is answered from promo/demo-seed.ts (the same DB-free approach as
 * e2e/visual-docs). Writes PNG crops plus capture.json (hook numbers and a
 * get_open_tasks-shaped result) to $PROMO_OUT (default promo/out/capture).
 *
 *   npx playwright test -c promo/playwright.capture.config.ts
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import fs from 'fs';
import { OWNER, REPOS, TASKS, RELATIONSHIPS, DETAIL_REPO, DOCS, PRACTICES, STANDARDS, FIX_PREVIEWS } from './demo-seed';

const OUT = process.env.PROMO_OUT ?? 'promo/out/capture';
const NOW = new Date('2026-09-25T12:00:00Z');
const full = (n: string) => `${OWNER}/${n}`;

const repoRows = REPOS.map((r, i) => ({
    id: r.name, name: r.name, full_name: full(r.name), url: `https://github.com/${full(r.name)}`,
    description: r.description, language: r.language, repo_type: r.type, health_score: r.health,
    homepage: null, topics: [], is_fork: false, is_hidden: false, is_archived: false,
    stars: 3 + i, forks: 1, open_issues: 1, open_prs: r.prs ?? 0, branches_count: 3, contributor_count: 2, bus_factor: 1,
    commit_frequency: '9.5', avg_pr_merge_time_hours: '14.2', token_density: '7.9', comment_to_code_ratio: '0.16',
    total_loc: 12000 + i * 3100, coverage_score: String(60 + (r.health % 30)),
    testing_status: 'healthy', test_case_count: 120 + i * 17, test_describe_count: 30 + i * 4,
    ci_status: r.ci ?? 'passing', last_commit_date: '2026-09-24T00:00:00Z', last_synced: '2026-09-25T00:00:00Z',
    updated_at: '2026-09-25T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
}));

const openTasks = TASKS.map(([repo, title, priority, status]) => ({
    repo, full_name: full(repo), repo_url: `https://github.com/${full(repo)}`,
    title, status: status ?? 'todo', priority, owner: null, section: 'Todo', subsection: null,
}));
const rank = (p: string | null) => (p ? ['P0', 'P1', 'P2', 'P3'].indexOf(p) : 4);

/** Same filter/sort/count contract as lib/task-rollup.ts rollupOpenTasks. */
function rollup(params: URLSearchParams) {
    const pr = params.get('priority')?.split(',');
    const matched = openTasks
        .filter((t) => !pr || pr.includes(t.priority ?? 'none'))
        .sort((a, b) => rank(a.priority) - rank(b.priority) || (a.status === b.status ? 0 : a.status === 'in-progress' ? -1 : 1));
    const by_priority: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0, none: 0 };
    const by_repo: Record<string, number> = {};
    for (const t of matched) { by_priority[t.priority ?? 'none']++; by_repo[t.full_name] = (by_repo[t.full_name] ?? 0) + 1; }
    const limit = Number(params.get('limit') ?? 100);
    return { tasks: matched.slice(0, limit), total: matched.length, truncated: matched.length > limit, by_priority, by_repo };
}

const PMO = {
    repos: repoRows.map((r) => {
        const mine = openTasks.filter((t) => t.repo === r.name);
        return {
            id: r.id, name: r.name, full_name: r.full_name, url: r.url, health_score: r.health_score, ci_status: r.ci_status,
            last_commit_date: r.last_commit_date, open_prs: r.open_prs,
            roadmap: { total: 6, planned: 3, in_progress: 1, in_review: 0, done: 2, stale_count: 0 },
            tasks: { total: mine.length + 2, todo: mine.filter((t) => t.status === 'todo').length, in_progress: mine.filter((t) => t.status === 'in-progress').length, done: 2 },
            in_progress_items: [],
        };
    }),
    portfolio: { repo_count: REPOS.length, roadmap_planned: 30, roadmap_in_progress: 10, roadmap_in_review: 4, roadmap_done: 20, tasks_in_progress: 3, stale_count: 0 },
};

const KINDS = {
    depends_on: 'Source installs or imports target.', calls: 'Source calls target at runtime.', deploys: 'Source deploys target.',
    embeds: 'Source embeds target.', shares_data: 'Both use the same data store.', tracks: 'Source tracks target.',
};
const RELS = {
    kinds: KINDS,
    relationships: RELATIONSHIPS.map(([s, kind, t, context, status], i) => ({
        id: `rel-${i}`, source: full(s), target: full(t), kind, context, evidence: status === 'proposed' ? 'src/config.rs' : null,
        status, origin: status === 'proposed' ? 'agent' : 'manual', created_by: null,
        created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:00Z', confirmed_at: null,
    })),
};

async function mockApi(page: Page): Promise<void> {
    const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    await page.route('**/api/repos?*', (r) => r.fulfill(json(repoRows)));
    await page.route('**/api/repo-details/*/trend', (r) => r.fulfill(json({ success: true, snapshots: [] })));
    await page.route('**/api/repo-details/*', (r) => {
        const name = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop() ?? '');
        const repo = repoRows.find((x) => x.name === name) ?? repoRows[0];
        const rich = repo.name === DETAIL_REPO;
        return r.fulfill(json({
            repo,
            tasks: rich ? openTasks.filter((t) => t.repo === repo.name).map((t, i) => ({ id: `t${i}`, title: t.title, status: t.status, priority: t.priority, section: 'Todo', subsection: null })) : [],
            roadmapItems: rich ? [
                { id: 'r1', title: 'Offline-first sync', quarter: '2026 Q4', status: 'in-progress' },
                { id: 'r2', title: 'Tablet layouts', quarter: '2027 Q1', status: 'planned' },
            ] : [],
            metrics: rich ? [{ name: 'Code Coverage', value: 71.4, unit: '%' }, { name: 'Crash-free sessions', value: 99.2, unit: '%' }] : [],
            features: [],
            docStatuses: (rich ? DOCS : DOCS.map(([d]) => [d, true, 'healthy'] as const)).map(([doc_type, exists, health_state]) => ({ doc_type, exists, health_state })),
            bestPractices: (rich ? PRACTICES : PRACTICES.map(([p]) => [p, 'healthy'] as const)).map(([practice_type, status]) => ({ practice_type, status, details: { exists: status !== 'missing', informational: practice_type === 'visual_docs' } })),
            communityStandards: (rich ? STANDARDS : STANDARDS.map(([c]) => [c, 'healthy'] as const)).map(([standard_type, status]) => ({ standard_type, status, details: {} })),
            securityConfig: null,
        }));
    });
    await page.route('**/api/relationships', (r) => r.fulfill(json(RELS)));
    await page.route('**/api/gemini-status', (r) => r.fulfill(json({ status: 'ok', healthy: true })));
    await page.route('**/api/github-rate-limit', (r) => r.fulfill(json({
        core: { limit: 5000, remaining: 4212, used: 788, reset: '2026-09-25T12:40:00Z' },
        graphql: { limit: 5000, remaining: 4990, used: 10, reset: '2026-09-25T12:40:00Z' },
    })));
    await page.route('**/api/pmo/overview', (r) => r.fulfill(json(PMO)));
    await page.route('**/api/preview-templates', (r) => r.fulfill(json({ previews: FIX_PREVIEWS })));
    await page.route('**/api/pmo/tasks?*', (r) => r.fulfill(json(rollup(new URL(r.request().url()).searchParams))));
}

test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    const value = await encode({
        token: { name: 'Demo', email: 'demo@example.com', sub: 'demo', githubId: '1' },
        secret: process.env.NEXTAUTH_SECRET!, salt: 'authjs.session-token',
    });
    await page.context().addCookies([{ name: 'authjs.session-token', value, domain: 'localhost', path: '/' }]);
    await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('style');
            s.textContent = 'nextjs-portal { display: none !important; } * { animation: none !important; transition: none !important; }';
            document.head.appendChild(s);
        });
    });
});

test('capture', async ({ page }) => {
    fs.mkdirSync(`${OUT}/crops`, { recursive: true });

    // A seeded chat thread (no AI call): the assistant answers and proposes a doc edit.
    await page.addInitScript((t) => window.localStorage.setItem('vigil.repo-chat.v1.demo%40example.com', t), JSON.stringify({
        'docs-site': [
            { id: 'u1', role: 'user', content: 'What should I fix first?', createdAt: NOW.toISOString() },
            {
                id: 'a1', role: 'assistant', createdAt: NOW.toISOString(),
                content: 'Start with the docs: **README.md** still describes the v1 CLI flags, and **ROADMAP.md** has no 2027 quarter. The README is what people read first, so I drafted an update below.',
                proposal: { docType: 'readme', summary: 'Update README.md for the v2 CLI flags and install steps', content: '# docs-site\n' },
            },
        ],
    }));

    await page.goto('/');
    await expect(page.locator('table tbody')).toContainText('storefront', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/crops/dashboard.png`, clip: { x: 0, y: 0, width: 1600, height: 900 } });

    await page.goto('/pmo');
    const grid = page.locator('section[aria-labelledby="repo-work-heading"]');
    await expect(grid.getByRole('article', { name: `${OWNER}/billing` })).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await grid.screenshot({ path: `${OUT}/crops/pmo-p01.png` });
    await grid.getByRole('button', { name: /^P2/ }).click();
    await expect(grid.getByRole('article', { name: `${OWNER}/analytics` })).toBeVisible();
    await page.waitForTimeout(600);
    await grid.screenshot({ path: `${OUT}/crops/pmo-p012.png` });
    const p2 = await grid.getByRole('button', { name: /^P2/ }).boundingBox();
    const gridBox = await grid.boundingBox();

    const rel = page.locator('section[aria-labelledby="relationships-heading"]');
    await rel.scrollIntoViewIfNeeded();
    await expect(rel).toContainText('calls');
    await page.waitForTimeout(600);
    await rel.screenshot({ path: `${OUT}/crops/relationships.png` });

    // Repo details: expand the demo repo's row and shoot the whole panel, plus
    // where each section sits so the video can pan to it and draw callouts.
    await page.goto('/');
    const row = page.locator('table tbody tr', { hasText: REPOS.find((r) => r.name === DETAIL_REPO)!.description });
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.locator('td').nth(1).click();
    await expect(page.getByRole('heading', { name: 'Community Standards' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);

    // Expand every collapsed section so the panel shows everything it checks.
    // A section card is the heading's nearest ancestor with a border (page coordinates).
    const cardRect = (name: string) => page.getByRole('heading', { name, exact: true }).first().evaluate((el) => {
        let n: HTMLElement | null = el as HTMLElement;
        while (n && !(getComputedStyle(n).borderTopWidth !== '0px' && n.getBoundingClientRect().width > 250)) n = n.parentElement;
        const b = (n ?? (el as HTMLElement)).getBoundingClientRect();
        return { x: b.x, y: b.y + window.scrollY, width: b.width, height: b.height };
    });
    for (const name of ['Documentation', 'Best Practices', 'Community Standards', 'Testing', 'Metrics']) {
        const h = page.getByRole('heading', { name, exact: true }).first();
        if (!(await h.count())) continue;
        const before = (await cardRect(name)).height;
        await h.click();
        await page.waitForTimeout(400);
        // Already open (some sections share a toggle)? The click collapsed it: open it again.
        if ((await cardRect(name)).height < before) { await h.click(); await page.waitForTimeout(400); }
    }
    await page.waitForTimeout(800);

    // Whole expanded panel, from the repo row to the next row.
    const rowBox = (await row.boundingBox())!;
    const scrollY = await page.evaluate(() => window.scrollY);
    const panelTop = rowBox.y + scrollY;
    const next = page.locator('table tbody tr', { hasText: 'Customer-facing web shop' });
    const panelBottom = (await next.boundingBox())!.y + scrollY;
    await page.screenshot({ path: `${OUT}/crops/details.png`, fullPage: true, clip: { x: 0, y: panelTop, width: 1600, height: panelBottom - panelTop } });
    const sections: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const name of ['AI Summary', 'Repository Stats', 'Roadmap', 'Tasks', 'Documentation', 'Best Practices', 'Testing', 'Metrics', 'Community Standards']) {
        if (!(await page.getByRole('heading', { name, exact: true }).count())) continue;
        const bb = await cardRect(name);
        sections[name] = { x: bb.x, y: bb.y - panelTop, w: bb.width, h: bb.height };
    }
    const detailsMeta = { width: 1600, height: panelBottom - panelTop, sections };

    // Each checklist card on its own.
    for (const [name, file] of [['Documentation', 'card-docs'], ['Best Practices', 'card-practices'], ['Community Standards', 'card-standards']]) {
        await page.screenshot({ path: `${OUT}/crops/${file}.png`, fullPage: true, clip: await cardRect(name) });
    }

    // One click to fix: Best Practices → Fix All opens the real PR preview.
    const practicesFix = page.getByRole('button', { name: /^Fix All/ }).nth(1); // Documentation, Best Practices, Community Standards
    const practicesRect = await cardRect('Best Practices');
    const fixBox = (await practicesFix.boundingBox())!;
    const fixAll = { x: fixBox.x + fixBox.width / 2 - practicesRect.x, y: fixBox.y + (await page.evaluate(() => window.scrollY)) + fixBox.height / 2 - practicesRect.y };
    await practicesFix.scrollIntoViewIfNeeded();
    await practicesFix.click();
    await expect(page.getByText('.github/dependabot.yml').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/crops/fix-modal.png` });
    const prBox = (await page.getByRole('button', { name: /^Create PR/ }).boundingBox())!;
    const createPr = { x: prBox.x + prBox.width / 2, y: prBox.y + prBox.height / 2 };
    await page.keyboard.press('Escape');

    // Per-repo chat: the slide-in panel with the seeded thread and its proposal card.
    await page.goto('/');
    await expect(page.locator('table tbody')).toContainText('docs-site', { timeout: 60_000 });
    await page.locator('table tbody').getByRole('button', { name: 'Chat about docs-site' }).click();
    const chat = page.getByRole('dialog');
    await expect(chat).toContainText('Update README.md');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/crops/chat.png` });
    const applyBox = (await chat.getByRole('button', { name: /Apply/ }).first().boundingBox())!;
    const chatApply = { x: applyBox.x + applyBox.width / 2, y: applyBox.y + applyBox.height / 2 };
    const panelBox = (await chat.boundingBox())!;
    const chatPanel = { x: panelBox.x, y: panelBox.y, width: panelBox.width, height: panelBox.height };

    const p01 = rollup(new URLSearchParams({ priority: 'P0,P1' }));
    const all = rollup(new URLSearchParams());
    fs.writeFileSync(`${OUT}/capture.json`, JSON.stringify({
        repos: REPOS.map((r) => ({ name: r.name, health: r.health, ci: r.ci ?? 'passing' })),
        hook: { repos: REPOS.length, openTasks: all.total, failingCi: REPOS.filter((r) => r.ci === 'failing').length, p0: all.by_priority.P0 },
        // Relative to the grid crop, in CSS px (crops are 2x).
        details: detailsMeta,
        fixAll, // CSS px inside card-practices.png
        createPr, // CSS px inside fix-modal.png (1600x900 viewport)
        chatApply, // CSS px inside chat.png (1600x900 viewport)
        chatPanel, // the slide-in panel inside chat.png, CSS px
        p2Chip: p2 && gridBox ? { x: p2.x - gridBox.x + p2.width / 2, y: p2.y - gridBox.y + p2.height / 2 } : null,
        mcp: {
            tasks: p01.tasks.slice(0, 4).map((t) => ({ repo: t.repo, title: t.title, status: t.status, priority: t.priority })),
            total: p01.total, by_priority: p01.by_priority,
        },
    }, null, 2));
});
