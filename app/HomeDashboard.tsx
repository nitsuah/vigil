"use client";

import { Toast } from '@/components/Toast';
import { PRPreviewModal } from '@/components/PRPreviewModal';
import GuidedTour from '@/components/GuidedTour';
import { VisitorIntro } from '@/components/VisitorIntro';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Header from '@/components/Header';
import { RepoTableRow } from '@/components/dashboard/RepoTableRow';
import { useRepos, useRepoDetails, useRepoExpansion, useRepoPolling } from '@/hooks/useDashboard';
import { useRepoActions } from '@/hooks/useRepoActions';
import { MobileRepoCard } from '@/components/dashboard/MobileRepoCard';
import { useRepoFilters } from '@/hooks/useRepoFilters';
import { useRepoChat, EPHEMERAL_CHAT_IDENTITY } from '@/hooks/useRepoChat';
import { RepoChatPanel } from '@/components/chat/RepoChatPanel';
import { SettingsModal } from '@/components/SettingsModal';
import { resolveDocTargetPath } from '@/lib/doc-target-paths';
import { detectRepoType, RepoType } from '@/lib/repo-type';
import { byokPromptKey } from '@/lib/byok-prompt-key';
import { ProgressToast, type SyncPhase } from '@/components/ProgressToast';
import { driveSync, rememberSyncSession, recallSyncSession } from '@/lib/sync-driver';
import type { Repo } from '@/types/repo';
import type { RepoTier } from '@/lib/repo-tier';

export default function Dashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const [showHidden, setShowHidden] = useState(false);
  const { repos, setRepos, loading, refetch } = useRepos(showHidden);
  const { repoDetails, loadingDetails, fetchRepoDetails } = useRepoDetails();
  const { expandedRepos, toggleRepo } = useRepoExpansion();

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tier edits update the shared list so filters and both row layouts agree.
  const handleTierChange = (repoId: string, tier: RepoTier | null) =>
    setRepos((prev) => prev.map((r) => (r.id === repoId ? { ...r, tier } : r)));
  const [syncing, setSyncing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [addRepoUrl, setAddRepoUrl] = useState('');
  const [addRepoType, setAddRepoType] = useState<RepoType>('unknown');
  // Progress toast state
  const [syncProgress, setSyncProgress] = useState<{
    sessionId: string;
    phase: SyncPhase;
    progress: number;
    currentRepo: string;
    totalRepos: number;
    completedRepos: number;
  } | null>(null);
  // Global expand/collapse for health and docs panels — toggling one
  // expands/collapses all repos at once, saving clicks.
  const [expandedHealth, setExpandedHealth] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState(false);
  const toggleHealthExpanded = () => setExpandedHealth((v) => !v);
  const toggleDocsExpanded = () => setExpandedDocs((v) => !v);
  const [showTour, setShowTour] = useState(false);
  const [resumeTour, setResumeTour] = useState(false);
  const [chatRepoName, setChatRepoName] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // One chat thread ("friend") per repo, persisted across sessions.
  const { getThread, sendMessage, clearThread, dismissProposal, sendingRepo, error: chatError } = useRepoChat(
    // Keyed on the stable account id. While the session loads, or when it has no id,
    // threads stay in memory only (never the shared signed-out namespace).
    sessionStatus === 'loading' ? EPHEMERAL_CHAT_IDENTITY : session ? (session.userId ?? EPHEMERAL_CHAT_IDENTITY) : null,
    session?.user?.email,
  );

  const {
    addingRepo,
    fixingDoc,
    syncingRepo,
    generatingSummary,
    previewModalOpen,
    previewFiles,
    previewRepoName,
    previewMode,
    setPreviewModalOpen,
    setPreviewFiles,
    setPreviewRepoName,
    setPreviewMode,
    handleAddRepo,
    handleRemoveRepo,
    handleRestoreRepo,
    handleDeleteRepo,
    handleFixAllDocs,
    handleFixDoc,
    handleFixStandard,
    handleFixAllStandards,
    handleFixPractice,
    handleFixAllPractices,
    handleGenerateSummary,
    handleSyncSingleRepo,
    confirmPRCreation,
  } = useRepoActions(refetch, setRepos, setToastMessage);

  const {
    filterType,
    setFilterType,
    filterLanguage,
    setFilterLanguage,
    filterFork,
    setFilterFork,
    filterTier,
    setFilterTier,
    sortField,
    sortDirection,
    handleSort,
    setSort,
    languages,
    filteredRepos,
    clearFilters,
  } = useRepoFilters(repos);

  // Only the most recent sync may touch the progress bar: a second "Sync All"
  // can start while an older one is still running, and the older loop must not
  // update or clear the newer bar. Aborting also stops the loop on unmount.
  const activeSyncSessionRef = useRef<string | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // Track the active run independently from the dismissible progress panel.
  const [runActive, setRunActive] = useState(false);

  // Pull the freshly synced data into the table (and any expanded rows).
  const reloadAfterSync = async () => {
    await refetch();
    Array.from(expandedRepos).forEach(name => fetchRepoDetails(name, true));
  };

  // Calls the batch endpoint until the run ends. Nothing runs server-side
  // after a response, so this loop is what makes the sync progress.
  const driveSyncRun = async (sessionId: string, start: { cursor: number; phase: string }) => {
    syncAbortRef.current?.abort();
    const controller = new AbortController();
    syncAbortRef.current = controller;
    activeSyncSessionRef.current = sessionId;
    setRunActive(true);
    const isActive = () => activeSyncSessionRef.current === sessionId && !controller.signal.aborted;

    const result = await driveSync({
      sessionId,
      start,
      signal: controller.signal,
      onProgress: (progress) => {
        if (!isActive()) return;
        setSyncProgress(prev => prev ? {
          ...prev,
          phase: progress.phase,
          progress: progress.progressPercentage ?? 0,
          currentRepo: progress.currentRepo || 'Processing...',
          totalRepos: progress.totalRepos ?? prev.totalRepos,
          completedRepos: progress.completedRepos ?? 0,
        } : null);
      },
    });
    if (!isActive()) return; // superseded or unmounted: leave the newer run's UI alone
    // Keep the saved run after a recoverable failure (outage) so a reload can continue it;
    // clear it once the run ended or can never advance.
    if (result.status !== 'failed') rememberSyncSession(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rate-limit-refresh'));
    }
    // A stopped sync still wrote the repos it finished; show them either way.
    await reloadAfterSync();
    if (isActive()) setRunActive(false);
    const progress = result.progress;
    const failed = progress?.failedRepos ?? 0;
    // Leave the finished panel up briefly, then swap it for a one-line summary.
    setTimeout(() => {
      if (activeSyncSessionRef.current !== sessionId) return;
      setSyncProgress(null);
      if (result.status === 'complete') {
        const total = progress?.totalRepos ?? 0;
        setToastMessage(failed > 0
          ? `Sync complete · ${Math.max(0, total - failed)} of ${total} repositories updated, ${failed} failed`
          : `Sync complete · ${total} repositories updated`);
      } else if (result.status === 'unauthorized') {
        setToastMessage('Sync stopped: please sign in again, then run it again.');
      } else if (result.status === 'lost') {
        setToastMessage('That sync can no longer be continued. Run Sync again to start a new one.');
      } else if (result.message && result.message !== 'Sync failed') {
        // The server puts the reason (e.g. the rate-limit reset) in currentRepo.
        setToastMessage(`Sync stopped: ${result.message}`);
      } else {
        setToastMessage('Sync failed. Check the server logs, then try again.');
      }
    }, 1500);
  };

  // The loop reports its own outcomes; this only catches an unexpected throw (e.g. the reload after a run).
  const reportDriverError = () => {
    setRunActive(false);
    setSyncProgress(null);
    setToastMessage('Sync stopped unexpectedly. Reload to continue it, or run Sync again.');
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await fetch('/api/sync-repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterType, filterLanguage, filterFork }),
      });
      if (res.ok) {
        const data = await res.json();
        // Navigated away while the start request was in flight: leave the queued run to be resumed later.
        if (!mountedRef.current) return;
        // Refresh the rate-limit indicator right away; don't make it wait on
        // (or depend on) the repo list reload below.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('rate-limit-refresh'));
        }
        if (data.sessionId) {
          setSyncProgress({
            sessionId: data.sessionId,
            phase: data.phase ?? 'metadata',
            progress: 0,
            currentRepo: 'Starting...',
            totalRepos: data.totalRepos,
            completedRepos: 0,
          });
          // Remember the run so a reload resumes it.
          rememberSyncSession(data.sessionId);
          // The progress panel reports from here on; results reload when the loop ends.
          driveSyncRun(data.sessionId, { cursor: 0, phase: data.phase ?? 'metadata' }).catch(reportDriverError);
        } else {
          await reloadAfterSync();
          setToastMessage(data.message || 'Sync queued');
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        setToastMessage(`Sync failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch {
      setToastMessage('Failed to sync repos - network error');
    } finally {
      setSyncing(false);
    }
  };

  // Resume a run interrupted by a reload or navigation. A run that is gone or
  // was left by the old background sync (never advances) is dropped quietly.
  useEffect(() => {
    const sessionId = recallSyncSession();
    if (!sessionId || sessionStatus !== 'authenticated') return;
    if (activeSyncSessionRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sync-progress?sessionId=${encodeURIComponent(sessionId)}`);
        if (cancelled || activeSyncSessionRef.current) return; // a newer sync started meanwhile
        if (!res.ok) {
          if (res.status === 404 || res.status === 401) rememberSyncSession(null);
          return;
        }
        const progress = await res.json();
        if (cancelled || activeSyncSessionRef.current) return; // a newer sync started meanwhile
        if (progress.phase !== 'metadata' && progress.phase !== 'health') {
          rememberSyncSession(null);
          return;
        }
        setSyncProgress({
          sessionId,
          phase: progress.phase,
          progress: progress.progressPercentage ?? 0,
          currentRepo: progress.currentRepo || 'Resuming...',
          totalRepos: progress.totalRepos,
          completedRepos: progress.completedRepos ?? 0,
        });
        driveSyncRun(sessionId, { cursor: progress.cursor ?? 0, phase: progress.phase }).catch(reportDriverError);
      } catch {
        // Leave the remembered run for the next load.
      }
    })();
    return () => { cancelled = true; };
    // driveSyncRun only closes over refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  // Stop the loop when the dashboard goes away; the run stays resumable.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      syncAbortRef.current?.abort();
      activeSyncSessionRef.current = null;
    };
  }, []);

  const onAddRepoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleAddRepo(addRepoUrl, addRepoType);
    if (success) {
      setAddRepoUrl('');
      setAddRepoType('unknown');
      setShowAddRepo(false);
    }
  };

  const handleToggleExpanded = (repoName: string) => {
    if (!expandedRepos.has(repoName)) {
      fetchRepoDetails(repoName);
    }
    toggleRepo(repoName);
  };

  // The chat panel's context is rebuilt server-side from the same tables the
  // dashboard reads, so opening it only needs the repo name.
  const chatRepo = chatRepoName ? repos.find((r: Repo) => r.name === chatRepoName) : undefined;
  const chatRepoType: RepoType | undefined = chatRepo
    ? ((chatRepo.repo_type as RepoType | undefined)
      ?? detectRepoType(chatRepo.name, chatRepo.description, chatRepo.language, chatRepo.topics).type)
    : undefined;

  const handleSyncAndRefresh = useCallback(async (repoName: string): Promise<void> => {
    await handleSyncSingleRepo(repoName, () => {
      // Force re-fetch without invalidating first — avoids flash of empty expanded panel
      fetchRepoDetails(repoName, true);
    });
  }, [handleSyncSingleRepo, fetchRepoDetails]);

  // Poll expanded panels every 5 minutes: re-syncs the repo then re-fetches
  // detail data. The timer resets if the panel is collapsed before it fires.
  useRepoPolling(expandedRepos, handleSyncAndRefresh);

  // Pre-fetch details for all repos in the background after initial load so
  // health breakdown popups and doc icons are immediately available.
  // Re-runs whenever `repos` changes: the cleanup cancels pending timers, so a
  // one-shot guard would leave those repos unloaded (#281). fetchRepoDetails
  // skips repos already loaded or loading, so rescheduling is idempotent.
  useEffect(() => {
    if (loading || repos.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    repos.forEach((repo: Repo, i: number): void => {
      // Stagger by 80ms per repo to avoid hammering the API
      timers.push(setTimeout(() => fetchRepoDetails(repo.name), i * 80));
    });
    return () => timers.forEach(clearTimeout);
  }, [loading, repos, fetchRepoDetails]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-400">Loading repositories...</div>
      </div>
    );
  }

  const syncRunning = syncing || runActive;

  return (
    <>
      <Header
        repoCount={{ filtered: filteredRepos.length, total: repos.length }}
        showAddRepo={showAddRepo}
        addRepoUrl={addRepoUrl}
        addRepoType={addRepoType}
        addingRepo={addingRepo}
        showFilters={showFilters}
        syncing={syncRunning}
        isAuthenticated={!!session}
        filterType={filterType}
        filterLanguage={filterLanguage}
        filterFork={filterFork}
        filterTier={filterTier}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={setSort}
        languages={languages}
        onAddRepoUrlChange={setAddRepoUrl}
        onAddRepoTypeChange={setAddRepoType}
        onAddRepoSubmit={onAddRepoSubmit}
        onToggleAddRepo={() => setShowAddRepo(!showAddRepo)}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onSync={handleSync}
        onFilterTypeChange={setFilterType}
        onFilterLanguageChange={setFilterLanguage}
        onFilterForkChange={setFilterFork}
        onFilterTierChange={setFilterTier}
        onClearFilters={clearFilters}
        onStartTour={() => { setResumeTour(false); setShowTour(true); }}
        showHidden={showHidden}
        onToggleHidden={() => setShowHidden(!showHidden)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 space-y-4 md:space-y-6">
        {!session && <VisitorIntro onStartTour={(resume) => { setResumeTour(resume); setShowTour(true); }} />}
        {filteredRepos.length === 0 ? (
          <div className="glass rounded-lg p-8 sm:p-12 text-center">
            <p className="text-slate-400 text-lg">No repositories found</p>
            <p className="text-slate-500 text-sm mt-2">
              {repos.length > 0
                ? 'No repositories match the current filters.'
                : session
                  ? 'Sync to fetch your GitHub repositories.'
                  : 'Sign in with GitHub to track your own repositories.'}
            </p>
            {session ? (
              <button
                type="button"
                onClick={handleSync}
                disabled={syncRunning}
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {syncRunning ? 'Syncing...' : 'Sync repositories'}
              </button>
            ) : (
              <a href="/login" className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                Sign in with GitHub
              </a>
            )}
          </div>
        ) : (
          <div className="glass rounded-lg overflow-hidden">
            {/* Mobile card list — shown below md */}
            <div className="md:hidden divide-y divide-slate-800/60">
              {filteredRepos.map((repo) => (
                <MobileRepoCard
                  key={repo.id}
                  repo={repo}
                  details={repoDetails[repo.name]}
                  isLoadingDetails={loadingDetails.has(repo.name)}
                  isExpanded={expandedRepos.has(repo.name)}
                  syncingRepo={syncingRepo}
                  generatingSummary={generatingSummary}
                  isAuthenticated={!!session}
                  onToggleHealth={toggleHealthExpanded}
                  onToggleExpanded={() => handleToggleExpanded(repo.name)}
                  onRemove={() => handleRemoveRepo(repo.name)}
                  onFixAllDocs={() => handleFixAllDocs(repo.full_name)}
                  onFixDoc={(type) => handleFixDoc(repo.full_name, type)}
                  onFixStandard={(type) => handleFixStandard(repo.full_name, type)}
                  onFixAllStandards={() => handleFixAllStandards(repo.full_name)}
                  onFixPractice={(type) => handleFixPractice(repo.full_name, type)}
                  onFixAllPractices={() => handleFixAllPractices(repo.full_name)}
                  onGenerateSummary={() => handleGenerateSummary(repo.name)}
                  onSyncSingleRepo={() => handleSyncAndRefresh(repo.name)}
                  onUnhide={() => handleRestoreRepo(repo.name)}
                  onDelete={() => handleDeleteRepo(repo.name)}
                  onOpenChat={session ? () => setChatRepoName(repo.name) : undefined}
                  onTierChange={(tier) => handleTierChange(repo.id, tier)}
                />
              ))}
            </div>

            {/* Desktop table — shown at md and above */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50 border-b border-slate-700">
                  <tr>
                    <th
                      className="px-3 md:px-6 py-3 md:py-4 text-left text-sm font-semibold text-slate-300"
                      aria-sort={sortField === 'name' || sortField === 'tier' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      {/* The tier badge lives in this cell, so tier sorts from here too. */}
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => handleSort('name')}
                          className="flex items-center gap-2 hover:text-purple-400 transition-colors"
                        >
                          Repository
                          {sortField === 'name' && (
                            <span className="text-purple-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                        <button
                          onClick={() => handleSort('tier')}
                          className="flex items-center gap-2 text-xs text-slate-400 hover:text-purple-400 transition-colors"
                        >
                          Tier
                          {sortField === 'tier' && (
                            <span className="text-purple-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </div>
                    </th>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-left text-sm font-semibold text-slate-300 hidden xl:table-cell">
                      Description
                    </th>
                    <th
                      className="px-3 md:px-6 py-3 md:py-4 text-left text-sm font-semibold text-slate-300"
                      aria-sort={sortField === 'health' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        onClick={() => handleSort('health')}
                        className="flex items-center gap-2 hover:text-purple-400 transition-colors"
                      >
                        Health
                        {sortField === 'health' && (
                          <span className="text-purple-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-left text-sm font-semibold text-slate-300 hidden sm:table-cell">
                      Docs
                    </th>
                    <th className="px-3 md:px-6 py-3 md:py-4 text-left text-sm font-semibold text-slate-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredRepos.map((repo) => (
                    <RepoTableRow
                      key={repo.id}
                      repo={repo}
                      details={repoDetails[repo.name]}
                      isLoadingDetails={loadingDetails.has(repo.name)}
                      isExpanded={expandedRepos.has(repo.name)}
                      fixingDoc={fixingDoc}
                      syncingRepo={syncingRepo}
                      generatingSummary={generatingSummary}
                      isAuthenticated={!!session}
                      expandedHealth={expandedHealth}
                      onToggleHealth={toggleHealthExpanded}
                      expandedDocs={expandedDocs}
                      onToggleDocs={toggleDocsExpanded}
                      onToggleExpanded={() => handleToggleExpanded(repo.name)}
                      onRemove={() => handleRemoveRepo(repo.name)}
                      onFixAllDocs={() => handleFixAllDocs(repo.full_name)}
                      onFixDoc={(type) => handleFixDoc(repo.full_name, type)}
                      onFixStandard={(type) => handleFixStandard(repo.full_name, type)}
                      onFixAllStandards={() => handleFixAllStandards(repo.full_name)}
                      onFixPractice={(type) => handleFixPractice(repo.full_name, type)}
                      onFixAllPractices={() => handleFixAllPractices(repo.full_name)}
                      onGenerateSummary={() => handleGenerateSummary(repo.name)}
                      onSyncSingleRepo={() => handleSyncAndRefresh(repo.name)}
                      onUnhide={() => handleRestoreRepo(repo.name)}
                      onDelete={() => handleDeleteRepo(repo.name)}
                      onOpenChat={session ? () => setChatRepoName(repo.name) : undefined}
                      onTierChange={(tier) => handleTierChange(repo.id, tier)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <RepoChatPanel
        isOpen={chatRepoName !== null}
        repoName={chatRepoName}
        repoType={chatRepoType}
        healthScore={chatRepo?.health_score ?? null}
        messages={chatRepoName ? getThread(chatRepoName) : []}
        // sendMessage only supports one in-flight request at a time (a single
        // `sendingRepo` in the hook), so the composer must disable whenever
        // ANY repo has a pending request — not just the one currently shown.
        // Otherwise switching the panel to a different repo mid-request lets
        // the user submit there too; sendMessage silently no-ops (its own
        // `sendingRepo` guard), but the panel had already cleared the draft.
        sending={sendingRepo !== null}
        error={chatError}
        onClose={() => setChatRepoName(null)}
        onSend={(text: string): void => {
          if (!chatRepoName) return;
          // First-ever AI use in this browser for this identity: nudge
          // toward Settings once, non-blockingly, rather than gating the
          // send on it. BYOK's actual fallback-to-shared-key behavior
          // doesn't depend on this notice; it's a courtesy heads-up.
          try {
            const promptKey = byokPromptKey(session?.user?.email);
            if (session?.user?.email && !window.localStorage.getItem(promptKey)) {
              window.localStorage.setItem(promptKey, '1');
              setToastMessage("Using Vigil's shared AI key. Add your own in Settings (gear icon) if you want higher limits.");
            }
          } catch {
            // localStorage unavailable — skip the nudge, not fatal.
          }
          void sendMessage(chatRepoName, text);
        }}
        onClear={() => { if (chatRepoName) clearThread(chatRepoName); }}
        onApplyProposal={(proposal) => {
          if (!chatRepoName) return;
          // Open the preview modal with the proposed content
          // Use the same docType -> path mapping fix-doc/route.ts validates
          // against, rather than guessing `${docType.toUpperCase()}.md` — that
          // guess was wrong for outliers like `license` (no extension) and
          // `codeowners`/`funding` (live under .github/), which made the
          // Apply action 400 for those doc types.
          const resolvedPath = resolveDocTargetPath(proposal.docType);
          if (!resolvedPath) {
            // Don't synthesize a fallback path (e.g. "UNKNOWN.md") — that
            // would open a preview the Apply action can only reject with a
            // 400 anyway, since fix-doc/route.ts validates against this
            // same map. Tell the user instead of showing a broken preview.
            setToastMessage(
              `"${proposal.docType}" isn't a supported document type, so this proposal can't be applied.`,
            );
            return;
          }
          const proposalFiles = [{
            type: 'doc' as const,
            docType: proposal.docType,
            path: resolvedPath,
            content: proposal.content,
            practiceType: undefined,
          }];
          setPreviewFiles(proposalFiles);
          setPreviewRepoName(chatRepoName);
          setPreviewMode('single');
          setPreviewModalOpen(true);
        }}
        onApplyTaskProposal={async (taskProposal) => {
          if (!chatRepoName) return;
          try {
            const res = await fetch(`/api/repos/${encodeURIComponent(chatRepoName)}/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(taskProposal),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              const msg = data?.error || `Task operation failed (${res.status})`;
              setToastMessage(msg);
              return;
            }
            // Success: dismiss proposal and show PR link
            dismissProposal(chatRepoName, taskProposal.taskId || '');
            if (data.prUrl) {
              setToastMessage(`Task ${taskProposal.operation.replace('_', ' ')} complete — PR created: ${data.prUrl}`);
            } else {
              setToastMessage(`Task ${taskProposal.operation.replace('_', ' ')} complete`);
            }
          } catch {
            setToastMessage('Network error - could not apply task operation');
          }
        }}
        onDismissProposal={(messageId) => {
          if (chatRepoName) dismissProposal(chatRepoName, messageId);
        }}
      />
      {showTour && <GuidedTour resume={resumeTour} onClose={() => setShowTour(false)} />}
      {toastMessage && <Toast message={toastMessage} raised={!!syncProgress} onClose={() => setToastMessage(null)} />}
      {syncProgress && (
        <ProgressToast
          phase={syncProgress.phase}
          progress={syncProgress.progress}
          currentRepo={syncProgress.currentRepo}
          totalRepos={syncProgress.totalRepos}
          completedRepos={syncProgress.completedRepos}
          onClose={() => setSyncProgress(null)}
        />
      )}
      <PRPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        repoName={previewRepoName}
        files={previewFiles}
        onConfirm={confirmPRCreation}
        loading={fixingDoc}
        mode={previewMode}
      />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userIdentity={session?.user?.email}
      />
    </>
  );
}
