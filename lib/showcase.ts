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

export function detectShowcaseFiles(fileList: string[]): ShowcaseFiles {
    const files = fileList.filter(f => !IGNORED.test(f));
    return {
        videos: files.filter(f => VIDEO.test(f)).slice(0, 30),
        pagesHtml: files.filter(f => PAGES_HTML.test(f)),
        pagesWorkflows: fileList.filter(f => PAGES_WORKFLOW.test(f)),
        spotsManifest: fileList.includes(SPOTS_MANIFEST) ? SPOTS_MANIFEST : null,
        strayBragOutput: fileList.some(f => /^brag-output(-[^/]*)?\//.test(f)),
    };
}

/** Workflow steps that publish a GitHub Pages site (content check; the file list only sees names). */
// upload-pages-artifact alone only stages the site; deploy-pages publishes it.
export const PAGES_DEPLOY_STEP = /actions\/deploy-pages|peaceiris\/actions-gh-pages|JamesIves\/github-pages-deploy-action/;

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
 * Parses the FEATURES.md convention: `##`/`###` category headings with
 * `- **Name**: description` bullets. Bullets without a bold name are skipped
 * (prose lists), and so are headings before the first bullet-bearing one.
 */
export function parseFeatures(md: string): Feature[] {
    const out: Feature[] = [];
    const seen = new Set<string>();
    let category = 'General';
    for (const line of md.split(/\r?\n/)) {
        const h = line.match(/^#{2,4}\s+(.+?)\s*#*\s*$/);
        if (h) {
            category = cleanHeading(h[1]);
            continue;
        }
        const b = line.match(/^\s{0,3}[-*]\s+\*\*(.+?)\*\*\s*[:—–-]?/);
        if (!b) continue;
        const title = b[1].replace(/:$/, '').trim();
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
}

export interface ShowcaseAudit {
    elements: ShowcaseElements;
    coverage: { features: number; withVisual: number; exempt: number };
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

    const order: Record<GapSeverity, number> = { error: 0, warn: 1, info: 2 };
    gaps.sort((a, b) => order[a.severity] - order[b.severity]);
    return { elements, coverage: { features: total, withVisual, exempt }, gaps };
}
