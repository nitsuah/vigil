/**
 * Tests for GET /api/repo-details/[name].
 * Verifies that the route fetches all seven detail tables via a single
 * db.transaction() call, and that auth / 404 guards still work correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { GET } from '@/app/api/repo-details/[name]/route';
import { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getNeonClient: vi.fn(), ensureSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/default-repos', () => ({ DEFAULT_REPOS: [{ name: 'vigil', fullName: 'nitsuah/vigil' }] }));

import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';

const mockAuth = vi.mocked(auth) as unknown as Mock<() => Promise<Session | null>>;
const mockGetNeonClient = vi.mocked(getNeonClient);

const makeRequest = (name: string) =>
    new NextRequest(`http://localhost:3000/api/repo-details/${name}`, { method: 'GET' });

const fakeRepo = {
    id: 'repo-1',
    name: 'vigil',
    full_name: 'nitsuah/vigil',
    visibility_verified: true,
    private_repo: false,
    description: 'test',
    url: 'https://github.com/nitsuah/vigil',
    has_security_policy: true,
    has_security_advisories: false,
    private_vuln_reporting_enabled: false,
    dependabot_alerts_enabled: true,
    dependabot_alert_count: 2,
    code_scanning_enabled: false,
    code_scanning_alert_count: 0,
    secret_scanning_enabled: false,
    secret_scanning_alert_count: 0,
};

function makeDb(repoResult: unknown[] = [fakeRepo], repoAccessRows: unknown[] = []) {
    const transactionResult = [
        [{ id: 't1', title: 'Task 1' }],    // tasks
        [{ id: 'r1', title: 'Ship X' }],     // roadmap_items
        [{ metric_name: 'loc', value: 100, unit: 'lines' }], // metrics
        [],                                   // features
        [],                                   // doc_status
        [],                                   // best_practices
        [],                                   // community_standards
    ];

    const db = vi.fn(async (strings: TemplateStringsArray) => {
        if (strings.join(' ').includes('FROM repo_access')) return repoAccessRows;
        return repoResult;
    });
    (db as unknown as Record<string, unknown>).transaction = vi.fn().mockResolvedValue(transactionResult);
    return db;
}

describe('GET /api/repo-details/[name]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({
            user: { name: 'testuser', email: 'test@example.com' },
            expires: new Date(Date.now() + 86400000).toISOString(),
        } as Session);
    });

    it('returns 404 when the repo does not exist', async () => {
        const db = makeDb([]);
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(makeRequest('unknown'), { params: Promise.resolve({ name: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('returns 401 when unauthenticated and repo is not a default', async () => {
        mockAuth.mockResolvedValue(null);
        const db = makeDb([{ ...fakeRepo, name: 'private-repo' }]);
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(makeRequest('private-repo'), { params: Promise.resolve({ name: 'private-repo' }) });
        expect(res.status).toBe(401);
        // transaction should NOT have been called — we bailed out before detail queries
        expect((db as unknown as Record<string, Mock>).transaction).not.toHaveBeenCalled();
    });

    it('returns 404 for a private repo the signed-in user has no repo_access for (CWE-639)', async () => {
        const privateRepo = { ...fakeRepo, name: 'someones-private-repo', full_name: 'someone/private-repo', private_repo: true };
        const db = makeDb([privateRepo], []);
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(
            makeRequest(privateRepo.name),
            { params: Promise.resolve({ name: privateRepo.name }) }
        );
        const body = await res.json();

        expect(res.status).toBe(404);
        expect(body.error).toBe('Repo not found');
        expect((db as unknown as Record<string, Mock>).transaction).not.toHaveBeenCalled();
    });

    it('allows a private repo the signed-in user has a repo_access row for', async () => {
        mockAuth.mockResolvedValue({
            user: { name: 'testuser', email: 'test@example.com' },
            userId: 'gh-owner-1',
            expires: new Date(Date.now() + 86400000).toISOString(),
        } as Session);
        const privateRepo = { ...fakeRepo, name: 'my-private-repo', full_name: 'me/my-private-repo', private_repo: true };
        const db = makeDb([privateRepo], [{ '?column?': 1 }]);
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(
            makeRequest(privateRepo.name),
            { params: Promise.resolve({ name: privateRepo.name }) }
        );
        expect(res.status).toBe(200);
    });

    it('fetches all detail tables via a single db.transaction() call', async () => {
        const db = makeDb();
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(makeRequest('vigil'), { params: Promise.resolve({ name: 'vigil' }) });
        expect(res.status).toBe(200);

        // The transaction mock should have been called exactly once
        const txMock = (db as unknown as Record<string, Mock>).transaction;
        expect(txMock).toHaveBeenCalledTimes(1);

        // The transaction should have received exactly 7 queries
        const [queries] = txMock.mock.calls[0];
        expect(queries).toHaveLength(7);
    });

    it('maps metric_name to name in the metrics array', async () => {
        const db = makeDb();
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(makeRequest('vigil'), { params: Promise.resolve({ name: 'vigil' }) });
        const body = await res.json();

        expect(body.metrics).toEqual([{ name: 'loc', value: 100, unit: 'lines' }]);
    });

    it('returns the expected response shape with all detail keys', async () => {
        const db = makeDb();
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(makeRequest('vigil'), { params: Promise.resolve({ name: 'vigil' }) });
        const body = await res.json();

        expect(body).toMatchObject({
            repo: expect.objectContaining({ name: 'vigil' }),
            tasks: expect.any(Array),
            roadmapItems: expect.any(Array),
            metrics: expect.any(Array),
            features: expect.any(Array),
            docStatuses: expect.any(Array),
            bestPractices: expect.any(Array),
            communityStandards: expect.any(Array),
        });
    });

    it('maps nullable security controls to unknown and preserves booleans/counts', async () => {
        const db = makeDb([{
            ...fakeRepo,
            has_security_policy: undefined,
            has_security_advisories: true,
            private_vuln_reporting_enabled: false,
            dependabot_alerts_enabled: null,
            dependabot_alert_count: 3,
            code_scanning_enabled: true,
            code_scanning_alert_count: 0,
            secret_scanning_enabled: null,
            secret_scanning_alert_count: 2,
        }]);
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(makeRequest('vigil'), { params: Promise.resolve({ name: 'vigil' }) });
        const body = await res.json();

        expect(body.securityConfig).toEqual({
            hasSecurityPolicy: 'unknown',
            hasSecurityAdvisories: true,
            privateVulnerabilityReportingEnabled: false,
            dependabotAlertsEnabled: 'unknown',
            dependabotAlertCount: 3,
            codeScanningEnabled: true,
            codeScanningAlertCount: 0,
            secretScanningEnabled: 'unknown',
            secretScanningAlertCount: 2,
        });
    });
});
