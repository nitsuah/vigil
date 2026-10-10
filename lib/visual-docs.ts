/**
 * Visual-docs best practice: does the repo ship architecture diagrams and app
 * screenshots, and does its README actually show them?
 *
 * The recipe (docs/VISUAL_DOCS.md, templates/visual-docs/) has CI regenerate
 * diagrams and screenshots and rewrite a marked README block, so "embedded in
 * the README" is the signal that they are wired up rather than left to rot.
 *
 * Scored since 2026-10-09 (one best practice, same weight as the others):
 * healthy needs CI-generated screenshots and diagrams embedded in the README.
 * Videos and Pages are graded per row but not scored, because the file list
 * alone can't verify them. Rows that need a skill run (video, Pages) get a
 * handoff, not a fix PR: see visualRows().
 */

import type { HealthState } from '@/lib/best-practices';
import { classifyElements, detectShowcaseFiles, type AssetState, type ShowcaseElements, type ShowcaseFiles } from '@/lib/showcase';

export const VISUAL_DOCS_PRACTICE = 'visual_docs';
export const JOURNEYS_PRACTICE = 'journeys';
export const ACTIONS_PR_PRACTICE = 'actions_pr_permission';

/** Practice types shown in the UI but not counted in the health score. */
export const INFORMATIONAL_PRACTICES: readonly string[] = [JOURNEYS_PRACTICE];

export type RowGrade = 'pass' | 'partial' | 'fail';
/** How a row gets fixed: a PR vigil opens itself, or a handoff the user (or an agent) runs. */
export type RowFix =
    | { kind: 'pr'; practice: string; label: string }
    | { kind: 'handoff'; skill?: string; command: string; inputs: string[] };
export interface VisualRow {
    row: 'screenshots' | 'diagrams' | 'videos' | 'pages';
    state: string;
    grade: RowGrade;
    scored: boolean;
    fix: RowFix | null;
}

const repoPath = (repo: string) => `~/code/${repo}`;

/**
 * Per-row grade and fix. Screenshots and diagrams are CI's job: a repo without
 * a visual-docs workflow gets the recipe PR; one that has the workflow but no
 * output gets a /promo handoff (a spec or .mmd needs writing). Videos and
 * Pages always need a skill run, so they only ever get a handoff.
 */
export function visualRows(repo: string, elements: ShowcaseElements, hasVisualWorkflow: boolean): VisualRow[] {
    const asset = (s: AssetState): RowGrade => (s === 'ci' ? 'pass' : s === 'static' ? 'partial' : 'fail');
    const ciFix = (what: string): RowFix =>
        hasVisualWorkflow
            ? { kind: 'handoff', skill: '/promo', command: `/promo ${repo} refresh`, inputs: [`repo: ${repoPath(repo)}`, `add ${what} (docs/VISUAL_DOCS.md)`] }
            : { kind: 'pr', practice: VISUAL_DOCS_PRACTICE, label: 'Open visual-docs CI recipe PR' };
    const rows: VisualRow[] = [
        { row: 'screenshots', state: elements.screenshots, grade: asset(elements.screenshots), scored: true, fix: null },
        { row: 'diagrams', state: elements.diagrams, grade: asset(elements.diagrams), scored: true, fix: null },
        { row: 'videos', state: elements.videos, scored: false, grade: elements.videos === 'tracked' ? 'pass' : elements.videos === 'untracked' ? 'partial' : 'fail', fix: null },
        { row: 'pages', state: elements.pages, scored: false, grade: elements.pages === 'deployed' ? 'pass' : elements.pages === 'orphaned' ? 'partial' : 'fail', fix: null },
    ];
    for (const r of rows) {
        if (r.grade === 'pass') continue;
        if (r.row === 'screenshots') r.fix = ciFix('Playwright specs that write docs/screenshots/<feature-id>.png');
        else if (r.row === 'diagrams') r.fix = ciFix('docs/diagrams/<name>.mmd sources');
        else if (r.row === 'videos') {
            r.fix = elements.videos === 'untracked'
                ? { kind: 'handoff', skill: '/promo', command: `/promo ${repo} audit`, inputs: [`repo: ${repoPath(repo)}`, 'no promo/spots.json yet: the first run scaffolds it from FEATURES.md'] }
                : { kind: 'handoff', skill: '/promo', command: `/promo ${repo} spot <category>`, inputs: [`repo: ${repoPath(repo)}`, 'FEATURES.md (one spot per category)', 'deployed or Pages URL for the outro', 'a fictional demo seed, never real accounts'] };
        } else {
            r.fix = { kind: 'handoff', skill: '/promo', command: `/promo ${repo} publish`, inputs: [`repo: ${repoPath(repo)}`, elements.pages === 'orphaned' ? 'a .github/workflows/pages.yml that deploys the site folder' : 'site/ from nitsuah/.github showcase/templates/page-skeleton.html'] };
        }
    }
    return rows;
}

/** Handoff for "Allow GitHub Actions to create and approve pull requests" (needs repo admin). */
export function actionsPrHandoff(fullName: string): RowFix {
    return {
        kind: 'handoff',
        // Only the PR flag: omitting default_workflow_permissions leaves the repo's current default as it is.
        command: `gh api -X PUT repos/${fullName}/actions/permissions/workflow -F can_approve_pull_request_reviews=true`,
        inputs: ['or Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests"'],
    };
}

/**
 * A workflow whose bot opens PRs (the visual-docs recipe), so it needs the Actions PR setting.
 * Journeys only files issues, which the setting doesn't govern.
 */
export function needsActionsPrPermission(fileList: string[]): boolean {
    return fileList.some(f => /^\.github\/workflows\/[^/]*(visual|screenshot|diagram)[^/]*\.ya?ml$/i.test(f));
}

/**
 * Nightly journeys (nitsuah/.github journeys/STANDARD.md), from the file list:
 * healthy = a journeys workflow plus tests/journeys/ or e2e/journeys/,
 * dormant = journeys without the nightly, missing = neither. Informational.
 */
export function detectJourneys(fileList: string[]): { status: HealthState; details: { exists: boolean; dirs: string[]; workflow: string | null; informational: true } } {
    const dirs = [...new Set(fileList.map(f => f.match(/^((?:tests|e2e)\/journeys)\//)?.[1]).filter((d): d is string => !!d))];
    const workflow = fileList.find(f => /^\.github\/workflows\/[^/]*journeys[^/]*\.ya?ml$/i.test(f)) ?? null;
    const status: HealthState = dirs.length && workflow ? 'healthy' : dirs.length ? 'dormant' : 'missing';
    return { status, details: { exists: dirs.length > 0, dirs, workflow, informational: true } };
}

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
    /** Per-row grade and fix PR or handoff. */
    rows: VisualRow[];
    showcase: ShowcaseFiles;
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

export function detectVisualDocs(fileList: string[], readmeContent?: string | null, repo = '<repo>'): { status: HealthState; details: VisualDocsDetails } {
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
    // Healthy = CI regenerates both and the README shows them; anything less is partial (dormant).
    // Each scored type has to be visible: a screenshot embed doesn't cover the diagram.
    const shotShown = embedded.some(f => screenshots.includes(f));
    const diagramShown = inlineMermaid || embedded.some(f => diagrams.includes(f));
    const status: HealthState = !hasAssets ? 'missing'
        : shotShown && diagramShown && elements.screenshots === 'ci' && elements.diagrams === 'ci' ? 'healthy'
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
            rows: visualRows(repo, elements, workflows.length > 0),
            showcase,
        },
    };
}

export interface VisualSetupRow { practice_type: string; status: string; details?: unknown }

/**
 * Per-repo visual setup for /api/context (stash's SOTU "Visual setup" table):
 * the visual_docs status, each row's state/grade/fix, the Actions PR setting
 * (null = not needed or unreadable) and journeys.
 */
export function visualSetup(rows: VisualSetupRow[]) {
    const get = (t: string) => rows.find(r => r.practice_type === t);
    const vd = get(VISUAL_DOCS_PRACTICE);
    const d = (vd?.details ?? {}) as Partial<VisualDocsDetails>;
    const actions = get(ACTIONS_PR_PRACTICE);
    const journeys = get(JOURNEYS_PRACTICE);
    return {
        status: vd?.status ?? 'unknown',
        scored: true,
        rows: d.rows ?? [],
        elements: d.elements ?? null,
        embedded_in_readme: (d.embedded?.length ?? 0) > 0 || !!d.inlineMermaid,
        actions_pr_permission: actions ? { status: actions.status, fix: (actions.details as { fix?: RowFix | null } | undefined)?.fix ?? null } : null,
        journeys: journeys ? { status: journeys.status, informational: true } : null,
    };
}

export const VISUAL_SETUP_PRACTICES = [VISUAL_DOCS_PRACTICE, ACTIONS_PR_PRACTICE, JOURNEYS_PRACTICE];
