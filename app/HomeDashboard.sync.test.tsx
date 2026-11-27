import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Dashboard from './HomeDashboard';

vi.mock('next-auth/react', () => {
  const session = { data: { user: { name: 'u' } }, status: 'authenticated' };
  return { useSession: () => session };
});
vi.mock('@/components/Header', () => ({ default: () => null }));
vi.mock('@/hooks/useDashboard', () => ({
  useRepos: () => ({ repos: [], setRepos: vi.fn(), loading: false, refetch: vi.fn() }),
  useRepoDetails: () => ({ repoDetails: {}, loadingDetails: new Set(), fetchRepoDetails: vi.fn() }),
  useRepoExpansion: () => ({ expandedRepos: new Set(), toggleRepo: vi.fn() }),
  useRepoPolling: vi.fn(),
}));
vi.mock('@/hooks/useRepoActions', () => ({ useRepoActions: () => ({ previewFiles: [] }) }));
vi.mock('@/hooks/useRepoChat', () => ({
  EPHEMERAL_CHAT_IDENTITY: 'ephemeral',
  useRepoChat: () => ({ getThread: () => [] }),
}));
vi.mock('@/components/PRPreviewModal', () => ({ PRPreviewModal: () => null }));
vi.mock('@/components/SettingsModal', () => ({ SettingsModal: () => null }));
vi.mock('@/components/chat/RepoChatPanel', () => ({ RepoChatPanel: () => null }));
// A run that never ends.
vi.mock('@/lib/sync-driver', () => ({
  driveSync: (options: { onProgress: (progress: { phase: string; progressPercentage: number; currentRepo: string; totalRepos: number; completedRepos: number }) => void }) => {
    options.onProgress({ phase: 'metadata', progressPercentage: 0, currentRepo: 'Starting...', totalRepos: 3, completedRepos: 0 });
    return new Promise(() => {});
  },
  rememberSyncSession: vi.fn(),
  recallSyncSession: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Dashboard empty-state sync button', () => {
  it('stays disabled when the progress panel is hidden during a run', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sessionId: 's1', totalRepos: 3 }))));
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Sync repositories' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hide sync progress' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Hide sync progress' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Syncing...' }).hasAttribute('disabled')).toBe(true);
  });
});
