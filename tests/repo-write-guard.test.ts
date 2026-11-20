/**
 * Shared-row writes need a repo_access grant and are keyed by repo id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const updates: Array<{ q: string; values: unknown[] }> = [];
let candidates: Array<{ id: string; name: string; full_name: string }> = [];
let grants = new Set<string>();

vi.mock('@/auth', () => ({ auth: () => mockAuth() }));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/db', () => ({
    ensureSchema: vi.fn(),
    getNeonClient: () => (strings: TemplateStringsArray, ...values: unknown[]) => {
        const q = strings.join('?');
        if (q.includes('FROM repo_access')) {
            return Promise.resolve(grants.has(String(values[0])) ? [{ x: 1 }] : []);
        }
        if (q.includes('FROM repos')) return Promise.resolve(candidates);
        if (q.includes('UPDATE')) {
            updates.push({ q, values });
            return Promise.resolve([{ id: 'item', linked_pr_number: 1, agent_task_id: null }]);
        }
        return Promise.resolve([]);
    },
}));

import { resolveWritableRepo } from '@/lib/repo-access-guard';
import { POST as hide } from '@/app/api/repos/[name]/hide/route';
import { POST as unhide } from '@/app/api/repos/[name]/unhide/route';
import { PATCH as updateType } from '@/app/api/repos/[name]/update-type/route';
import { PATCH as linkItem } from '@/app/api/repos/[name]/roadmap-items/[id]/route';

const params = { params: Promise.resolve({ name: 'app' }) };
const req = (body?: unknown) =>
    new Request('http://localhost/api/repos/app/x', { method: 'POST', body: JSON.stringify(body ?? {}) }) as never;

describe('write guard', () => {
    beforeEach(() => {
        mockAuth.mockReset();
        updates.length = 0;
        grants = new Set();
        candidates = [{ id: 'r1', name: 'app', full_name: 'a/app' }];
        mockAuth.mockResolvedValue({ user: { name: 'u' }, userId: '42' });
    });

    it('resolveWritableRepo 404s without a grant, 409s on ambiguity, resolves one row', async () => {
        expect((await resolveWritableRepo('app', { userId: '42' })).response?.status).toBe(404);
        grants = new Set(['r1', 'r2']);
        candidates = [
            { id: 'r1', name: 'app', full_name: 'a/app' },
            { id: 'r2', name: 'app', full_name: 'b/app' },
        ];
        expect((await resolveWritableRepo('app', { userId: '42' })).response?.status).toBe(409);
        candidates = [candidates[0], { id: 'r3', name: 'app', full_name: 'c/app' }];
        const ok = await resolveWritableRepo('app', { userId: '42' });
        expect(ok.repo?.id).toBe('r1');
    });

    it('hide / unhide / update-type / roadmap link reject callers without a grant', async () => {
        expect((await hide(req(), params)).status).toBe(404);
        expect((await unhide(req(), params)).status).toBe(404);
        expect((await updateType(req({ type: 'tool' }), params)).status).toBe(404);
        expect((await linkItem(req({ linkedPrNumber: 1 }), { params: Promise.resolve({ name: 'app', id: 'i' }) })).status).toBe(404);
        expect(updates).toEqual([]);
    });

    it('writes are keyed by the granted repo id, not the short name', async () => {
        grants = new Set(['r1']);
        candidates = [
            { id: 'r1', name: 'app', full_name: 'a/app' },
            { id: 'r9', name: 'app', full_name: 'z/app' },
        ];
        expect((await hide(req(), params)).status).toBe(200);
        expect((await unhide(req(), params)).status).toBe(200);
        expect((await updateType(req({ type: 'tool' }), params)).status).toBe(200);
        expect(
            (await linkItem(req({ linkedPrNumber: 1 }), { params: Promise.resolve({ name: 'app', id: 'i' }) })).status
        ).toBe(200);
        expect(updates).toHaveLength(4);
        for (const u of updates) {
            expect(u.values).toContain('r1');
            expect(u.q).not.toMatch(/WHERE name =/);
        }
    });
});
