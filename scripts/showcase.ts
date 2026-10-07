/**
 * Visual showcase audit/apply for local clones. Same rules as the dashboard's
 * visual_docs check, plus the parts that need file contents: FEATURES.md
 * coverage, promo/spots.json drift, and the Pages expand kit.
 *
 *   npm run showcase -- audit [dir...] [--json]
 *   npm run showcase -- audit --root ~/code --scope ~/code/stash/agent/projects/scope.md
 *   npm run showcase -- apply <dir> [--dry-run]
 *
 * apply is idempotent: it creates or updates promo/spots.json from FEATURES.md
 * and adds the expand kit to Pages HTML. Review the diff and open a PR.
 * Contract: https://github.com/nitsuah/.github/blob/main/showcase/STANDARD.md
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { detectVisualDocs } from '../lib/visual-docs';
import {
    auditShowcase,
    injectExpandKit,
    parseFeatures,
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

const read = (root: string, rel: string): string | null => {
    try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; }
};

function gitDate(root: string, rel: string): string | null {
    try {
        return execFileSync('git', ['-C', root, 'log', '-1', '--format=%cI', '--', rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
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
    const pagesHtml: Record<string, string> = {};
    for (const p of vd.details.showcase.pagesHtml) pagesHtml[p] = read(root, p) ?? '';
    const audit = auditShowcase({
        fileList,
        elements: vd.details.elements,
        files: vd.details.showcase,
        readme,
        features,
        manifest,
        pagesHtml,
        featuresChanged: featuresPath ? gitDate(root, featuresPath) : null,
    });
    return { name: path.basename(path.resolve(root)), root, fileList, featuresPath, audit, manifest, screenshots: vd.details.screenshots };
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

function apply(root: string, dryRun: boolean) {
    const s = scan(root);
    const changes: string[] = [];
    const pagesHtml = s.fileList.filter(f => /^(site|pages|showcase|docs|docs\/[^/]+)\/index\.html$/i.test(f));
    for (const p of pagesHtml) {
        const html = read(root, p)!;
        const next = injectExpandKit(html);
        if (next !== html) {
            changes.push(`${p}: added expand kit`);
            if (!dryRun) fs.writeFileSync(path.join(root, p), next);
        }
    }
    if (s.featuresPath) {
        const features = parseFeatures(read(root, s.featuresPath) ?? '');
        const pagesDir = pagesHtml[0] ? path.posix.dirname(pagesHtml[0]) : null;
        const before = s.manifest ? JSON.stringify(s.manifest) : null;
        const next = scaffoldSpots({
            product: s.name,
            features,
            existing: s.manifest ? structuredClone(s.manifest) : null,
            screenshots: s.screenshots,
            pagesDir,
            page: pagesDir ? `https://nitsuah.github.io/${s.name}/` : null,
        });
        const after = JSON.stringify(next);
        if (after !== before) {
            changes.push(`${SPOTS_MANIFEST}: ${before ? 'updated' : 'created'} (${next.features.length} features)`);
            if (!dryRun) {
                fs.mkdirSync(path.join(root, 'promo'), { recursive: true });
                fs.writeFileSync(path.join(root, SPOTS_MANIFEST), JSON.stringify(next, null, 2) + '\n');
            }
        }
    } else {
        changes.push('skipped promo/spots.json: no FEATURES.md');
    }
    console.log(`${dryRun ? '[dry run] ' : ''}${s.name}`);
    console.log(changes.length ? changes.map(c => `  ${c}`).join('\n') : '  nothing to change');
}

function main(argv: string[]) {
    const [cmd, ...rest] = argv;
    const flags = new Set(rest.filter(a => a.startsWith('--') && !a.includes('=')));
    const opt = (name: string) => {
        const i = rest.indexOf(name);
        return i >= 0 ? rest[i + 1] : undefined;
    };
    const valueIdx = new Set(['--root', '--scope'].map(n => rest.indexOf(n) + 1).filter(i => i > 0));
    let dirs = rest.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));

    if (cmd === 'apply') {
        if (dirs.length !== 1) throw new Error('apply takes exactly one repo directory');
        apply(dirs[0], flags.has('--dry-run'));
        return;
    }
    if (cmd !== 'audit') {
        console.log('usage: showcase audit [dir...] [--root DIR --scope scope.md] [--json]\n       showcase apply <dir> [--dry-run]');
        process.exitCode = cmd ? 1 : 0;
        return;
    }
    const root = opt('--root');
    const scope = opt('--scope');
    if (scope) dirs = [...dirs, ...scopeRepos(scope).map(n => path.join(root ?? path.dirname(scope), n))];
    if (!dirs.length) dirs = ['.'];
    const scans: RepoScan[] = [];
    for (const d of dirs) {
        if (!fs.existsSync(d)) { console.error(`skip ${d}: not found`); continue; }
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
