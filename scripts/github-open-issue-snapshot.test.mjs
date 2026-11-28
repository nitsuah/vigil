import { afterEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'test-token-value';
const issue = (number, labels = [], extra = {}) => ({ number, labels, body: 'private body text', ...extra });
const page = (items, status = 200) => ({ ok: status < 400, status, json: async () => items });

/** The script runs on import, so each case stubs its inputs and imports it fresh. */
async function run(...pages) {
    vi.resetModules();
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    vi.stubEnv('GITHUB_REPOSITORY', 'octo/demo');
    const fetch = vi.fn();
    for (const response of pages) fetch.mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetch);
    let out = '';
    let err = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out += chunk; return true; });
    vi.spyOn(console, 'error').mockImplementation((message) => { err += message; });
    const argv = process.argv;
    process.argv = argv.slice(0, 2);
    try {
        await import('./github-open-issue-snapshot.mjs');
        await vi.waitFor(() => expect(out || err).not.toBe(''));
    } finally {
        process.argv = argv;
    }
    return { out, err, fetch };
}

afterEach(() => {
    process.exitCode = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('github-open-issue-snapshot', () => {
    it('pages to completion, skipping pull requests and repeated issue numbers', async () => {
        const first = Array.from({ length: 100 }, (_, i) => issue(i + 1, [], i === 0 ? { pull_request: {} } : {}));
        const { out, fetch } = await run(page(first), page([issue(100), issue(101)]));
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[1][0]).toContain('state=open&per_page=100&page=2');
        // 99 issues on page one, plus #101: #100 is a repeat.
        expect(JSON.parse(out)).toMatchObject({ repository: 'octo/demo', complete: true, total: 100, other: 100 });
    });

    it('counts each issue once, by vulnerability > bug > feedback > other', async () => {
        const { out } = await run(page([
            issue(1, [{ name: 'enhancement' }, { name: 'bug' }, { name: 'Security' }]),
            issue(2, ['feature', ' Bug ']),
            issue(3, [{ name: 'feedback' }, { name: 'docs' }]),
            issue(4, [{ name: 'docs' }]),
        ]));
        expect(JSON.parse(out)).toMatchObject({ total: 4, vulnerability: 1, bug: 1, feedback: 1, other: 1 });
    });

    it('prints only counts: no token, titles or bodies', async () => {
        const { out } = await run(page([issue(1, [], { title: 'private title' })]));
        expect(Object.keys(JSON.parse(out))).toEqual(
            ['repository', 'timestamp', 'complete', 'total', 'vulnerability', 'bug', 'feedback', 'other']
        );
        expect(out).not.toMatch(/private|test-token-value/);
    });

    it.each([
        ['a later page fails', [page(Array.from({ length: 100 }, (_, i) => issue(i + 1))), page({}, 502)], /HTTP 502/],
        ['a page is not a list', [page({ message: 'nope' })], /malformed issue page/],
        ['an item has no labels list', [page([{ number: 1 }])], /malformed issue page/],
    ])('prints no snapshot when %s', async (_name, pages, expected) => {
        const { out, err } = await run(...pages);
        expect(out).toBe('');
        expect(err).toMatch(expected);
        expect(err).not.toContain(TOKEN);
        expect(process.exitCode).toBe(1);
    });
});
