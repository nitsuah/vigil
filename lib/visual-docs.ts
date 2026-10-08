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
import { classifyElements, detectShowcaseFiles, type ShowcaseElements, type ShowcaseFiles } from '@/lib/showcase';

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
    /** Per-element state (screenshots/diagrams: ci|static|missing), videos and Pages. */
    elements: ShowcaseElements;
    showcase: ShowcaseFiles;
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

const VISUAL_DOCS_PLAYWRIGHT = /(^|\/)playwright[^/]*visual[^/]*\.config\.[cm]?[jt]s$/i;
const PLAYWRIGHT_CONFIG = /(^|\/)playwright[^/]*\.config\.[cm]?[jt]s$/i;
// A spec or script named after screenshots: tests/e2e/screenshots.spec.mjs, scripts/capture-screenshots.mjs.
const SCREENSHOT_CAPTURE_CODE = /(^|\/)[^/]*screenshot[^/]*\.(m?[jt]s|cjs|sh|py)$/i;
const ANY_WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/i;

/** Every detected diagram and screenshot, untruncated (details lists are capped for display). */
export function findVisualAssets(fileList: string[]): { diagrams: string[]; screenshots: string[] } {
    const candidates = fileList.filter(f => !IGNORED_DIRS.test(f) && !TEST_BASELINES.test(f));
    const diagrams = candidates.filter(f => DIAGRAM_SOURCE.test(f) || DIAGRAM_RENDER.test(f) || DIAGRAM_DIR.test(f));
    const screenshots = candidates.filter(f => SCREENSHOT.test(f) && !diagrams.includes(f));
    return { diagrams, screenshots };
}

/**
 * Per-element automation evidence, from file names unless workflow contents
 * are passed (see below). A generic "visual"
 * workflow only counts for an element whose inputs it can rebuild: a
 * Playwright visual-docs config for screenshots, Mermaid sources for diagrams.
 *
 * An in-house pipeline inside a generically named workflow (ats-fill's ci.yml)
 * is inferred from a screenshot-named spec/script plus a Playwright config plus
 * any workflow. When workflow contents are known (the CLI), pass
 * `screenshotWorkflows` (workflows that pass isScreenshotWorkflow) and it
 * alone decides `screenshots`; every file-name rule is ignored for that element.
 */
export function visualAutomation(
    fileList: string[],
    workflows: string[],
    diagrams: string[],
    opts: { screenshotWorkflows?: string[] } = {},
): { screenshots: boolean; diagrams: boolean } {
    const named = (re: RegExp) => workflows.some(w => re.test(w.split('/').pop()!));
    const visual = named(/visual/i);
    const files = fileList.filter(f => !IGNORED_DIRS.test(f));
    const inHouse = opts.screenshotWorkflows
        ? opts.screenshotWorkflows.length > 0
        : files.some(f => SCREENSHOT_CAPTURE_CODE.test(f)) && files.some(f => PLAYWRIGHT_CONFIG.test(f)) && fileList.some(f => ANY_WORKFLOW.test(f));
    return {
        // With workflow contents known (the CLI), only the content check counts; file names are the dashboard's guess.
        screenshots: opts.screenshotWorkflows
            ? inHouse
            : named(/screenshot/i) || (visual && fileList.some(f => VISUAL_DOCS_PLAYWRIGHT.test(f))) || inHouse,
        diagrams: named(/diagram/i) || (visual && diagrams.some(f => /\.(mmd|mermaid)$/i.test(f))),
    };
}

export function detectVisualDocs(fileList: string[], readmeContent?: string | null): { status: HealthState; details: VisualDocsDetails } {
    const { diagrams, screenshots } = findVisualAssets(fileList);
    const workflows = fileList.filter(f => VISUAL_WORKFLOW.test(f));
    const showcase = detectShowcaseFiles(fileList);
    const elements = classifyElements({ diagrams, screenshots, automated: visualAutomation(fileList, workflows, diagrams), files: showcase });

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
            elements,
            showcase,
            informational: true,
        },
    };
}
