import { describe, it, expect } from 'vitest';
import {
    auditShowcase,
    classifyElements,
    detectShowcaseFiles,
    hasExpandKit,
    injectExpandKit,
    parseFeatures,
    scaffoldSpots,
    type SpotsManifest,
} from './showcase';
import { detectVisualDocs } from './visual-docs';

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
        expect(classifyElements({ diagrams: [], screenshots: ['docs/screenshots/a.png'], automated: false, files })).toEqual({
            screenshots: 'static', diagrams: 'missing', videos: 'tracked', pages: 'deployed',
        });
    });

    it('flags Pages HTML with no workflow as orphaned and stray brag-output', () => {
        const files = detectShowcaseFiles(['docs/brag/index.html', 'brag-output/brag.mp4']);
        expect(files.strayBragOutput).toBe(true);
        expect(classifyElements({ diagrams: [], screenshots: [], automated: true, files }).pages).toBe('orphaned');
        expect(classifyElements({ diagrams: [], screenshots: [], automated: true, files }).videos).toBe('untracked');
    });

    it('is exposed through the visual_docs details', () => {
        const r = detectVisualDocs(['docs/screenshots/a.png', '.github/workflows/visual-docs.yml'], '![a](docs/screenshots/a.png)');
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
            elements: classifyElements({ diagrams: [], screenshots: [], automated: false, files }),
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
        expect(r.coverage).toEqual({ features: 4, withVisual: 2, exempt: 1 });
        expect(codes).toEqual(expect.arrayContaining([
            'feature-unlisted', 'spot-unknown', 'screenshot-missing-file', 'feature-dropped', 'spot-stale', 'spot-long', 'spot-unpublished',
        ]));
    });

    it('checks Pages HTML for the kit, posters and absolute og:image, errors first', () => {
        const fileList = ['docs/brag/index.html'];
        const r = base({
            fileList,
            pagesHtml: { 'docs/brag/index.html': '<head><meta property="og:image" content="brag.jpg"></head><video src="a.mp4">' },
        });
        expect(r.gaps[0].code).toBe('pages-orphaned');
        expect(r.gaps.map(g => g.code)).toEqual(expect.arrayContaining(['no-expand-kit', 'video-no-poster', 'og-relative']));
    });
});
