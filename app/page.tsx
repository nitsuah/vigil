"use client";

import { Toast } from '@/components/Toast';
import { PRPreviewModal } from '@/components/PRPreviewModal';
import GuidedTour from '@/components/GuidedTour';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Header from '@/components/Header';
import { RepoTableRow } from '@/components/dashboard/RepoTableRow';
import { useRepos, useRepoDetails, useRepoExpansion, useRepoPolling } from '@/hooks/useDashboard';
import { useRepoActions } from '@/hooks/useRepoActions';
import { MobileRepoCard } from '@/components/dashboard/MobileRepoCard';
import { useRepoFilters } from '@/hooks/useRepoFilters';
import { useRepoChat } from '@/hooks/useRepoChat';
import { RepoChatPanel } from '@/components/chat/RepoChatPanel';
import { SettingsModal } from '@/components/SettingsModal';
import { resolveDocTargetPath } from '@/lib/doc-target-paths';
import { detectRepoType, RepoType } from '@/lib/repo-type';
import { byokPromptKey } from '@/lib/byok-prompt-key';
import { ProgressToast } from '@/components/ProgressToast';
import type { Repo } from '@/types/repo';

export default function Dashboard() {
  const { data: session } = useSession();
  const [showHidden, setShowHidden] = useState(false);
  const { repos, setRepos, loading, refetch } = useRepos(showHidden);
  const { repoDetails, loadingDetails, fetchRepoDetails } = useRepoDetails();
  const { expandedRepos, toggleRepo } = useRepoExpansion();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [addRepoUrl, setAddRepoUrl] = useState('');
  const [addRepoType, setAddRepoType] = useState<RepoType>('unknown');
  // Progress toast state
  const [syncProgress, setSyncProgress] = useState<{
    sessionId: string;
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
  const [chatRepoName, setChatRepoName] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // One chat thread ("friend") per repo, persisted across sessions.
  const { getThread, sendMessage, clearThread, dismissProposal, sendingRepo, error: chatError } = useRepoChat(session?.user?.email);

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
    sortField,
    sortDirection,
    handleSort,
    languages,
    filteredRepos,
    clearFilters,
  } = useRepoFilters(repos);

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
        // Start progress tracking
        if (data.sessionId) {
          setSyncProgress({
            sessionId: data.sessionId,
            progress: 0,
            currentRepo: 'Starting...',
            totalRepos: data.totalRepos,
            completedRepos: 0,
          });
          // Poll for progress
          pollSyncProgress(data.sessionId);
        }
        await refetch();
        // Re-fetch details for expanded repos in the background — don't clear first to avoid flash
        const expanded = Array.from(expandedRepos);
        expanded.forEach(name => fetchRepoDetails(name, true));
        setToastMessage(data.message || 'Sync started successfully!');
      } else {
        const errorData = await res.json();
        setToastMessage(`Sync failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch {
      setToastMessage('Failed to sync repos - network error');
    } finally {
      setSyncing(false);
    }
  };

  const pollSyncProgress = async (sessionId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/sync-progress?sessionId=${sessionId}`);
        if (res.ok) {
          const progress = await res.json();
          setSyncProgress(prev => prev ? {
            ...prev,
            progress: progress.progressPercentage ?? 0,
            currentRepo: progress.currentRepo ?? 'Processing...',
            totalRepos: progress.totalRepos ?? prev.totalRepos,
            completedRepos: progress.completedRepos ?? 0,
          } : null);
          
          if (progress.phase !== 'complete' && progress.phase !== 'error') {
            setTimeout(poll, 1000);
          } else {
            // Sync complete, hide toast after delay
            setTimeout(() => setSyncProgress(null), 2000);
          }
        }
      } catch {
        // Ignore polling errors
        setTimeout(poll, 1000);
      }
    };
    await poll();
  };

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
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (loading || repos.length === 0 || prefetchedRef.current) return;
    prefetchedRef.current = true;
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

  return (
    <>
      <Header
        repoCount={{ filtered: filteredRepos.length, total: repos.length }}
        showAddRepo={showAddRepo}
        addRepoUrl={addRepoUrl}
        addRepoType={addRepoType}
        addingRepo={addingRepo}
        showFilters={showFilters}
        syncing={syncing}
        isAuthenticated={!!session}
        filterType={filterType}
        filterLanguage={filterLanguage}
        filterFork={filterFork}
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
        onClearFilters={clearFilters}
        onStartTour={() => setShowTour(true)}
        showHidden={showHidden}
        onToggleHidden={() => setShowHidden(!showHidden)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 space-y-4 md:space-y-6">
        {filteredRepos.length === 0 ? (
          <div className="glass rounded-lg p-8 sm:p-12 text-center">
            <p className="text-slate-400 text-lg">No repositories found</p>
            <p className="text-slate-500 text-sm mt-2">
              Click &quot;Sync Repos&quot; to fetch your GitHub repositories
            </p>
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
                  onOpenChat={session ? () => setChatRepoName(repo.name) : undefined}
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
                      aria-sort={sortField === 'name' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-2 hover:text-purple-400 transition-colors"
                      >
                        Repository
                        {sortField === 'name' && (
                          <span className="text-purple-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
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
                      onOpenChat={session ? () => setChatRepoName(repo.name) : undefined}
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
        onDismissProposal={(messageId) => {
          if (chatRepoName) dismissProposal(chatRepoName, messageId);
        }}
      />
      {showTour && <GuidedTour onClose={() => setShowTour(false)} />}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      {syncProgress && (
        <ProgressToast
          isVisible={true}
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
