import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSyncProgress,
  updateSyncProgress,
  getSyncProgress,
  deleteSyncProgress,
  getProgressPercentage,
  getProgressWithPercentage,
  SyncProgress
} from '../lib/sync-progress';

// Mock the database - Neon client is a tagged template literal function
const mockQuery = vi.fn();

vi.mock('../lib/db', () => ({
  getNeonClient: () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
    return mockQuery(query, values);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Use implementation that checks query to return appropriate mock data
  mockQuery.mockImplementation((query: string) => {
    if (query.includes('INSERT INTO sync_progress')) {
      // Extract values from query for verification - return mock insert result
      return Promise.resolve([{ session_id: 'test-1', github_user_id: 'user-1', total_repos: 5 }]);
    }
    if (query.includes('DELETE FROM sync_progress')) {
      return Promise.resolve([]);
    }
    if (query.includes('UPDATE sync_progress')) {
      return Promise.resolve([]);
    }
    if (query.includes('SELECT') && query.includes('WHERE session_id =')) {
      // Return empty by default - tests that need data will override
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });
});

afterEach(() => {
  mockQuery.mockReset();
});

test('createSyncProgress inserts record with correct values', async () => {
  mockQuery.mockResolvedValueOnce([{ session_id: 'test-1', github_user_id: 'user-1', total_repos: 5 }]);

  await createSyncProgress('test-1', 'user-1', 5);

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO sync_progress'),
    expect.arrayContaining(['test-1', 'user-1', 5])
  );
});

test('createSyncProgress handles zero totalRepos', async () => {
  mockQuery.mockResolvedValueOnce([{ session_id: 'test-1', github_user_id: 'user-1', total_repos: 0 }]);

  await createSyncProgress('test-1', 'user-1', 0);

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO sync_progress'),
    expect.arrayContaining(['test-1', 'user-1', 0])
  );
});

test('getProgressPercentage calculates correctly', () => {
  expect(getProgressPercentage({ totalRepos: 10, completedRepos: 5 } as SyncProgress)).toBe(50);
  expect(getProgressPercentage({ totalRepos: 10, completedRepos: 10 } as SyncProgress)).toBe(100);
  expect(getProgressPercentage({ totalRepos: 10, completedRepos: 0 } as SyncProgress)).toBe(0);
  expect(getProgressPercentage({ totalRepos: 0, completedRepos: 0 } as SyncProgress)).toBe(100);
});

test('getProgressPercentage caps at 100', () => {
  expect(getProgressPercentage({ totalRepos: 5, completedRepos: 10 } as SyncProgress)).toBe(100);
});

test('getProgressPercentage handles fractional percentages with rounding', () => {
  expect(getProgressPercentage({ totalRepos: 3, completedRepos: 1 } as SyncProgress)).toBe(33);
  expect(getProgressPercentage({ totalRepos: 3, completedRepos: 2 } as SyncProgress)).toBe(67);
  expect(getProgressPercentage({ totalRepos: 7, completedRepos: 3 } as SyncProgress)).toBe(43);
});

test('getSyncProgress returns undefined when not found', async () => {
  mockQuery.mockResolvedValueOnce([]);

  const result = await getSyncProgress('nonexistent', 'user-1');

  expect(result).toBeUndefined();
});

test('getSyncProgress returns progress when found', async () => {
  const mockRow = {
    session_id: 'test-1',
    github_user_id: 'user-1',
    total_repos: 10,
    completed_repos: 5,
    current_repo: 'repo-1',
    phase: 'metadata',
    started_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:01:00Z'),
  };
  mockQuery.mockImplementation((query: string) => {
    if (query.includes('SELECT') && query.includes('WHERE session_id =')) {
      return Promise.resolve([mockRow]);
    }
    return Promise.resolve([]);
  });

  const result = await getSyncProgress('test-1', 'user-1');

  expect(result).toEqual({
    sessionId: 'test-1',
    githubUserId: 'user-1',
    totalRepos: 10,
    completedRepos: 5,
    currentRepo: 'repo-1',
    phase: 'metadata',
    startedAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:01:00Z'),
  });
});

test('getSyncProgress handles all phases correctly', async () => {
  const phases = ['metadata', 'health', 'complete', 'error'] as const;
  for (const phase of phases) {
    const mockRow = {
      session_id: 'test-1',
      github_user_id: 'user-1',
      total_repos: 10,
      completed_repos: 5,
      current_repo: 'repo-1',
      phase,
      started_at: new Date('2024-01-01T00:00:00Z'),
      updated_at: new Date('2024-01-01T00:01:00Z'),
    };
    mockQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT') && query.includes('WHERE session_id =')) {
        return Promise.resolve([mockRow]);
      }
      return Promise.resolve([]);
    });

    const result = await getSyncProgress('test-1', 'user-1');
    expect(result?.phase).toBe(phase);
  }
});

test('deleteSyncProgress deletes record', async () => {
  mockQuery.mockResolvedValueOnce([]);

  await deleteSyncProgress('test-1', 'user-1');

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('AND github_user_id ='),
    expect.arrayContaining(['test-1', 'user-1'])
  );
});

test('updateSyncProgress updates completedRepos', async () => {
  mockQuery.mockResolvedValue([]);

  await updateSyncProgress('test-1', { completedRepos: 7 });

  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE sync_progress SET'),
    expect.arrayContaining([7, 'test-1'])
  );
});

test('updateSyncProgress updates currentRepo', async () => {
  mockQuery.mockResolvedValue([]);

  await updateSyncProgress('test-1', { currentRepo: 'owner/repo-name' });

  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE sync_progress SET'),
    expect.arrayContaining(['owner/repo-name', 'test-1'])
  );
});

test('updateSyncProgress updates phase', async () => {
  mockQuery.mockResolvedValue([]);

  await updateSyncProgress('test-1', { phase: 'health' });

  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE sync_progress SET'),
    expect.arrayContaining(['health', 'test-1'])
  );
});

test('updateSyncProgress applies multiple fields in one atomic statement', async () => {
  mockQuery.mockResolvedValue([]);

  await updateSyncProgress('test-1', { completedRepos: 5, currentRepo: 'repo-1', phase: 'health' });

  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('COALESCE'),
    expect.arrayContaining([5, 'repo-1', 'health', 'test-1'])
  );
});

test('getSyncProgress is scoped to the owning GitHub user', async () => {
  mockQuery.mockResolvedValue([]);

  const result = await getSyncProgress('test-1', 'someone-else');

  expect(result).toBeUndefined();
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('AND github_user_id ='),
    expect.arrayContaining(['test-1', 'someone-else'])
  );
});

test('createSyncProgress reaps abandoned sessions before inserting', async () => {
  mockQuery.mockResolvedValue([]);

  await createSyncProgress('test-1', 'user-1', 3);

  expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM sync_progress WHERE updated_at <');
  expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO sync_progress');
});

test('updateSyncProgress does nothing with empty updates', async () => {
  mockQuery.mockResolvedValueOnce([]);

  await updateSyncProgress('test-1', {});

  expect(mockQuery).not.toHaveBeenCalled();
});

test('getProgressWithPercentage adds percentage', async () => {
  const mockRow = {
    session_id: 'test-1',
    github_user_id: 'user-1',
    total_repos: 10,
    completed_repos: 5,
    current_repo: 'repo-1',
    phase: 'metadata',
    started_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:01:00Z'),
  };
  mockQuery.mockImplementation((query: string) => {
    if (query.includes('SELECT') && query.includes('WHERE session_id =')) {
      return Promise.resolve([mockRow]);
    }
    return Promise.resolve([]);
  });

  const result = await getProgressWithPercentage('test-1', 'user-1');

  expect(result).toEqual({
    sessionId: 'test-1',
    githubUserId: 'user-1',
    totalRepos: 10,
    completedRepos: 5,
    currentRepo: 'repo-1',
    phase: 'metadata',
    startedAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:01:00Z'),
    progressPercentage: 50,
  });
});

test('getProgressWithPercentage returns undefined when not found', async () => {
  mockQuery.mockImplementation((query: string) => {
    if (query.includes('SELECT') && query.includes('WHERE session_id =')) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });

  const result = await getProgressWithPercentage('nonexistent', 'user-1');

  expect(result).toBeUndefined();
});