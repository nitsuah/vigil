import { describe, it, expect } from 'vitest';
import { detectVisualDocs } from './visual-docs';

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

    it('is healthy when the README embeds a detected asset by path', () => {
        const r = detectVisualDocs(
            ['docs/screenshots/dashboard.png'],
            '![Dashboard](./docs/screenshots/dashboard.png)',
        );
        expect(r.status).toBe('healthy');
        expect(r.details.embedded).toEqual(['docs/screenshots/dashboard.png']);
    });

    it('is healthy with an inline ```mermaid block and no files', () => {
        const r = detectVisualDocs(['README.md'], 'Arch:\n\n```mermaid\ngraph TD; A-->B\n```\n');
        expect(r.status).toBe('healthy');
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
