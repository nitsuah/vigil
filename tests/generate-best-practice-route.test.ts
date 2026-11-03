import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@octokit/rest', () => ({ Octokit: vi.fn() }));
vi.mock('@/lib/ai', () => ({ generateAIContent: vi.fn() }));
vi.mock('@/lib/ai-prompt-chain', () => ({
    enrichContext: vi.fn(),
    buildPracticePrompt: vi.fn(),
}));
vi.mock('@/lib/detectLanguage', () => ({ detectTemplateLanguage: vi.fn() }));

import { POST } from '@/app/api/repos/generate-best-practice/route';
import { auth } from '@/auth';
import { Octokit } from '@octokit/rest';
import { generateAIContent } from '@/lib/ai';

const mockAuth = vi.mocked(auth) as unknown as Mock<() => Promise<unknown>>;
const mockGenerateAIContent = vi.mocked(generateAIContent);

const makeRequest = (repoName: string) =>
    new NextRequest('http://localhost:3000/api/repos/generate-best-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName, practiceType: 'linting' }),
    });

describe('POST /api/repos/generate-best-practice repository-name validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({
            user: { name: 'signed-in-user' },
            accessToken: 'test-token',
        });
    });

    it.each(['owner/repo name', 'bad owner/repo'])(
        'rejects invalid owner/repo characters in %s before external work',
        async (repoName) => {
            const response = await POST(makeRequest(repoName));
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({
                error: 'Invalid repository owner or name',
            });
            expect(Octokit).not.toHaveBeenCalled();
            expect(mockGenerateAIContent).not.toHaveBeenCalled();
        },
    );
});
