/**
 * Visual showcase: the three visual elements a repo ships (screenshots,
 * diagrams, videos) plus its GitHub Pages site, checked against FEATURES.md
 * and the promo ledger (promo/spots.json).
 *
 * Contract: https://github.com/nitsuah/.github/blob/main/showcase/STANDARD.md
 *
 * Pure functions only. lib/visual-docs.ts uses the file-list parts for the
 * dashboard; scripts/showcase.ts adds file contents for audit/apply.
 */

export const EXPAND_KIT_URL = 'https://cdn.jsdelivr.net/gh/nitsuah/.github@main/showcase/expand.js';
export const EXPAND_KIT_TAG =
    '<!-- Showcase kit: click-to-expand images, fullscreen button on videos. Spec: https://github.com/nitsuah/.github/blob/main/showcase/STANDARD.md -->\n' +
    `<script src="${EXPAND_KIT_URL}" defer></script>`;
export const DEFAULT_SPOT_SECONDS = 21;

export type AssetState = 'ci' | 'static' | 'missing';
export type VideoState = 'tracked' | 'untracked' | 'missing';
export type PagesState = 'deployed' | 'orphaned' | 'missing';

export interface ShowcaseElements {
    screenshots: AssetState;
    diagrams: AssetState;
    videos: VideoState;
    pages: PagesState;
}

export interface ShowcaseFiles {
    videos: string[];
    pagesHtml: string[];
    pagesWorkflows: string[];
    spotsManifest: string | null;
    strayBragOutput: boolean;
}

const IGNORED = /(^|\/)(node_modules|\.next|\.git|dist|build|coverage|vendor|playwright-report|test-results|out)\//i;
const VIDEO = /\.(mp4|webm|mov)$/i;
const PAGES_HTML = /^(site|pages|showcase|docs|docs\/[^/]+)\/index\.html$/i;
const PAGES_WORKFLOW = /^\.github\/workflows\/[^/]*pages[^/]*\.ya?ml$/i;
export const SPOTS_MANIFEST = 'promo/spots.json';

/**
 * Directories a workflow hands to actions/upload-pages-artifact (its `with: path:`),
 * normalised without `./` or a trailing slash ('' for the repo root). A step
 * without `path:` uploads the action's default, `_site`. Expression paths
 * (`${{ ... }}`) can't be resolved statically and are skipped.
 */
export function pagesUploadPaths(yaml: string): string[] {
    return uploadPagesPathsRaw(yaml).filter(p => !p.includes('${{'));
}

/** The `${{ ... }}` upload paths pagesUploadPaths had to skip, so the audit can say it couldn't follow them. */
export function unresolvedPagesUploads(yaml: string): string[] {
    return uploadPagesPathsRaw(yaml).filter(p => p.includes('${{'));
}

function uploadPagesPathsRaw(yaml: string): string[] {
    const lines = yaml.split(/\r?\n/);
    const indentOf = (l: string) => l.match(/^\s*/)![0].length;
    const out: string[] = [];
    lines.forEach((line, i) => {
        if (!/^\s*(-\s+)?uses:\s*['"]?actions\/upload-pages-artifact@/.test(line)) return;
        // The step is the list item ("- ...") holding this line; it ends at the next line indented no deeper than its dash.
        let start = i;
        while (start > 0 && !/^\s*-\s/.test(lines[start])) start--;
        const dash = indentOf(lines[start]);
        let path = '_site';
        for (let j = start; j < lines.length; j++) {
            const l = lines[j];
            if (j > start && l.trim() && !/^\s*#/.test(l) && indentOf(l) <= dash) break;
            const m = l.match(/^\s*(?:-\s+)?path:\s*['"]?(\$\{\{.*?\}\}|[^'"#\s]+)['"]?/);
            if (m) { path = m[1]; break; }
        }
        out.push(path.replace(/^\.(\/|$)/, '').replace(/\/+$/, ''));
    });
    return [...new Set(out)];
}

/** Repo name from a git remote URL (https or scp-style, with or without .git); null if none. */
export function repoNameFromRemote(url: string): string | null {
    // Backslash too: a local remote can be a Windows path (C:\Users\me\code\vigil).
    const m = url.trim().match(/[/:\\]([^/:\\]+?)(?:\.git)?[/\\]?$/);
    return m ? m[1] : null;
}

/**
 * Pages HTML: the fixed folders (site/, pages/, showcase/, docs/...), plus
 * `<dir>/index.html` for each directory a workflow uploads to Pages. `deep`
 * also takes nested `<dir>/**\/index.html` (apply injects the kit into every page),
 * except for a repo-root upload. An uploaded folder qualifies even if it's out/ (the file walk skips dist/ and build/ entirely).
 */
export function findPagesHtml(fileList: string[], uploadDirs: string[] = [], deep = false): string[] {
    return fileList.filter(f => {
        const uploaded = uploadDirs.some(d => {
            const prefix = d ? `${d}/` : '';
            if (!f.startsWith(prefix)) return false;
            // The upload step names the folder, so it qualifies even when it's out/; build output inside it doesn't.
            const rest = f.slice(prefix.length);
            if (IGNORED.test(rest)) return false;
            if (rest === 'index.html') return true;
            // Never sweep a whole repo uploaded from its root.
            return deep && !!d && rest.endsWith('/index.html');
        });
        return uploaded || (!IGNORED.test(f) && PAGES_HTML.test(f));
    });
}

export function detectShowcaseFiles(fileList: string[], opts: { pagesDirs?: string[] } = {}): ShowcaseFiles {
    const files = fileList.filter(f => !IGNORED.test(f));
    return {
        videos: files.filter(f => VIDEO.test(f)).slice(0, 30),
        // Unfiltered: findPagesHtml applies the ignore list itself, after letting an uploaded out/ through.
        pagesHtml: findPagesHtml(fileList, opts.pagesDirs),
        pagesWorkflows: fileList.filter(f => PAGES_WORKFLOW.test(f)),
        spotsManifest: fileList.includes(SPOTS_MANIFEST) ? SPOTS_MANIFEST : null,
        strayBragOutput: fileList.some(f => /^brag-output(-[^/]*)?\//.test(f)),
    };
}

/** Workflow steps that publish a GitHub Pages site (content check; the file list only sees names). */
// upload-pages-artifact alone only stages the site; deploy-pages publishes it.
export const PAGES_DEPLOY_STEP = /actions\/deploy-pages|peaceiris\/actions-gh-pages|JamesIves\/github-pages-deploy-action/;

/** Drops a line's ` # ...` comment: a `#` at the start or after whitespace, outside single/double quotes. */
function stripLineComment(line: string): string {
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
            if (c === '\\' && quote === '"') i++; // escaped char inside "..."
            else if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
    }
    return line;
}

const stripYamlComments = (yaml: string) => yaml.split(/\r?\n/).map(stripLineComment).join('\n');

/**
 * Each job's block under `jobs:`, so a check can require its signals in the same
 * job. Falls back to the whole file when there's no `jobs:` map.
 */
function jobBlocks(yaml: string): string[] {
    const lines = yaml.split(/\r?\n/);
    const at = lines.findIndex(l => /^\s*jobs:\s*$/.test(l));
    if (at < 0) return [yaml];
    const indentOf = (l: string) => l.match(/^\s*/)![0].length;
    const jobsIndent = indentOf(lines[at]);
    let jobIndent = -1; // indent of the job keys, set by the first one
    const blocks: string[][] = [];
    for (const l of lines.slice(at + 1)) {
        if (!l.trim()) continue;
        const ind = indentOf(l);
        if (ind <= jobsIndent) break; // the jobs map ended
        if (jobIndent < 0) jobIndent = ind;
        if (ind === jobIndent) blocks.push([]);
        blocks[blocks.length - 1]?.push(l);
    }
    return blocks.length ? blocks.map(b => b.join('\n')) : [yaml];
}

/** A step that drives a browser capture: Playwright, a capture-screenshots script, or an npm script named after screenshots. */
const NPM_SCREENSHOT_SCRIPT = /npm\s+run\s+[\w:-]*screenshots?\b/i;
const SCREENSHOT_RUNNER = new RegExp(`playwright\\s+test|capture[-_:]?screenshots?|${NPM_SCREENSHOT_SCRIPT.source}`, 'i');
/**
 * What it captures: a spec or script named after screenshots
 * (tests/e2e/screenshots.spec.mjs, scripts/publish-screenshot-gallery.sh), or a
 * screenshots/ folder the job creates or mounts, or a Playwright visual-docs
 * config (vigil's `playwright.visual-docs.config.ts`), or an npm script named
 * after screenshots (`npm run capture:screenshots`). An artifact *named*
 * "playwright-screenshots" that uploads test-results/ on failure matches none of these.
 */
const SCREENSHOT_TARGET = new RegExp(
    String.raw`[\w./-]*screenshots?[\w.-]*\.(?:m?[jt]s|cjs|sh|py)\b|mkdir\s+(?:-p\s+)?\S*screenshots\b|-v\s+\S*screenshots:|playwright[\w.-]*visual[\w.-]*\.config\.[cm]?[jt]s\b|` +
        NPM_SCREENSHOT_SCRIPT.source,
    'i',
);

/**
 * Content check: the workflow regenerates product screenshots, whatever its
 * file name (ats-fill's ci.yml has a screenshot-gallery job). Uploading
 * Playwright failure screenshots as an artifact does not count.
 */
export function isScreenshotWorkflow(yaml: string): boolean {
    // Runner and target must sit in the same job: a test job plus an unrelated screenshots mount isn't a capture.
    return jobBlocks(stripYamlComments(yaml)).some(j => SCREENSHOT_RUNNER.test(j) && SCREENSHOT_TARGET.test(j));
}

/** Store listing images, promo tiles, or icon/favicon/logo generation. */
const BRAND_ASSETS = /store-assets|promo[-_ ]tiles?|pwa-asset-generator|assets-generator|\b(?:generate|render|build)[-_ ]?(?:icons?|favicons?|logos?|brand(?:ing)?)\b/i;

/** Content check: the workflow generates store/brand assets. Informational only. */
export function isBrandWorkflow(yaml: string): boolean {
    return BRAND_ASSETS.test(stripYamlComments(yaml));
}

/**
 * `automated` is per element: a screenshot workflow doesn't make a static
 * diagram "ci". Pass `manifest` when its contents are known: videos are then
 * `tracked` only if a spot's or reel's `published` path is one of the repo's videos.
 * Without it (dashboard, file list only) a present manifest counts.
 * `pages: 'orphaned'` means no Pages workflow was found, which is unverified:
 * the site may publish from a branch.
 */
export function classifyElements(input: {
    diagrams: string[];
    screenshots: string[];
    automated: { screenshots: boolean; diagrams: boolean };
    files: ShowcaseFiles;
    manifest?: SpotsManifest | null;
}): ShowcaseElements {
    const asset = (list: string[], ci: boolean): AssetState => (list.length === 0 ? 'missing' : ci ? 'ci' : 'static');
    const { files, manifest } = input;
    const videosTracked = manifest === undefined
        ? files.spotsManifest !== null
        : [...(manifest?.spots ?? []), ...(manifest?.reels ?? [])].some(s => !!s.published && files.videos.includes(s.published));
    return {
        screenshots: asset(input.screenshots, input.automated.screenshots),
        diagrams: asset(input.diagrams, input.automated.diagrams),
        videos: files.videos.length === 0 ? 'missing' : videosTracked ? 'tracked' : 'untracked',
        pages: files.pagesHtml.length === 0 ? 'missing' : files.pagesWorkflows.length > 0 ? 'deployed' : 'orphaned',
    };
}

// ---- FEATURES.md -----------------------------------------------------------

export interface Feature {
    id: string;
    title: string;
    category: string;
}

export function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[`*_]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

/** Strips a leading emoji/symbol run ("🧠 Candidate Profile" -> "Candidate Profile"). */
function cleanHeading(h: string): string {
    return h.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/**
 * Not shipped yet, so there's nothing to screenshot: a `[planned]`-style tag or a
 * Planned/Roadmap/Future/Backlog/Ideas/WIP/In-progress heading ("Future-proofing" isn't one).
 */
const UNSHIPPED = /^(planned|roadmap|future|backlog|ideas?|wip|in[- ]progress)(?![\w-])/i;

/**
 * Parses the FEATURES.md convention: `##`/`###` category headings with
 * `- **Name**: description` bullets, optionally prefixed by a `` `[tag]` `` or
 * `[x]`/`[ ]` status. Unchecked boxes, unshipped tags and bullets under an
 * unshipped heading (and its subsections) are skipped, as are bullets without
 * a bold name (prose lists).
 */

export function parseFeatures(md: string): Feature[] {
    const out: Feature[] = [];
    const seen = new Set<string>();
    let category = 'General';
    // Level of the unshipped heading being skipped; its subsections stay skipped until a heading at that level or higher.
    let skipLevel = 0;
    for (const line of md.split(/\r?\n/)) {
        const h = line.match(/^(#{2,4})\s+(.+?)\s*#*\s*$/);
        if (h) {
            const level = h[1].length;
            if (skipLevel && level > skipLevel) continue;
            category = cleanHeading(h[2]);
            skipLevel = UNSHIPPED.test(category) ? level : 0;
            continue;
        }
        if (skipLevel) continue;
        // Optional status tag before the name: `[shipped]`, [x], [ ] (vhs, agent-board style).
        const b = line.match(/^\s{0,3}[-*]\s+(?:`\[([^\]`]*)\]`\s+|\[([ xX])\]\s+)?\*\*(.+?)\*\*\s*[:—–-]?/);
        if (!b) continue;
        if (b[1] !== undefined && UNSHIPPED.test(b[1].trim())) continue;
        if (b[2] === ' ') continue; // unchecked box: not done yet
        const title = b[3].replace(/:$/, '').trim();
        let id = slugify(title);
        if (!id) continue;
        if (seen.has(id)) id = slugify(`${category}-${title}`);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, title, category });
    }
    return out;
}

// ---- promo/spots.json ------------------------------------------------------

export interface SpotsFeature {
    id: string;
    title: string;
    category: string;
    screenshots?: string[];
    spots?: string[];
    visual?: 'none';
}

export interface Spot {
    id: string;
    seconds?: number;
    format?: 'landscape' | 'vertical' | 'square';
    tool?: string;
    features?: string[];
    published?: string | null;
    rendered?: string | null;
}

export interface SpotsManifest {
    product: string;
    live?: string | null;
    page?: string | null;
    pagesDir?: string | null;
    features: SpotsFeature[];
    spots: Spot[];
    reels?: { id: string; spots: string[]; published?: string | null }[];
    brand?: { source?: string | null; derived?: string[]; manual?: { what: string; url: string }[] };
}

/**
 * Builds or updates a manifest from FEATURES.md. Existing entries keep their
 * screenshots/spots; new features are appended; screenshots named after a
 * feature id (docs/screenshots/<id>.png) are linked automatically.
 * Features dropped from FEATURES.md are kept but reported by auditShowcase.
 */
export function scaffoldSpots(input: {
    product: string;
    features: Feature[];
    existing?: SpotsManifest | null;
    screenshots?: string[];
    pagesDir?: string | null;
    page?: string | null;
}): SpotsManifest {
    const base: SpotsManifest = input.existing ?? {
        product: input.product,
        live: null,
        page: input.page ?? null,
        pagesDir: input.pagesDir ?? null,
        features: [],
        spots: [],
        reels: [{ id: 'hero', spots: [], published: null }],
        brand: { source: null, derived: [], manual: [] },
    };
    const byId = new Map(base.features.map(f => [f.id, f]));
    const shots = input.screenshots ?? [];
    for (const f of input.features) {
        const named = shots.filter(s => s.split('/').pop()!.replace(/\.[^.]+$/, '') === f.id);
        const cur = byId.get(f.id);
        if (cur) {
            cur.title = f.title;
            cur.category = f.category;
            for (const s of named) if (!(cur.screenshots ??= []).includes(s)) cur.screenshots.push(s);
        } else {
            const entry: SpotsFeature = { id: f.id, title: f.title, category: f.category, screenshots: named, spots: [] };
            base.features.push(entry);
            byId.set(f.id, entry);
        }
    }
    return base;
}

// ---- audit -----------------------------------------------------------------

export type GapSeverity = 'error' | 'warn' | 'info';
export interface Gap {
    severity: GapSeverity;
    code: string;
    message: string;
}

export interface ShowcaseAuditInput {
    fileList: string[];
    elements: ShowcaseElements;
    files: ShowcaseFiles;
    readme: string | null;
    features: Feature[] | null;
    manifest: SpotsManifest | null;
    /** Contents of each Pages HTML file, keyed by path. */
    pagesHtml: Record<string, string>;
    /** ISO date FEATURES.md last changed, when git history is available. */
    featuresChanged?: string | null;
    /** Workflows that generate store/brand assets (content check). Informational, never a gap. */
    brandWorkflows?: string[];
    /** Things the scan couldn't check (unreadable workflow, unresolvable upload path, no git), reported as info. */
    notes?: { code: string; message: string }[];
}

export interface ShowcaseAudit {
    elements: ShowcaseElements;
    coverage: { features: number; withVisual: number; exempt: number };
    /** Workflows that generate store/brand assets. Not scored. */
    brandAutomation: string[];
    gaps: Gap[];
}

export function hasExpandKit(html: string): boolean {
    return html.includes('/showcase/expand.js');
}

export function injectExpandKit(html: string): string {
    if (hasExpandKit(html)) return html;
    const eol = html.includes('\r\n') ? '\r\n' : '\n';
    const tag = EXPAND_KIT_TAG.replace(/\n/g, eol);
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}${eol}</head>`);
    return `${tag}${eol}${html}`;
}

export function auditShowcase(input: ShowcaseAuditInput): ShowcaseAudit {
    const gaps: Gap[] = [];
    const { elements, files, manifest } = input;
    const add = (severity: GapSeverity, code: string, message: string) => gaps.push({ severity, code, message });

    if (!input.features) add('warn', 'no-features', 'No FEATURES.md (root or docs/), so there is nothing to map visuals to.');
    if (elements.screenshots === 'missing') add('warn', 'no-screenshots', 'No screenshots under a screenshots/ folder. Adopt the visual-docs CI recipe.');
    else if (elements.screenshots === 'static') add('info', 'screenshots-not-ci', 'Screenshots exist but no visual-docs workflow regenerates them.');
    if (elements.diagrams === 'missing') add('info', 'no-diagrams', 'No diagrams. Add docs/diagrams/<name>.mmd if the system has moving parts.');
    if (input.readme !== null && !input.readme.includes('<!-- visual-docs:start -->') && elements.screenshots !== 'missing') {
        add('info', 'no-readme-block', 'README has no visual-docs block, so CI cannot keep its gallery current.');
    }
    if (elements.videos === 'untracked') add('warn', 'videos-untracked', `Videos exist but there's no ${SPOTS_MANIFEST} recording which features they cover.`);
    if (files.strayBragOutput) add('warn', 'stray-brag-output', 'A root brag-output/ folder is committed. Spot sources belong in promo/<spot>/, renders in the Pages assets folder.');
    if (elements.pages === 'orphaned') {
        add('warn', 'pages-orphaned', `Pages HTML (${files.pagesHtml.join(', ')}) but no workflow deploys it. Unless Pages publishes from a branch, the live site never updates.`);
    }

    for (const [path, html] of Object.entries(input.pagesHtml)) {
        if (!hasExpandKit(html)) add('warn', 'no-expand-kit', `${path} is missing the showcase expand kit.`);
        if (/<video\b(?![^>]*\bposter=)[^>]*>/i.test(html)) add('info', 'video-no-poster', `${path} has a <video> without a poster.`);
        if (/<meta[^>]+property="og:image"[^>]+content="(?!https?:)/i.test(html)) add('warn', 'og-relative', `${path} uses a relative og:image, so link previews won't unfurl.`);
    }

    let withVisual = 0, exempt = 0;
    const total = input.features?.length ?? 0;
    if (manifest && input.features) {
        const listed = new Map(manifest.features.map(f => [f.id, f]));
        const spotIds = new Set(manifest.spots.map(s => s.id));
        const fileSet = new Set(input.fileList);
        const missingVisual: string[] = [];
        for (const f of input.features) {
            const m = listed.get(f.id);
            if (!m) { add('warn', 'feature-unlisted', `"${f.title}" is in FEATURES.md but not in ${SPOTS_MANIFEST} (run apply).`); continue; }
            if (m.visual === 'none') { exempt++; continue; }
            let resolved = 0;
            for (const s of m.screenshots ?? []) {
                if (fileSet.has(s)) resolved++;
                else add('warn', 'screenshot-missing-file', `"${f.title}" points at ${s}, which doesn't exist.`);
            }
            for (const s of m.spots ?? []) {
                if (spotIds.has(s)) resolved++;
                else add('warn', 'spot-unknown', `"${f.title}" lists spot "${s}", which isn't in spots[].`);
            }
            if (resolved > 0) withVisual++;
            else missingVisual.push(f.title);
        }
        if (missingVisual.length) {
            add('info', 'feature-no-visual', `${missingVisual.length} feature(s) have no screenshot or spot: ${missingVisual.slice(0, 8).join(', ')}${missingVisual.length > 8 ? ', …' : ''}.`);
        }
        const current = new Set(input.features.map(f => f.id));
        const dropped = manifest.features.filter(f => !current.has(f.id)).map(f => f.title);
        if (dropped.length) add('info', 'feature-dropped', `In ${SPOTS_MANIFEST} but no longer in FEATURES.md: ${dropped.join(', ')}.`);
        for (const s of manifest.spots) {
            if (s.published && !fileSet.has(s.published)) add('warn', 'spot-unpublished', `Spot "${s.id}" says it's published at ${s.published}, which doesn't exist.`);
            if (s.rendered && input.featuresChanged && input.featuresChanged.slice(0, 10) > s.rendered) {
                add('info', 'spot-stale', `Spot "${s.id}" (rendered ${s.rendered}) predates the last FEATURES.md change (${input.featuresChanged.slice(0, 10)}).`);
            }
            if (s.seconds && s.seconds > 35 && s.format !== 'vertical') add('info', 'spot-long', `Spot "${s.id}" is ${s.seconds}s. Split it into ~${DEFAULT_SPOT_SECONDS}s spots and a reel.`);
        }
    } else if (input.features && total > 0) {
        add('warn', 'no-manifest', `No ${SPOTS_MANIFEST}. Run apply to scaffold it from FEATURES.md.`);
    }

    const brandAutomation = input.brandWorkflows ?? [];
    if (brandAutomation.length) add('info', 'brand-automation', `brand automation: ${brandAutomation.join(', ')}`);
    for (const n of input.notes ?? []) add('info', n.code, n.message);

    const order: Record<GapSeverity, number> = { error: 0, warn: 1, info: 2 };
    gaps.sort((a, b) => order[a.severity] - order[b.severity]);
    return { elements, coverage: { features: total, withVisual, exempt }, brandAutomation, gaps };
}
