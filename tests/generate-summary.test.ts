/**
 * Tests for AI summary generation API endpoint.
 * Ensures the generate-summary endpoint is accessible and handles errors properly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { POST } from '@/app/api/repos/[name]/generate-summary/route';
import { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

// Mock dependencies - use factory functions to avoid hoisting issues
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getNeonClient: vi.fn(),
  ensureSchema: vi.fn(),
}));

// Per-repo access is covered in repo-access-guard.test.ts.
const resolveWritableRepo = vi.hoisted(() => vi.fn());
vi.mock('@/lib/repo-access-guard', () => ({ resolveWritableRepo }));
vi.mock('@/lib/github', () => ({
  GitHubClient: vi.fn(),
}));

vi.mock('@/lib/ai', () => ({
  generateRepoSummary: vi.fn(),
}));

// Import after mocks are set up
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { GitHubClient } from '@/lib/github';
import { generateRepoSummary } from '@/lib/ai';

// next-auth's `auth` export has a 5-overload type whose last overload
// (middleware wrapper) is what vi.mocked() infers; cast to the actual
// session-lookup signature used by route handlers.
const mockAuth = vi.mocked(auth) as unknown as Mock<() => Promise<Session | null>>;
const mockGetNeonClient = vi.mocked(getNeonClient);
const mockGenerateRepoSummary = vi.mocked(generateRepoSummary);
const mockGitHubClient = vi.mocked(GitHubClient);

describe('Generate Summary API', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    resolveWritableRepo.mockResolvedValue({ repo: { id: 'r1', name: 'repo', full_name: 'owner/repo' } });
  });
  
  it('should reject unauthorized requests', async () => {
    mockAuth.mockResolvedValue(null);
    
    const request = new NextRequest('http://localhost:3000/api/repos/test-repo/generate-summary', {
      method: 'POST',
    });
    
    const response = await POST(request, { params: Promise.resolve({ name: 'test-repo' }) });
    const data = await response.json();
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
  
  it('should return 404 for non-existent repo', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      accessToken: 'mock-token',
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    
    resolveWritableRepo.mockResolvedValue({
      response: new Response(JSON.stringify({ error: 'Repo not found' }), { status: 404 }),
    });
    const mockDb = vi.fn().mockResolvedValue([]);
    mockGetNeonClient.mockReturnValue(mockDb as never);
    
    const request = new NextRequest('http://localhost:3000/api/repos/nonexistent/generate-summary', {
      method: 'POST',
    });
    
    const response = await POST(request, { params: Promise.resolve({ name: 'nonexistent' }) });
    const data = await response.json();
    
    expect(response.status).toBe(404);
    expect(data.error).toBe('Repo not found');
  });
  
  it('should handle missing GitHub token', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    
    // Mock db as a function that returns repo data
    const mockDb = vi.fn().mockResolvedValue([{ full_name: 'owner/repo' }]);
    mockGetNeonClient.mockReturnValue(mockDb as never);
    
    const request = new NextRequest('http://localhost:3000/api/repos/repo/generate-summary', {
      method: 'POST',
    });
    
    const response = await POST(request, { params: Promise.resolve({ name: 'repo' }) });
    const data = await response.json();
    
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to generate summary');
  });
  
  it('should return error when no documentation files found', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      accessToken: 'mock-token',
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    
    // Mock db as a function that returns repo data
    const mockDb = vi.fn().mockResolvedValue([{ full_name: 'owner/repo' }]);
    mockGetNeonClient.mockReturnValue(mockDb as never);
    
    // Mock GitHubClient to return no files
    mockGitHubClient.mockImplementation(function(this: Record<string, unknown>) {
      this.getFileContent = vi.fn().mockResolvedValue(null);
    } as never);
    
    const request = new NextRequest('http://localhost:3000/api/repos/repo/generate-summary', {
      method: 'POST',
    });
    
    const response = await POST(request, { params: Promise.resolve({ name: 'repo' }) });
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('No documentation files found to analyze');
  });
  
  it('should successfully generate and save summary', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      accessToken: 'mock-token',
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    
    // Mock db as a function with multiple calls (SELECT then UPDATE)
    const mockDb = vi.fn()
      .mockResolvedValue([{ ai_summary_generated_at: '2026-11-28T00:00:00.000Z' }]); // UPDATE query
    mockGetNeonClient.mockReturnValue(mockDb as never);
    
    // Mock GitHubClient to return README
    mockGitHubClient.mockImplementation(function(this: Record<string, unknown>) {
      this.getFileContent = vi.fn().mockImplementation((repo: string, file: string) => {
        if (file === 'README.md') return Promise.resolve('# Test Repo\n\nA test repository');
        return Promise.resolve(null);
      });
    } as never);
    
    // Mock AI summary generation
    mockGenerateRepoSummary.mockResolvedValue('This is a test repository for unit testing.');
    
    const request = new NextRequest('http://localhost:3000/api/repos/repo/generate-summary', {
      method: 'POST',
    });
    
    const response = await POST(request, { params: Promise.resolve({ name: 'repo' }) });
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.summary).toBe('This is a test repository for unit testing.');
    expect(data.generatedAt).toBe('2026-11-28T00:00:00.000Z');
    expect(mockGenerateRepoSummary).toHaveBeenCalledWith('repo', {
      'README.md': '# Test Repo\n\nA test repository',
    });
  });
  
  it('should return error when AI generation fails', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      accessToken: 'mock-token',
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    
    // Mock db as a function that returns repo data
    const mockDb = vi.fn().mockResolvedValue([{ full_name: 'owner/repo' }]);
    mockGetNeonClient.mockReturnValue(mockDb as never);
    
    // Mock GitHubClient to return README
    mockGitHubClient.mockImplementation(function(this: Record<string, unknown>) {
      this.getFileContent = vi.fn().mockResolvedValue('# Test Repo');
    } as never);
    
    // Mock AI to return null (failure)
    mockGenerateRepoSummary.mockResolvedValue(null);
    
    const request = new NextRequest('http://localhost:3000/api/repos/repo/generate-summary', {
      method: 'POST',
    });
    
    const response = await POST(request, { params: Promise.resolve({ name: 'repo' }) });
    const data = await response.json();
    
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to generate summary (check API key)');
  });

  it('does not save a failure notice over the old summary', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser' },
      accessToken: 'mock-token',
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    const mockDb = vi.fn();
    mockGetNeonClient.mockReturnValue(mockDb as never);
    mockGitHubClient.mockImplementation(function(this: Record<string, unknown>) {
      this.getFileContent = vi.fn().mockResolvedValue('# Test Repo');
    } as never);
    mockGenerateRepoSummary.mockResolvedValue('Summary unavailable (AI Service Error)');

    const request = new NextRequest('http://localhost:3000/api/repos/repo/generate-summary', { method: 'POST' });
    const response = await POST(request, { params: Promise.resolve({ name: 'repo' }) });

    expect(response.status).toBe(502);
    expect(mockDb).not.toHaveBeenCalled();
  });
});

describe('Generate Summary Route Export', () => {
  it('should export POST function', () => {
    expect(POST).toBeDefined();
    expect(typeof POST).toBe('function');
  });
  
  it('should be an async function', () => {
    expect(POST.constructor.name).toBe('AsyncFunction');
  });
});
