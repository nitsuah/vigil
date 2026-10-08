import { describe, it, expect } from 'vitest';
import {
    auditShowcase,
    classifyElements,
    detectShowcaseFiles,
    findPagesHtml,
    hasExpandKit,
    injectExpandKit,
    isBrandWorkflow,
    isScreenshotWorkflow,
    PAGES_DEPLOY_STEP,
    pagesUploadPaths,
    parseFeatures,
    repoNameFromRemote,
    scaffoldSpots,
    type SpotsManifest,
} from './showcase';
import { detectVisualDocs, visualAutomation } from './visual-docs';

const NONE = { screenshots: false, diagrams: false };

const FEATURES = `# Features

Intro prose with a - **bold** that is not a bullet.

### 🧠 Candidate Profile

- **Resume Learning**: Extracts experience
- **Profile Reuse**: Applies saved answers

## 📝 Application Automation

- **Form Fill Automation**: Fills forms
- plain bullet without a name
* **Resume Learning**: duplicate title in another category
`;

describe('parseFeatures status tags and unshipped work', () => {
    it('reads `[shipped]` / [x] tagged bullets and skips planned items and Planned sections', () => {
        const md = [
            '## Scanning',
            '- `[shipped]` **Barcode Scanning** — webcam scanning',
            '- [x] **Capture Queue**: stage frames',
            '- `[planned — 2027 Q1]` **Cloud Sync** — later',
            '- `[planned]` **Share Links** — later',
            '## Planned',
            '- **Offline Mode** — someday',
            '## Fun',
            '- **Be Kind Rewind** — easter egg',
        ].join('\n');
        expect(parseFeatures(md).map(f => f.id)).toEqual(['barcode-scanning', 'capture-queue', 'be-kind-rewind']);
    });

    it('skips unchecked boxes and subsections nested under a Planned section', () => {
        const md = [
            '## Core',
            '- [x] **Done Thing** — shipped',
            '- [ ] **Half Thing** — not yet',
            '## Planned',
            '### Sync',
            '- **Cloud Sync** — later',
            '#### Details',
            '- **Conflict UI** — later',
            '## Fun',
            '### Extras',
            '- **Be Kind Rewind** — easter egg',
        ].join('\n');
        expect(parseFeatures(md).map(f => f.id)).toEqual(['done-thing', 'be-kind-rewind']);
    });
});

describe('parseFeatures', () => {
    it('reads bold-named bullets under emoji headings and de-duplicates ids', () => {
        expect(parseFeatures(FEATURES)).toEqual([
            { id: 'resume-learning', title: 'Resume Learning', category: 'Candidate Profile' },
            { id: 'profile-reuse', title: 'Profile Reuse', category: 'Candidate Profile' },
            { id: 'form-fill-automation', title: 'Form Fill Automation', category: 'Application Automation' },
            { id: 'application-automation-resume-learning', title: 'Resume Learning', category: 'Application Automation' },
        ]);
    });
});

describe('detectShowcaseFiles / classifyElements', () => {
    it('classifies each element from the file list', () => {
        const files = detectShowcaseFiles([
            'site/index.html',
            '.github/workflows/pages.yml',
            'site/assets/demo.mp4',
            'promo/out/x/x.mp4',
            'node_modules/a/b.mp4',
            'promo/spots.json',
        ]);
        expect(files.videos).toEqual(['site/assets/demo.mp4']);
        expect(classifyElements({ diagrams: [], screenshots: ['docs/screenshots/a.png'], automated: NONE, files })).toEqual({
            screenshots: 'static', diagrams: 'missing', videos: 'tracked', pages: 'deployed',
        });
    });

    it('flags Pages HTML with no workflow as orphaned and stray brag-output', () => {
        const files = detectShowcaseFiles(['docs/brag/index.html', 'brag-output/brag.mp4']);
        expect(files.strayBragOutput).toBe(true);
        expect(classifyElements({ diagrams: [], screenshots: [], automated: NONE, files }).pages).toBe('orphaned');
        expect(classifyElements({ diagrams: [], screenshots: [], automated: NONE, files }).videos).toBe('untracked');
    });

    it('is exposed through the visual_docs details', () => {
        const r = detectVisualDocs(
            ['docs/screenshots/a.png', '.github/workflows/visual-docs.yml', 'playwright.visual-docs.config.ts'],
            '![a](docs/screenshots/a.png)',
        );
        expect(r.details.elements.screenshots).toBe('ci');
        expect(r.details.elements.pages).toBe('missing');
    });
});

describe('expand kit', () => {
    it('injects once before </head> and keeps CRLF line endings', () => {
        const html = '<html>\r\n<head>\r\n<title>x</title>\r\n</head>\r\n<body></body></html>';
        const once = injectExpandKit(html);
        expect(hasExpandKit(once)).toBe(true);
        expect(once).toContain('defer></script>\r\n</head>');
        expect(once.split('\n').every(l => l === '' || l.endsWith('\r') || l.endsWith('</html>'))).toBe(true);
        expect(injectExpandKit(once)).toBe(once);
    });
});

describe('scaffoldSpots', () => {
    const features = parseFeatures(FEATURES);

    it('creates a manifest and links screenshots named after a feature id', () => {
        const m = scaffoldSpots({ product: 'ats-fill', features, screenshots: ['docs/screenshots/profile-reuse.png'], pagesDir: 'site' });
        expect(m.features).toHaveLength(4);
        expect(m.features.find(f => f.id === 'profile-reuse')?.screenshots).toEqual(['docs/screenshots/profile-reuse.png']);
        expect(m.pagesDir).toBe('site');
        expect(m.reels?.[0].id).toBe('hero');
    });

    it('keeps existing entries and only appends new features', () => {
        const existing: SpotsManifest = {
            product: 'x', features: [{ id: 'resume-learning', title: 'Old', category: 'Old', spots: ['brag-21s'], visual: undefined }],
            spots: [{ id: 'brag-21s', seconds: 21 }],
        };
        const m = scaffoldSpots({ product: 'x', features, existing });
        expect(m.features[0]).toMatchObject({ id: 'resume-learning', title: 'Resume Learning', spots: ['brag-21s'] });
        expect(m.features).toHaveLength(4);
        expect(m.spots).toEqual([{ id: 'brag-21s', seconds: 21 }]);
    });
});

describe('auditShowcase', () => {
    const features = parseFeatures(FEATURES);
    const base = (over: Partial<Parameters<typeof auditShowcase>[0]>) => {
        const fileList = over.fileList ?? ['README.md'];
        const files = detectShowcaseFiles(fileList);
        return auditShowcase({
            fileList,
            files,
            elements: classifyElements({ diagrams: [], screenshots: [], automated: NONE, files }),
            readme: '# x',
            features,
            manifest: null,
            pagesHtml: {},
            ...over,
        });
    };

    it('asks for a manifest when FEATURES.md exists without one', () => {
        expect(base({}).gaps.map(g => g.code)).toContain('no-manifest');
    });

    it('reports coverage, unknown spots, missing files, dropped and stale features', () => {
        const manifest: SpotsManifest = {
            product: 'x',
            features: [
                { id: 'resume-learning', title: 'Resume Learning', category: 'C', spots: ['nope'] },
                { id: 'profile-reuse', title: 'Profile Reuse', category: 'C', screenshots: ['docs/screenshots/gone.png'] },
                { id: 'form-fill-automation', title: 'Form Fill', category: 'A', visual: 'none' },
                { id: 'old-thing', title: 'Old thing', category: 'A' },
            ],
            spots: [{ id: 'hero-40s', seconds: 40, rendered: '2026-01-01', published: 'site/assets/hero.mp4' }],
        };
        const r = base({ manifest, featuresChanged: '2026-02-01T00:00:00Z' });
        const codes = r.gaps.map(g => g.code);
        expect(r.coverage).toEqual({ features: 4, withVisual: 0, exempt: 1 });
        expect(codes).toEqual(expect.arrayContaining([
            'feature-unlisted', 'spot-unknown', 'screenshot-missing-file', 'feature-dropped', 'spot-stale', 'spot-long', 'spot-unpublished',
        ]));
    });

    it('counts only resolvable references as coverage', () => {
        const manifest: SpotsManifest = {
            product: 'x',
            features: [
                { id: 'resume-learning', title: 'Resume Learning', category: 'C', spots: ['fill-21s'] },
                { id: 'profile-reuse', title: 'Profile Reuse', category: 'C', screenshots: ['docs/screenshots/profile-reuse.png'] },
                { id: 'form-fill-automation', title: 'Form Fill', category: 'A', screenshots: [] },
                { id: 'application-automation-resume-learning', title: 'Resume Learning', category: 'A', visual: 'none' },
            ],
            spots: [{ id: 'fill-21s', seconds: 21 }],
        };
        const r = base({ manifest, fileList: ['README.md', 'docs/screenshots/profile-reuse.png'] });
        expect(r.coverage).toEqual({ features: 4, withVisual: 2, exempt: 1 });
        expect(r.gaps.find(g => g.code === 'feature-no-visual')?.message).toContain('Form Fill Automation');
    });

    it('checks Pages HTML for the kit, posters and absolute og:image; a missing Pages workflow is an unverified warning', () => {
        const fileList = ['docs/brag/index.html'];
        const r = base({
            fileList,
            pagesHtml: { 'docs/brag/index.html': '<head><meta property="og:image" content="brag.jpg"></head><video src="a.mp4">' },
        });
        expect(r.gaps.find(g => g.code === 'pages-orphaned')?.severity).toBe('warn');
        expect(r.gaps.some(g => g.severity === 'error')).toBe(false);
        expect(r.gaps.map(g => g.code)).toEqual(expect.arrayContaining(['no-expand-kit', 'video-no-poster', 'og-relative']));
    });
});

describe('strict video tracking and per-element automation', () => {
    const files = detectShowcaseFiles(['site/assets/demo.mp4', 'promo/spots.json']);

    it('needs a spot that publishes one of the videos once the manifest is known', () => {
        const empty: SpotsManifest = { product: 'x', features: [], spots: [] };
        const pub: SpotsManifest = { ...empty, spots: [{ id: 'a', published: 'site/assets/demo.mp4' }] };
        const gone: SpotsManifest = { ...empty, spots: [{ id: 'a', published: 'site/assets/old.mp4' }] };
        const cls = (manifest: SpotsManifest | null) => classifyElements({ diagrams: [], screenshots: [], automated: NONE, files, manifest }).videos;
        expect(cls(empty)).toBe('untracked');
        expect(cls(gone)).toBe('untracked');
        expect(cls(null)).toBe('untracked');
        expect(cls(pub)).toBe('tracked');
        expect(cls({ ...empty, reels: [{ id: 'hero', spots: [], published: 'site/assets/demo.mp4' }] })).toBe('tracked');
    });

    it('treats only a deploy step, not an artifact upload, as Pages deployment', () => {
        expect(PAGES_DEPLOY_STEP.test('uses: actions/upload-pages-artifact@v3')).toBe(false);
        expect(PAGES_DEPLOY_STEP.test('uses: actions/upload-pages-artifact@v3\n      - uses: actions/deploy-pages@v4')).toBe(true);
        const pages = detectShowcaseFiles(['site/index.html']); // upload-only workflow contributes no deploy evidence
        expect(classifyElements({ diagrams: [], screenshots: [], automated: NONE, files: pages }).pages).toBe('orphaned');
    });

    it('credits a generic visual workflow only to elements it can rebuild', () => {
        const wf = ['.github/workflows/visual-docs.yml'];
        expect(visualAutomation(['playwright.visual-docs.config.ts'], wf, ['docs/diagrams/a.svg'])).toEqual({ screenshots: true, diagrams: false });
        expect(visualAutomation([], wf, ['docs/diagrams/a.mmd'])).toEqual({ screenshots: false, diagrams: true });
        expect(visualAutomation([], ['.github/workflows/screenshots.yml'], [])).toEqual({ screenshots: true, diagrams: false });
    });
});

// Trimmed from nitsuah/ats-fill .github/workflows/ci.yml.
const ATS_E2E_JOB = `
  e2e:
    steps:
      - name: Run Playwright
        run: docker run --rm -v \${{ github.workspace }}/test-results:/app/test-results ats-fill:e2e sh -c "npm run test:e2e && npx playwright test"
      - name: Upload failure screenshots
        uses: actions/upload-artifact@v7.0.1
        if: failure()
        with:
          name: playwright-screenshots
          path: test-results/
`;
const ATS_GALLERY_JOB = `
  screenshot-gallery:
    steps:
      - name: Capture product screenshots
        run: |
          rm -rf screenshots
          mkdir -p screenshots
          docker run --rm -v \${{ github.workspace }}/screenshots:/app/screenshots ats-fill:e2e \\
            sh -c "npx playwright test --config config/playwright.config.mjs tests/e2e/screenshots.spec.mjs"
      - name: Validate screenshot gallery
        run: node scripts/validate-screenshot-gallery.mjs
      - name: Publish screenshot gallery PR
        run: bash scripts/publish-screenshot-gallery.sh
`;
const ATS_STORE_JOB = `
  chrome-web-store-assets:
    steps:
      - name: Generate store screenshots and promo tiles
        run: |
          mkdir -p store-assets
          npx playwright test tests/e2e/store-assets.spec.mjs
`;

describe('in-house screenshot pipelines and brand automation', () => {
    it('counts a screenshot-gallery job inside a generically named ci.yml', () => {
        expect(isScreenshotWorkflow(ATS_E2E_JOB + ATS_GALLERY_JOB)).toBe(true);
        expect(isScreenshotWorkflow('steps:\n  - run: node scripts/capture-screenshots.mjs\n')).toBe(true);
    });

    it('does not count a job that only uploads Playwright failure screenshots', () => {
        expect(isScreenshotWorkflow(ATS_E2E_JOB)).toBe(false);
        expect(isScreenshotWorkflow('- run: npx playwright test\n- uses: actions/upload-artifact@v4\n  with:\n    name: screenshots\n    path: test-results/**/*.png\n')).toBe(false);
        // a commented-out capture step is not automation
        expect(isScreenshotWorkflow('- run: npx playwright test\n# - run: node scripts/capture-screenshots.mjs\n')).toBe(false);
    });

    it('CLI: content evidence replaces the file-name guess for screenshots', () => {
        const fileList = ['.github/workflows/ci.yml', 'config/playwright.config.mjs', 'tests/e2e/screenshots.spec.mjs', 'screenshots/a.png'];
        expect(visualAutomation(fileList, [], [], { screenshotWorkflows: ['.github/workflows/ci.yml'] }).screenshots).toBe(true);
        expect(visualAutomation(fileList, [], [], { screenshotWorkflows: [] }).screenshots).toBe(false);
        // a screenshot-named workflow that fails the content check doesn't count either
        const named = ['.github/workflows/screenshots.yml'];
        expect(visualAutomation(named, named, [], { screenshotWorkflows: [] }).screenshots).toBe(false);
        expect(visualAutomation(named, named, []).screenshots).toBe(true);
    });

    it('dashboard: a screenshot spec/script + Playwright config + a workflow counts', () => {
        const ats = ['.github/workflows/ci.yml', 'config/playwright.config.mjs', 'tests/e2e/screenshots.spec.mjs', 'screenshots/popup.png'];
        expect(detectVisualDocs(ats, '').details.elements.screenshots).toBe('ci');
        expect(visualAutomation(['.github/workflows/ci.yml', 'playwright.config.ts', 'scripts/capture-screenshots.mjs'], [], []).screenshots).toBe(true);
        // each part is required
        expect(detectVisualDocs(ats.filter(f => !f.startsWith('.github/')), '').details.elements.screenshots).toBe('static');
        expect(detectVisualDocs(ats.filter(f => !f.includes('playwright')), '').details.elements.screenshots).toBe('static');
        expect(detectVisualDocs(ats.filter(f => !f.endsWith('.spec.mjs')), '').details.elements.screenshots).toBe('static');
        // screenshot images and build output are not capture code
        expect(visualAutomation(['.github/workflows/ci.yml', 'playwright.config.ts', 'node_modules/x/screenshot.js', 'docs/screenshots/a.png'], [], []).screenshots).toBe(false);
    });

    it('reports brand automation as an info line, never a warning', () => {
        expect(isBrandWorkflow(ATS_STORE_JOB)).toBe(true);
        expect(isBrandWorkflow('- run: npm run generate-icons')).toBe(true);
        expect(isBrandWorkflow(ATS_E2E_JOB + ATS_GALLERY_JOB)).toBe(false);
        expect(isBrandWorkflow('- run: cp public/favicon.svg site/')).toBe(false);
        const files = detectShowcaseFiles([]);
        const elements = classifyElements({ diagrams: [], screenshots: [], automated: NONE, files });
        const input = { fileList: [], files, elements, readme: null, features: null, manifest: null, pagesHtml: {} };
        const a = auditShowcase({ ...input, brandWorkflows: ['.github/workflows/ci.yml'] });
        expect(a.brandAutomation).toEqual(['.github/workflows/ci.yml']);
        expect(a.gaps.filter(g => g.code === 'brand-automation')).toEqual([
            { severity: 'info', code: 'brand-automation', message: 'brand automation: .github/workflows/ci.yml' },
        ]);
        expect(auditShowcase(input).brandAutomation).toEqual([]);
        expect(auditShowcase(input).gaps.some(g => g.code === 'brand-automation')).toBe(false);
    });
});

// Trimmed from nitsuah/nitsuah-io .github/workflows/deploy-github-pages.yml.
const BLOG_PAGES = `
jobs:
  build:
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Upload static site
        uses: actions/upload-pages-artifact@v3
        with:
          path: github-pages-blog

  deploy:
    steps:
      - uses: actions/deploy-pages@v4
        with:
          path: not-this-one
`;

describe('Pages folder from the upload-pages-artifact step', () => {
    it('reads the uploaded path, normalised, and only from that step', () => {
        expect(pagesUploadPaths(BLOG_PAGES)).toEqual(['github-pages-blog']);
        expect(pagesUploadPaths('- uses: actions/upload-pages-artifact@v3\n  with:\n    path: ./public/\n')).toEqual(['public']);
        expect(pagesUploadPaths("- with:\n    path: 'out'\n  uses: actions/upload-pages-artifact@v3\n")).toEqual(['out']);
        expect(pagesUploadPaths('- uses: actions/upload-pages-artifact@v3\n- uses: actions/deploy-pages@v4\n')).toEqual(['_site']);
        expect(pagesUploadPaths('- uses: actions/upload-pages-artifact@v3\n  with:\n    path: ${{ env.DIR }}\n')).toEqual([]);
        expect(pagesUploadPaths('- uses: actions/upload-artifact@v4\n  with:\n    path: site\n')).toEqual([]);
    });

    it('treats <path>/index.html as Pages HTML, and nested pages only for apply', () => {
        const fileList = ['github-pages-blog/index.html', 'github-pages-blog/blog/post/index.html', 'site/index.html', 'other/index.html'];
        expect(detectShowcaseFiles(fileList).pagesHtml).toEqual(['site/index.html']); // dashboard: fixed list
        expect(detectShowcaseFiles(fileList, { pagesDirs: ['github-pages-blog'] }).pagesHtml).toEqual(['github-pages-blog/index.html', 'site/index.html']);
        expect(findPagesHtml(fileList, ['github-pages-blog'], true)).toEqual(['github-pages-blog/index.html', 'github-pages-blog/blog/post/index.html', 'site/index.html']);
        // a root upload takes only the top-level page, never every index.html in the repo
        expect(findPagesHtml(['index.html', 'other/index.html'], [''], true)).toEqual(['index.html']);
    });

    it('names the repo from its git remote', () => {
        expect(repoNameFromRemote('https://github.com/nitsuah/vigil.git\n')).toBe('vigil');
        expect(repoNameFromRemote('git@github.com:nitsuah/nitsuah-io.git')).toBe('nitsuah-io');
        expect(repoNameFromRemote('https://github.com/nitsuah/ats-fill')).toBe('ats-fill');
        expect(repoNameFromRemote('')).toBeNull();
    });
});
