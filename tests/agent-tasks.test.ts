/**
 * Tests for Agent Task Queue API endpoint.
 * Covers authentication, valid task submission, and invalid payload handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { POST, GET } from '@/app/api/agent/tasks/route';
import { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// after() needs Next's request-scoped AsyncLocalStorage context, which only
// exists when a route handler runs inside the real Next.js server. These
// tests call POST/GET by importing and invoking them directly (see
// makeRequest below), so that context is absent and the real after() throws
// synchronously. Keep everything else in next/server real; just approximate
// after()'s "run once handling is done" semantics with an immediate,
// unawaited invocation, which is all these tests need to observe
// processQueue actually running.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (callback: () => unknown) => {
      void callback();
    },
  };
});

// Mocked (rather than left real) so receipt-persistence tests can control
// whether the durable write to agent_task_receipts succeeds or fails,
// without needing a real DATABASE_URL in the test environment.
vi.mock('@/lib/db', () => ({
  getNeonClient: vi.fn(),
  ensureSchema: vi.fn(),
  // route.ts's persistReceipt wraps calls in withQueryTimeout (see
  // lib/db.ts) to bound how long a hung Neon HTTP request can block the
  // queue. Pass through unmodified here -- these tests aren't exercising
  // the timeout behavior itself (that's real Promise/timer plumbing, not
  // worth re-testing against a mocked db), just persistReceipt's own
  // success/failure handling.
  withQueryTimeout: vi.fn((promise: Promise<unknown>) => promise),
}));

vi.mock('@/lib/log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import logger from '@/lib/log';

// next-auth's `auth` export has a 5-overload type whose last overload
// (middleware wrapper) is what vi.mocked() infers; cast to the actual
// session-lookup signature used by route handlers.
const mockAuth = vi.mocked(auth) as unknown as Mock<() => Promise<Session | null>>;
const mockGetNeonClient = vi.mocked(getNeonClient);
const mockEnsureSchema = vi.mocked(ensureSchema);
const mockLoggerWarn = vi.mocked(logger.warn);

// Tagged-template-callable stand-in for the real `neon()` client: calling
// `db\`...\`` just invokes this mock function with the template pieces.
const makeMockDb = (impl: () => Promise<unknown>) => vi.fn(impl);

const makeRequest = (body: unknown) =>
  new NextRequest('http://localhost:3000/api/agent/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const makeGetRequest = (query = '') =>
  new NextRequest(`http://localhost:3000/api/agent/tasks${query}`, {
    method: 'GET',
  });

const waitForTaskToSettle = async (
  taskId: string,
  timeoutMs = 5_000,
  pollIntervalMs = 50,
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await GET(makeGetRequest(`?id=${taskId}`));
    const data = await response.json();

    if (data.task?.status === 'completed' || data.task?.status === 'failed') {
      return data.task;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Task ${taskId} did not settle within expected time`);
};

describe('POST /api/agent/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: receipt persistence succeeds, so tests unrelated to receipt
    // handling don't need to know this plumbing exists.
    mockEnsureSchema.mockResolvedValue(undefined);
    mockGetNeonClient.mockReturnValue(
      makeMockDb(() => Promise.resolve([])) as unknown as ReturnType<typeof getNeonClient>
    );
  });

  it('should return 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const request = makeRequest({ type: 'test', payload: {} });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 401 when session has no user', async () => {
    mockAuth.mockResolvedValue({ expires: '9999-01-01' } as never);

    const request = makeRequest({ type: 'test', payload: {} });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should reject a session without a stable user id', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      expires: '9999-01-01',
    } as never);

    expect((await POST(makeRequest({ type: 'test', payload: {} }))).status).toBe(401);
    expect((await GET(makeGetRequest())).status).toBe(401);
  });

  it('should not show a task to another user who shares or lacks an email', async () => {
    const owner = { user: { name: 'a', email: null }, userId: '2001', expires: '9999-01-01' };
    mockAuth.mockResolvedValue(owner as never);
    const created = await (await POST(makeRequest({ type: 'test', payload: {} }))).json();
    const taskId = created.task.id as string;

    mockAuth.mockResolvedValue({ user: { name: 'b', email: null }, userId: '2002', expires: '9999-01-01' } as never);
    expect((await GET(makeGetRequest(`?id=${taskId}`))).status).toBe(404);
    const list = await (await GET(makeGetRequest())).json();
    expect(list.tasks.map((t: { id: string }) => t.id)).not.toContain(taskId);

    mockAuth.mockResolvedValue(owner as never);
    expect((await GET(makeGetRequest(`?id=${taskId}`))).status).toBe(200);
  });

  it('should accept a valid task with required fields and default priority', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const request = makeRequest({ type: 'build', payload: { repo: 'owner/repo' } });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.status).toBe('accepted');
    expect(data.task.type).toBe('build');
    expect(data.task.priority).toBe('normal');
    expect(data.task.id).toBeDefined();
    expect(['queued', 'in_progress', 'completed']).toContain(data.task.status);
    expect(data.queuedAt).toBeDefined();
  });

  it('should accept a valid task with explicit priority and meta', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const request = makeRequest({
      type: 'deploy',
      payload: { env: 'production' },
      priority: 'high',
      meta: { triggeredBy: 'ci' },
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.task.priority).toBe('high');
    expect(data.task.meta).toEqual({ triggeredBy: 'ci' });
  });

  it('should return 400 when body is not a JSON object', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const request = new NextRequest('http://localhost:3000/api/agent/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('not-an-object'),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid task format');
    expect(data.details).toContain('Request body must be a JSON object');
  });

  it('should return 400 when type is missing', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const request = makeRequest({ payload: {} });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid task format');
    expect(data.details).toContain('type must be a string');
  });

  it('should return 400 when payload is not an object', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const request = makeRequest({ type: 'build', payload: 'invalid' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid task format');
    expect(data.details).toContain('payload must be an object');
  });

  it('should return 400 when priority is invalid', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const request = makeRequest({ type: 'build', payload: {}, priority: 'urgent' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid task format');
    expect(data.details).toContain('priority must be one of: low, normal, high');
  });

  it('should return 400 when meta is not an object', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const request = makeRequest({ type: 'build', payload: {}, meta: 'invalid' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid task format');
    expect(data.details).toContain('meta must be an object when provided');
  });

  it('should return 400 for malformed JSON without leaking error details', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const request = new NextRequest('http://localhost:3000/api/agent/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Malformed request');
    expect(data.details).toBeUndefined();
  });

  it('should execute queued task and expose completed result via GET by id', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const createResponse = await POST(
      makeRequest({ type: 'build', payload: { repo: 'owner/repo' }, priority: 'high' })
    );
    const createData = await createResponse.json();
    const taskId = createData.task.id as string;

    const settledTask = await waitForTaskToSettle(taskId);
    expect(settledTask.status).toBe('completed');
    expect(settledTask.result).toBeDefined();
    expect(settledTask.result.type).toBe('build');
  });

  it('should expose queue summary and tasks list via GET', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    await POST(makeRequest({ type: 'deploy', payload: { env: 'staging' } }));

    const response = await GET(makeGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.tasks)).toBe(true);
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.total).toBe('number');
    expect(data.summary.total).toBeGreaterThan(0);
  });

  it('should return 404 when querying unknown task id', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const response = await GET(makeGetRequest('?id=does-not-exist'));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Task not found');
  });

  it('should require authentication on GET', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(makeGetRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should mark the task as completed with receiptPersisted: true when the receipt write succeeds', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const createResponse = await POST(
      makeRequest({ type: 'build', payload: { repo: 'owner/repo' } })
    );
    const createData = await createResponse.json();
    const taskId = createData.task.id as string;

    const settledTask = await waitForTaskToSettle(taskId);

    expect(settledTask.status).toBe('completed');
    expect(settledTask.receiptPersisted).toBe(true);
    expect(settledTask.receiptError).toBeUndefined();
  });

  it('should not crash the route or fail the task when persistReceipt fails, and should surface + log the failure', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    // Simulate the durable write to agent_task_receipts failing (e.g. the DB
    // is unreachable) while the task's own execution still succeeds.
    mockGetNeonClient.mockReturnValue(
      makeMockDb(() => Promise.reject(new Error('connection terminated unexpectedly'))) as unknown as ReturnType<
        typeof getNeonClient
      >
    );

    const createResponse = await POST(
      makeRequest({ type: 'build', payload: { repo: 'owner/repo' } })
    );
    const createData = await createResponse.json();
    const taskId = createData.task.id as string;

    // The route must not throw / crash despite the receipt write failing.
    const settledTask = await waitForTaskToSettle(taskId);

    // The task's own result is unaffected by the receipt-persistence failure.
    expect(settledTask.status).toBe('completed');
    expect(settledTask.result).toBeDefined();

    // The failure is surfaced on the task rather than silently swallowed.
    expect(settledTask.receiptPersisted).toBe(false);
    expect(settledTask.receiptError).toContain('connection terminated unexpectedly');

    // The failure is also logged loudly server-side, matching this
    // codebase's logger.warn convention for discoverable-but-non-fatal issues.
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to persist receipt for task ${taskId}`),
      expect.any(Error)
    );
  });

  it('should surface a receipt-persistence failure for a failed task too, without masking the task error', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'testuser', email: 'test@example.com' },
      userId: '1001',
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    mockGetNeonClient.mockReturnValue(
      makeMockDb(() => Promise.reject(new Error('write failed'))) as unknown as ReturnType<typeof getNeonClient>
    );

    // type: 'fail' triggers executeTaskSimulated's deliberate failure path
    // (see lib/agent-bridge.ts) when the motor-pool runtime is unreachable,
    // which is always true in this test environment.
    const createResponse = await POST(
      makeRequest({ type: 'fail', payload: { repo: 'owner/repo' } })
    );
    const createData = await createResponse.json();
    const taskId = createData.task.id as string;

    const settledTask = await waitForTaskToSettle(taskId);

    // The task's own failure (unrelated to receipt persistence) is preserved.
    expect(settledTask.status).toBe('failed');
    expect(settledTask.error).toBeDefined();

    // A receipt-persistence failure must still be recorded and must not
    // overwrite/mask the task's own error.
    expect(settledTask.receiptPersisted).toBe(false);
    expect(settledTask.receiptError).toContain('write failed');
  });
});

describe('Agent Task Queue Route Export', () => {
  it('should export POST and GET functions', () => {
    expect(POST).toBeDefined();
    expect(typeof POST).toBe('function');
    expect(GET).toBeDefined();
    expect(typeof GET).toBe('function');
  });
});
