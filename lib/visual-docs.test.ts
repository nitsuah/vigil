import { describe, it, expect } from 'vitest';
import { actionsPrHandoff, detectJourneys, detectVisualDocs, needsActionsPrPermission, visualRows, visualSetup } from './visual-docs';

describe('detectVisualDocs', () => {
    it('is missing when there are no diagrams, screenshots, or mermaid blocks', () => {
        const r = detectVisualDocs(['README.md', 'src/index.ts', 'public/logo.png'], '# Hi');
        expect(r.status).toBe('missing');
        expect(r.details.exists).toBe(false);
    });

    it('is dormant when assets exist but the README shows none of them', () => {
        const r = detectVisualDocs(['docs/diagrams/architecture.mmd', 'docs/diagrams/architecture.svg', 'docs/screenshots/dashboard.png'], '# Hi');
        expect(r.status).toBe('dormant');
        expect(r.details.diagrams).toEqual(['docs/diagrams/architecture.mmd', 'docs/diagrams/architecture.svg']);
        expect(r.details.screenshots).toEqual(['docs/screenshots/dashboard.png']);
        expect(r.details.embedded).toEqual([]);
    });

    it('counts a README embed by path, but static assets stay dormant', () => {
        const r = detectVisualDocs(
            ['docs/screenshots/dashboard.png'],
            '![Dashboard](./docs/screenshots/dashboard.png)',
        );
        expect(r.status).toBe('dormant');
        expect(r.details.embedded).toEqual(['docs/screenshots/dashboard.png']);
    });

    it('detects an inline ```mermaid block (dormant: nothing CI-generated)', () => {
        const r = detectVisualDocs(['README.md'], 'Arch:\n\n```mermaid\ngraph TD; A-->B\n```\n');
        expect(r.status).toBe('dormant');
        expect(r.details.inlineMermaid).toBe(true);
    });

    it('recognises Excalidraw/draw.io renders and ignores test baselines and build output', () => {
        const r = detectVisualDocs([
            'docs/flow.excalidraw',
            'docs/flow.excalidraw.svg',
            'e2e/ui.spec.ts-snapshots/home-chromium.png',
            'src/__snapshots__/x.png',
            'node_modules/pkg/screenshots/a.png',
            'playwright-report/screenshots/b.png',
        ], '');
        expect(r.details.diagrams).toEqual(['docs/flow.excalidraw', 'docs/flow.excalidraw.svg']);
        expect(r.details.screenshots).toEqual([]);
    });

    it('flags automation when a visual-docs workflow exists', () => {
        const r = detectVisualDocs(['.github/workflows/visual-docs.yml', '.github/workflows/ci.yml', 'docs/screenshots/a.png'], '');
        expect(r.details.automated).toBe(true);
        expect(r.details.workflows).toEqual(['.github/workflows/visual-docs.yml']);
    });
});

describe('visual_docs scoring and fixes', () => {
    const ci = ['.github/workflows/visual-docs.yml', 'playwright.visual-docs.config.ts', 'docs/diagrams/arch.mmd', 'docs/diagrams/arch.svg', 'docs/screenshots/dash.png'];

    it('is healthy only when screenshots and diagrams are CI-generated and embedded', () => {
        expect(detectVisualDocs(ci, '![d](docs/screenshots/dash.png) ![a](docs/diagrams/arch.svg)', 'x').status).toBe('healthy');
        // a screenshot embed alone doesn't show the diagram
        expect(detectVisualDocs(ci, '![d](docs/screenshots/dash.png)', 'x').status).toBe('dormant');
        expect(detectVisualDocs(ci, '# no embeds', 'x').status).toBe('dormant');
        // static screenshots, no workflow: partial credit
        expect(detectVisualDocs(['docs/screenshots/dash.png'], '![d](docs/screenshots/dash.png)', 'x').status).toBe('dormant');
    });

    it('offers the recipe PR without a workflow and a /promo handoff with one', () => {
        const none = visualRows('fire', { screenshots: 'missing', diagrams: 'static', videos: 'missing', pages: 'deployed' }, false);
        expect(none.find(r => r.row === 'screenshots')!.fix).toMatchObject({ kind: 'pr', practice: 'visual_docs' });
        expect(none.find(r => r.row === 'diagrams')!.grade).toBe('partial');
        expect(none.find(r => r.row === 'videos')!.fix).toMatchObject({ kind: 'handoff', command: '/promo fire spot <category>' });
        expect(none.find(r => r.row === 'pages')!.fix).toBeNull();
        const wf = visualRows('fire', { screenshots: 'missing', diagrams: 'ci', videos: 'untracked', pages: 'orphaned' }, true);
        expect(wf.find(r => r.row === 'screenshots')!.fix).toMatchObject({ kind: 'handoff', skill: '/promo' });
        expect(wf.find(r => r.row === 'videos')!.fix).toMatchObject({ command: '/promo fire audit' });
        expect(wf.every(r => r.fix?.kind !== 'pr')).toBe(true);
    });

    it('only scores screenshots and diagrams', () => {
        const rows = visualRows('x', { screenshots: 'ci', diagrams: 'ci', videos: 'tracked', pages: 'deployed' }, true);
        expect(rows.filter(r => r.scored).map(r => r.row)).toEqual(['screenshots', 'diagrams']);
        expect(rows.every(r => r.fix === null)).toBe(true);
    });
});

describe('journeys and the Actions PR setting', () => {
    it('detects journeys healthy/dormant/missing', () => {
        expect(detectJourneys(['e2e/journeys/a.spec.ts', '.github/workflows/journeys.yml']).status).toBe('healthy');
        expect(detectJourneys(['tests/journeys/a.spec.ts']).status).toBe('dormant');
        expect(detectJourneys(['src/a.ts']).status).toBe('missing');
    });

    it('needs the setting only for workflows whose bot opens PRs', () => {
        expect(needsActionsPrPermission(['.github/workflows/visual-docs.yml'])).toBe(true);
        expect(needsActionsPrPermission(['.github/workflows/journeys.yml'])).toBe(false);
        expect(needsActionsPrPermission(['.github/workflows/ci.yml'])).toBe(false);
    });

    it('builds the exact gh api handoff', () => {
        expect(actionsPrHandoff('nitsuah/fire')).toMatchObject({
            kind: 'handoff',
            command: 'gh api -X PUT repos/nitsuah/fire/actions/permissions/workflow -F can_approve_pull_request_reviews=true',
        });
    });

    it('summarises a repo for /api/context', () => {
        const vd = detectVisualDocs(['docs/screenshots/a.png'], '![a](docs/screenshots/a.png)', 'x');
        const s = visualSetup([
            { practice_type: 'visual_docs', status: vd.status, details: vd.details },
            { practice_type: 'actions_pr_permission', status: 'missing', details: { exists: false, fix: actionsPrHandoff('o/x') } },
        ]);
        expect(s.status).toBe('dormant');
        expect(s.embedded_in_readme).toBe(true);
        expect(s.rows).toHaveLength(4);
        expect(s.actions_pr_permission?.status).toBe('missing');
        expect(s.journeys).toBeNull();
    });
});
