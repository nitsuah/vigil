/**
 * Visual showcase audit/apply for local clones. Same rules as the dashboard's
 * visual_docs check, plus the parts that need file contents: FEATURES.md
 * coverage, promo/spots.json drift, and the Pages expand kit.
 *
 *   npm run showcase -- audit [dir...] [--json]
 *   npm run showcase -- audit --root ~/code --scope ~/code/stash/agent/projects/scope.md
 *   npm run showcase -- apply <dir> [--dry-run] [--product NAME]
 *
 * apply is idempotent: it creates or updates promo/spots.json from FEATURES.md
 * and adds the expand kit to Pages HTML. Review the diff and open a PR.
 * Contract: https://github.com/nitsuah/.github/blob/main/showcase/STANDARD.md
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { detectVisualDocs, findVisualAssets, visualAutomation } from '../lib/visual-docs';
import {
    auditShowcase,
    classifyElements,
    detectShowcaseFiles,
    findPagesHtml,
    injectExpandKit,
    isBrandWorkflow,
    isScreenshotWorkflow,
    PAGES_DEPLOY_STEP,
    pagesUploadPaths,
    parseFeatures,
    repoNameFromRemote,
    scaffoldSpots,
    SPOTS_MANIFEST,
    type ShowcaseAudit,
    type SpotsManifest,
} from '../lib/showcase';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'vendor', 'playwright-report', 'test-results', '.turbo', '.venv', 'venv', '__pycache__']);

function listFiles(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string, rel: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name) || (rel === 'promo/' && e.name === 'out')) continue;
                walk(path.join(dir, e.name), `${rel}${e.name}/`);
            } else if (e.isFile()) out.push(`${rel}${e.name}`);
        }
    };
    walk(root, '');
    return out;
}

/** Write via a temp file and rename, so an interrupted run never leaves a truncated file. */
function writeAtomic(file: string, content: string) {
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
}

const read = (root: string, rel: string): string | null => {
    try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; }
};

/**
 * The repo's name from its origin remote, so a clone mounted at /app or /target
 * still reports its real name. Falls back to the directory name.
 */
function repoName(root: string): string {
    try {
        const url = execFileSync('git', ['-c', 'safe.directory=*', '-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const name = repoNameFromRemote(url);
        if (name) return name;
    } catch { /* no git binary (the test image has none), not a checkout, or no origin */ }
    // Without git, read the clone's config directly. A worktree's .git is a file, so this misses those.
    const config = read(root, '.git/config') ?? '';
    const origin = config.match(/\[remote "origin"\][^[]*?^\s*url\s*=\s*(\S+)/m);
    const name = origin ? repoNameFromRemote(origin[1]) : null;
    if (name) return name;
    const dir = path.basename(path.resolve(root));
    // Mounted at /app or /target this is wrong, and a new manifest would keep it, so say so.
    console.warn(`warning: no origin remote found; using directory name "${dir}" as the product (pass --product NAME to override)`);
    return dir;
}

function gitDate(root: string, rel: string): string | null {
    try {
        return execFileSync('git', ['-c', 'safe.directory=*', '-C', root, 'log', '-1', '--format=%cI', '--', rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch { return null; }
}

interface RepoScan {
    name: string;
    root: string;
    fileList: string[];
    featuresPath: string | null;
    audit: ShowcaseAudit;
    manifest: SpotsManifest | null;
    screenshots: string[];
    /** Directories a workflow uploads to Pages (actions/upload-pages-artifact `path:`). */
    pagesDirs: string[];
}

function scan(root: string): RepoScan {
    const fileList = listFiles(root);
    const readme = read(root, 'README.md');
    const vd = detectVisualDocs(fileList, readme);
    const featuresPath = ['FEATURES.md', 'docs/FEATURES.md'].find(p => fileList.includes(p)) ?? null;
    const features = featuresPath ? parseFeatures(read(root, featuresPath) ?? '') : null;
    let manifest: SpotsManifest | null = null;
    const raw = read(root, SPOTS_MANIFEST);
    if (raw) {
        try { manifest = JSON.parse(raw); } catch (e) { throw new Error(`${root}/${SPOTS_MANIFEST} is not valid JSON: ${(e as Error).message}`); }
    }
    // With contents available, any workflow that runs a Pages deploy step counts,
    // whatever its file name, and videos count as tracked only when a spot publishes one.
    // Screenshot automation and the Pages folder likewise come from what a workflow runs.
    const workflowYaml = fileList
        .filter(f => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f))
        .map(f => [f, read(root, f) ?? ''] as const);
    const deploying = workflowYaml.filter(([, y]) => PAGES_DEPLOY_STEP.test(y)).map(([f]) => f);
    const screenshotWorkflows = workflowYaml.filter(([, y]) => isScreenshotWorkflow(y)).map(([f]) => f);
    const brandWorkflows = workflowYaml.filter(([, y]) => isBrandWorkflow(y)).map(([f]) => f);
    const pagesDirs = [...new Set(workflowYaml.flatMap(([, y]) => pagesUploadPaths(y)))];
    const showcase = detectShowcaseFiles(fileList, { pagesDirs });
    const files = { ...showcase, pagesWorkflows: [...new Set([...showcase.pagesWorkflows, ...deploying])] };
    const pagesHtml: Record<string, string> = {};
    for (const p of files.pagesHtml) pagesHtml[p] = read(root, p) ?? '';
    const { diagrams, screenshots } = findVisualAssets(fileList);
    const elements = classifyElements({
        diagrams,
        screenshots,
        automated: visualAutomation(fileList, vd.details.workflows, diagrams, { screenshotWorkflows }),
        files,
        manifest,
    });
    const audit = auditShowcase({
        fileList,
        elements,
        files,
        readme,
        features,
        manifest,
        pagesHtml,
        featuresChanged: featuresPath ? gitDate(root, featuresPath) : null,
        brandWorkflows,
    });
    return { name: path.basename(path.resolve(root)), root, fileList, featuresPath, audit, manifest, screenshots, pagesDirs };
}

/** Repo names from the "Tracked" table in stash's scope.md (first column). */
function scopeRepos(scopePath: string): string[] {
    const md = fs.readFileSync(scopePath, 'utf8');
    const tracked = md.split(/^## /m).find(s => s.startsWith('Tracked')) ?? '';
    return [...tracked.matchAll(/^\|\s*([a-z0-9][\w.-]*)\s*\|/gim)].map(m => m[1]).filter(n => n.toLowerCase() !== 'repo');
}

const ICON: Record<string, string> = { ci: '●', tracked: '●', deployed: '●', static: '◐', untracked: '◐', orphaned: '✖', missing: '·' };

function printTable(scans: RepoScan[]) {
    const head = ['repo', 'screenshots', 'diagrams', 'videos', 'pages', 'features', 'gaps'];
    const rows = scans.map(s => {
        const e = s.audit.elements, c = s.audit.coverage;
        const cell = (v: string) => `${ICON[v] ?? '?'} ${v}`;
        const errs = s.audit.gaps.filter(g => g.severity === 'error').length;
        const warns = s.audit.gaps.filter(g => g.severity === 'warn').length;
        return [s.name, cell(e.screenshots), cell(e.diagrams), cell(e.videos), cell(e.pages),
            c.features ? `${c.withVisual + c.exempt}/${c.features}` : '-', `${errs}E ${warns}W`];
    });
    const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
    const line = (r: string[]) => r.map((v, i) => v.padEnd(w[i])).join('  ');
    console.log(line(head));
    console.log(w.map(n => '-'.repeat(n)).join('  '));
    rows.forEach(r => console.log(line(r)));
}

function printGaps(s: RepoScan) {
    if (!s.audit.gaps.length) { console.log(`\n${s.name}: no gaps`); return; }
    console.log(`\n${s.name}`);
    for (const g of s.audit.gaps) console.log(`  ${g.severity.padEnd(5)} ${g.code.padEnd(24)} ${g.message}`);
}

function apply(root: string, dryRun: boolean, productFlag?: string) {
    const s = scan(root);
    // The table keeps the directory name; a local remote can lag a GitHub rename (ats-fill's still says auto-apply-plugin).
    const product = productFlag ?? repoName(root);
    const changes: string[] = [];
    // Same detection as the audit, plus nested pages under an uploaded Pages folder.
    const pagesHtml = findPagesHtml(s.fileList, s.pagesDirs, true);
    for (const p of pagesHtml) {
        const html = read(root, p)!;
        const next = injectExpandKit(html);
        if (next !== html) {
            changes.push(`${p}: added expand kit`);
            if (!dryRun) writeAtomic(path.join(root, p), next);
        }
    }
    if (s.featuresPath) {
        const features = parseFeatures(read(root, s.featuresPath) ?? '');
        // Prefer the folder a workflow actually uploads (its root, not a nested page's folder) over fixed locations like site/.
        const upload = s.pagesDirs
            // A root upload only owns the top-level index.html (findPagesHtml never sweeps the repo for it).
            .filter(d => pagesHtml.some(p => (d ? p.startsWith(`${d}/`) : p === 'index.html')))
            .sort((a, b) => b.length - a.length)[0];
        const top = [...pagesHtml].sort((a, b) => a.split('/').length - b.split('/').length)[0];
        const pagesDir = upload !== undefined ? upload || '.' : top ? path.posix.dirname(top) : null;
        const before = s.manifest ? JSON.stringify(s.manifest) : null;
        const next = scaffoldSpots({
            product,
            features,
            existing: s.manifest ? structuredClone(s.manifest) : null,
            screenshots: s.screenshots,
            pagesDir,
            page: pagesDir ? `https://nitsuah.github.io/${product}/` : null,
        });
        if (productFlag && next.product !== productFlag) {
            // Also corrects a manifest scaffolded under the wrong name, including the Pages URL derived from it (a custom URL is kept).
            if (next.page === `https://nitsuah.github.io/${next.product}/`) next.page = `https://nitsuah.github.io/${productFlag}/`;
            next.product = productFlag;
        }
        const after = JSON.stringify(next);
        if (after !== before) {
            changes.push(`${SPOTS_MANIFEST}: ${before ? 'updated' : 'created'} (${next.features.length} features)`);
            if (!dryRun) {
                fs.mkdirSync(path.join(root, 'promo'), { recursive: true });
                writeAtomic(path.join(root, SPOTS_MANIFEST), JSON.stringify(next, null, 2) + '\n');
            }
        }
    } else {
        changes.push('skipped promo/spots.json: no FEATURES.md');
    }
    console.log(`${dryRun ? '[dry run] ' : ''}${product}`);
    console.log(changes.length ? changes.map(c => `  ${c}`).join('\n') : '  nothing to change');
}

function main(argv: string[]) {
    const [cmd, ...rest] = argv;
    const flags = new Set(rest.filter(a => a.startsWith('--') && !a.includes('=')));
    const opt = (name: string) => {
        const eq = rest.find(a => a.startsWith(`${name}=`));
        if (eq) return eq.slice(name.length + 1);
        const i = rest.indexOf(name);
        return i >= 0 ? rest[i + 1] : undefined;
    };
    const valueIdx = new Set(['--root', '--scope', '--product'].map(n => rest.indexOf(n) + 1).filter(i => i > 0));
    let dirs = rest.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));

    if (cmd === 'apply') {
        if (dirs.length !== 1) throw new Error('apply takes exactly one repo directory');
        const product = opt('--product');
        const given = rest.some(a => a === '--product' || a.startsWith('--product='));
        if (given && (!product || product.startsWith('-'))) throw new Error('--product needs a name');
        apply(dirs[0], flags.has('--dry-run'), product);
        return;
    }
    if (cmd !== 'audit') {
        console.log('usage: showcase audit [dir...] [--root DIR --scope scope.md] [--json]\n       showcase apply <dir> [--dry-run] [--product NAME]');
        process.exitCode = cmd ? 1 : 0;
        return;
    }
    const root = opt('--root');
    const scope = opt('--scope');
    if (scope) dirs = [...dirs, ...scopeRepos(scope).map(n => path.join(root ?? path.dirname(scope), n))];
    if (!dirs.length) dirs = ['.'];
    const scans: RepoScan[] = [];
    for (const d of dirs) {
        if (!fs.existsSync(d)) {
            console.error(`skip ${d}: not found`);
            process.exitCode = 1; // a passing audit must mean every requested repo was checked
            continue;
        }
        scans.push(scan(d));
    }
    if (flags.has('--json')) {
        console.log(JSON.stringify(scans.map(s => ({ repo: s.name, ...s.audit })), null, 2));
        return;
    }
    printTable(scans);
    scans.forEach(printGaps);
    if (scans.some(s => s.audit.gaps.some(g => g.severity === 'error'))) process.exitCode = 1;
}

try {
    main(process.argv.slice(2));
} catch (e) {
    console.error((e as Error).message);
    process.exitCode = 2;
}
