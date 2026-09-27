/**
 * Visual-docs best practice: does the repo ship architecture diagrams and app
 * screenshots, and does its README actually show them?
 *
 * The recipe (docs/VISUAL_DOCS.md, templates/visual-docs/) has CI regenerate
 * diagrams and screenshots and rewrite a marked README block, so "embedded in
 * the README" is the signal that they are wired up rather than left to rot.
 *
 * Informational for now: excluded from the health score (see
 * INFORMATIONAL_PRACTICES) until the recipe has been rolled out across repos.
 */

import type { HealthState } from '@/lib/best-practices';

export const VISUAL_DOCS_PRACTICE = 'visual_docs';

/** Practice types shown in the UI but not counted in the health score. */
export const INFORMATIONAL_PRACTICES: readonly string[] = [VISUAL_DOCS_PRACTICE];

export interface VisualDocsDetails {
    exists: boolean;
    diagrams: string[];
    screenshots: string[];
    /** A ```mermaid block in the README (renders natively on GitHub). */
    inlineMermaid: boolean;
    /** Detected asset paths the README references by path or file name. */
    embedded: string[];
    /** A workflow whose file name suggests it regenerates these assets. */
    automated: boolean;
    workflows: string[];
    informational: true;
    [key: string]: unknown;
}

const IGNORED_DIRS = /(^|\/)(node_modules|\.next|dist|build|coverage|vendor|playwright-report|test-results)\//i;
// Playwright visual-regression baselines and Jest snapshots are test fixtures, not docs.
const TEST_BASELINES = /(^|\/)(__snapshots__|__image_snapshots__)\/|-snapshots\//i;

const DIAGRAM_SOURCE = /\.(mmd|mermaid|excalidraw|drawio|puml|plantuml|d2)$/i;
const DIAGRAM_RENDER = /\.excalidraw\.(svg|png)$|\.drawio\.(svg|png)$/i;
const DIAGRAM_DIR = /(^|\/)(diagrams?|architecture)\/[^/]+\.(svg|png|jpe?g|webp)$/i;
const SCREENSHOT = /(^|\/)(screenshots?|screens)\/[^/]+\.(png|jpe?g|webp|gif)$/i;
const VISUAL_WORKFLOW = /^\.github\/workflows\/[^/]*(screenshot|diagram|visual)[^/]*\.ya?ml$/i;

export function detectVisualDocs(fileList: string[], readmeContent?: string | null): { status: HealthState; details: VisualDocsDetails } {
    const candidates = fileList.filter(f => !IGNORED_DIRS.test(f) && !TEST_BASELINES.test(f));
    const diagrams = candidates.filter(f => DIAGRAM_SOURCE.test(f) || DIAGRAM_RENDER.test(f) || DIAGRAM_DIR.test(f));
    const screenshots = candidates.filter(f => SCREENSHOT.test(f) && !diagrams.includes(f));
    const workflows = fileList.filter(f => VISUAL_WORKFLOW.test(f));

    const readme = readmeContent ?? '';
    const inlineMermaid = /^\s*```mermaid\b/m.test(readme);
    // Source files (.mmd, .excalidraw) aren't embeddable; a README links the render.
    const embeddable = [...diagrams, ...screenshots].filter(f => /\.(svg|png|jpe?g|webp|gif)$/i.test(f));
    const embedded = embeddable.filter(f => {
        const base = f.split('/').pop()!;
        return readme.includes(f) || readme.includes(encodeURI(f)) || readme.includes(`/${base}`) || readme.includes(`(${base}`);
    });

    const hasAssets = diagrams.length > 0 || screenshots.length > 0 || inlineMermaid;
    const status: HealthState = !hasAssets ? 'missing'
        : embedded.length > 0 || inlineMermaid ? 'healthy'
        : 'dormant';

    return {
        status,
        details: {
            exists: hasAssets,
            diagrams: diagrams.slice(0, 20),
            screenshots: screenshots.slice(0, 20),
            inlineMermaid,
            embedded: embedded.slice(0, 20),
            automated: workflows.length > 0,
            workflows,
            informational: true,
        },
    };
}
