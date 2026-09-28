// Custom hooks for repository actions

import { useState } from 'react';
import { Repo, BestPractice } from '@/types/repo';

interface FilePreview {
  path: string;
  content: string;
  originalContent?: string; // For diffs when modifying existing files (e.g., deploy_badge)
  docType: string;
  type: 'doc' | 'practice';
  practiceType?: string;
  language?: string; // For syntax highlighting in modal
}

export function useRepoActions(
  refetchRepos: () => Promise<void>,
  setRepos: React.Dispatch<React.SetStateAction<Repo[]>>,
  setToastMessage: (msg: string | null) => void
) {
  const [addingRepo, setAddingRepo] = useState(false);
  const [fixingDoc, setFixingDoc] = useState(false);
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<FilePreview[]>([]);
  const [previewRepoName, setPreviewRepoName] = useState('');
  const [previewMode, setPreviewMode] = useState<'single' | 'batch'>('single');

  const handleAddRepo = async (url: string, type: string) => {
    try {
      setAddingRepo(true);
      const res = await fetch('/api/repos/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type }),
      });
      if (res.ok) {
        const data = await res.json();
        setToastMessage(`Successfully added ${data.repo.fullName}`);
        await refetchRepos();
        return true;
      } else {
        const err = await res.json();
        setToastMessage(`Failed to add repo: ${err.error}`);
        return false;
      }
    } catch (error) {
      console.error('Failed to add repo:', error);
      setToastMessage('Failed to add repo');
      return false;
    } finally {
      setAddingRepo(false);
    }
  };

  const handleRemoveRepo = async (repoName: string) => {
    try {
      const res = await fetch(`/api/repos/${repoName}/hide`, { method: 'POST' });
      if (res.ok) {
        await refetchRepos();
        setToastMessage(`Successfully hid ${repoName}`);
      } else {
        const err = await res.json();
        setToastMessage(`Failed to hide repo: ${err.error}`);
      }
    } catch (error) {
      console.error('Failed to hide repo:', error);
      setToastMessage('Failed to hide repo');
    }
  };

  const handleRestoreRepo = async (repoName: string) => {
    try {
      const res = await fetch(`/api/repos/${repoName}/unhide`, { method: 'POST' });
      if (res.ok) {
        await refetchRepos();
        setToastMessage(`Successfully restored ${repoName}`);
      } else {
        const err = await res.json();
        setToastMessage(`Failed to restore repo: ${err.error}`);
      }
    } catch (error) {
      console.error('Failed to restore repo:', error);
      setToastMessage('Failed to restore repo');
    }
  };

  const handleFixAllDocs = async (fullRepoName: string, missingDocs?: string[]) => {
    // Fetch template previews
    try {
      setFixingDoc(true);
      const repoName = fullRepoName.includes('/') ? fullRepoName.split('/')[1] : fullRepoName;

      // If no missing docs provided, fetch from repo details
      let docsToFix: string[] = missingDocs || [];
      if (!missingDocs) {
        const detailsRes = await fetch(`/api/repo-details/${repoName}`);
        if (!detailsRes.ok) {
          setToastMessage('Failed to load repository details');
          return;
        }
        const details = await detailsRes.json();
        const statuses = details.docStatuses || [];
        docsToFix = statuses
          .filter((d: { exists: boolean; doc_type: string }) => !d.exists && ['roadmap', 'tasks', 'metrics', 'features', 'readme'].includes(d.doc_type))
          .map((d: { doc_type: string }) => d.doc_type);
      }

      if (docsToFix.length === 0) {
        setToastMessage('No missing docs to fix');
        return;
      }

      const previewRes = await fetch('/api/preview-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docTypes: docsToFix, repoName: fullRepoName }),
      });

      if (previewRes.ok) {
        const { previews } = await previewRes.json();
        setPreviewFiles(previews);
        setPreviewRepoName(fullRepoName);
        setPreviewMode('batch');
        setPreviewModalOpen(true);
      } else {
        setToastMessage('Failed to load previews');
      }
    } catch (error) {
      console.error('Failed to fetch previews:', error);
      setToastMessage('Failed to load previews');
    } finally {
      setFixingDoc(false);
    }
  };

  const handleFixDoc = async (fullRepoName: string, docType: string) => {
    const repoName = fullRepoName.includes('/') ? fullRepoName.split('/')[1] : fullRepoName;
    // Show preview modal first
    try {
      setFixingDoc(true);
      const previewRes = await fetch('/api/preview-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docTypes: [docType] }),
      });

      if (previewRes.ok) {
        const { previews } = await previewRes.json();
        setPreviewFiles(previews);
        setPreviewRepoName(repoName);
        setPreviewMode('single');
        setPreviewModalOpen(true);
      } else {
        setToastMessage('Failed to load preview');
      }
    } catch (error) {
      console.error('Failed to fetch preview:', error);
      setToastMessage('Failed to load preview');
    } finally {
      setFixingDoc(false);
    }
  };

  const handleFixStandard = async (fullRepoName: string, standardType: string) => {
    // Use the preview modal flow for community standards where templates exist
    try {
      setFixingDoc(true);
      const repoName = fullRepoName.includes('/') ? fullRepoName.split('/')[1] : fullRepoName;

      const previewRes = await fetch('/api/preview-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docTypes: [standardType], repoName: fullRepoName }),
      });

      if (previewRes.ok) {
        const { previews } = await previewRes.json();
        if (previews && previews.length > 0) {
          setPreviewFiles(previews);
          setPreviewRepoName(fullRepoName);
          setPreviewMode('single');
          setPreviewModalOpen(true);
          return; // Continue via confirmPRCreation
        }
      }

      // Fallback direct PR if no preview available
      const res = await fetch(`/api/repos/${repoName}/fix-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType: standardType }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.prUrl) window.open(data.prUrl, '_blank');
        setToastMessage(`PR created for ${standardType.toUpperCase()}!`);
      } else {
        const err = await res.json();
        handlePRError(err);
      }
    } catch (error) {
      console.error('Failed to fix standard:', error);
      setToastMessage('Failed to create PR');
    } finally {
      setFixingDoc(false);
    }
  };

  const handleFixAllStandards = async (fullRepoName: string) => {
    const repoName = fullRepoName.includes('/') ? fullRepoName.split('/')[1] : fullRepoName;
    // Load previews for ALL missing supported community standards and open modal
    try {
      setFixingDoc(true);

      const detailsRes = await fetch(`/api/repo-details/${repoName}`);
      if (!detailsRes.ok) {
        setToastMessage('Failed to load repository details');
        return;
      }
      const details = await detailsRes.json();

      // Supported standards that have template mappings
      const SUPPORTED_STANDARD_TYPES = [
        'code_of_conduct',
        'contributing',
        'security',
        'changelog',
        'license',
        'codeowners',
        'copilot_instructions',
        'funding',
        'pr_template',
        'issue_template',
        'flow_tasks_prompt',
        'handoff_prompt'
      ];

      const missingStandards: string[] = (details.communityStandards || [])
        .filter((s: { status: string }) => s.status === 'missing')
        .map((s: { standard_type: string }) => s.standard_type)
        .filter((t: string) => SUPPORTED_STANDARD_TYPES.includes(t));

      if (missingStandards.length === 0) {
        setToastMessage('No fixable missing standards');
        return;
      }

      const previewRes = await fetch('/api/preview-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docTypes: missingStandards, repoName: fullRepoName }),
      });

      if (previewRes.ok) {
        const { previews } = await previewRes.json();
        setPreviewFiles(previews);
        setPreviewRepoName(fullRepoName);
        setPreviewMode('batch');
        setPreviewModalOpen(true);
      } else {
        setToastMessage('Failed to load previews');
      }
    } catch (error) {
      console.error('Failed to fetch previews:', error);
      setToastMessage('Failed to load previews');
    } finally {
      setFixingDoc(false);
    }
  };

  const handleFixPractice = async (fullRepoName: string, practiceType: string) => {
    const repoName = fullRepoName.includes('/') ? fullRepoName.split('/')[1] : fullRepoName;
    // Generate AI-powered, context-aware best practice fix
    try {
      setFixingDoc(true);

      // First, generate the AI content using prompt chain
      const generateRes = await fetch('/api/repos/generate-best-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName, practiceType }),
      });

      if (!generateRes.ok) {
        const err = await generateRes.json();
        setToastMessage(err.error || 'Failed to generate fix');
        setFixingDoc(false);
        return;
      }

      const { content } = await generateRes.json();

      // Show generated content in modal for review
      const fileName = getFileNameForPractice(practiceType);
      setPreviewFiles([{
        path: fileName,
        content: content,
        language: getLanguageForPractice(practiceType),
        docType: practiceType,
        type: 'practice',
        practiceType: practiceType,
      }]);
      setPreviewRepoName(repoName);
      setPreviewMode('single');
      setPreviewModalOpen(true);

    } catch (error) {
      console.error('Failed to fix practice:', error);
      setToastMessage('Failed to generate fix');
    } finally {
      setFixingDoc(false);
    }
  };

  // Helper to get file name for practice type
  const getFileNameForPractice = (practiceType: string): string => {
    switch (practiceType) {
      case 'deploy_badge': return 'README.md';
      case 'env_template': return '.env.example';
      case 'docker': return 'Dockerfile';
      case 'dependabot': return '.github/dependabot.yml';
      case 'ci_cd': return '.github/workflows/ci.yml';
      case 'gitignore': return '.gitignore';
      case 'pre_commit_hooks': return '.pre-commit-config.yaml';
      case 'testing_framework': return 'vitest.config.ts';
      case 'linting': return 'eslint.config.mjs';
      default: return practiceType;
    }
  };

  // Helper to get syntax highlighting language
  const getLanguageForPractice = (practiceType: string): string => {
    switch (practiceType) {
      case 'deploy_badge': return 'markdown';
      case 'env_template': return 'shell';
      case 'docker': return 'dockerfile';
      case 'dependabot': return 'yaml';
      case 'ci_cd': return 'yaml';
      case 'gitignore': return 'text';
      case 'pre_commit_hooks': return 'yaml';
      case 'testing_framework': return 'typescript';
      case 'linting': return 'javascript';
      default: return 'text';
    }
  };

  const handleFixAllPractices = async (fullRepoName: string) => {
    // Load templates for all missing best practices - AI enrichment happens in modal
    try {
      setFixingDoc(true);

      // Extract just the repo name for database lookup
      const repoName = fullRepoName.includes('/') ? fullRepoName.split('/')[1] : fullRepoName;

      // Get repo details to check which practices are actually missing
      const detailsRes = await fetch(`/api/repo-details/${repoName}`);
      if (!detailsRes.ok) {
        setToastMessage('Failed to load repository details');
        return;
      }
      const details = await detailsRes.json();
      const bestPractices: BestPractice[] = details.bestPractices || [];

      // Get fixable missing practices
      const fixablePractices = ['dependabot', 'env_template', 'docker', 'deploy_badge', 'ci_cd', 'gitignore', 'pre_commit_hooks', 'testing_framework', 'linting', 'visual_docs'];
      const missingPractices = bestPractices
        .filter((p: BestPractice) => p.status === 'missing' && fixablePractices.includes(p.practice_type))
        .map((p: BestPractice) => p.practice_type);

      if (missingPractices.length === 0) {
        setToastMessage('No fixable missing practices');
        return;
      }

      // Load templates - preview-templates needs full name for GitHub API calls
      const previewRes = await fetch('/api/preview-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docTypes: missingPractices, repoName: fullRepoName }),
      });

      if (!previewRes.ok) {
        setToastMessage('Failed to load templates');
        return;
      }

      const { previews } = await previewRes.json();
      setPreviewFiles(previews);
      setPreviewRepoName(fullRepoName);
      setPreviewMode('batch');
      setPreviewModalOpen(true);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setToastMessage('Failed to load templates');
    } finally {
      setFixingDoc(false);
    }
  };

  const handleGenerateSummary = async (repoName: string) => {
    try {
      setGeneratingSummary(repoName);
      const res = await fetch(`/api/repos/${repoName}/generate-summary`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setRepos((prev) =>
          prev.map((r) => (r.name === repoName ? { ...r, ai_summary: data.summary } : r))
        );
        setToastMessage(`AI summary generated for ${repoName}.`);
      } else {
        const err = await res.json();
        setToastMessage(`Failed to generate summary: ${err.error}`);
      }
    } catch (error) {
      console.error('Failed to generate summary:', error);
      setToastMessage('Failed to generate summary');
    } finally {
      setGeneratingSummary(null);
    }
  };

  const handleSyncSingleRepo = async (repoName: string, onSuccess?: () => void) => {
    try {
      setSyncingRepo(repoName);
      const res = await fetch(`/api/repos/${repoName}/sync`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        // Patch only this repo in the list — avoids a disruptive full refetch
        if (data.updatedRepo && typeof data.updatedRepo === 'object') {
          setRepos(prev => prev.map(r => r.name === repoName ? data.updatedRepo as Repo : r));
        } else {
          await refetchRepos();
        }
        onSuccess?.();
        setToastMessage(`Successfully synced ${repoName}!`);
      } else {
        const err = await res.json();
        setToastMessage(`Failed to sync: ${err.error}`);
      }
    } catch (error) {
      console.error('Failed to sync repo:', error);
      setToastMessage('Failed to sync repo');
    } finally {
      setSyncingRepo(null);
    }
  };

  const confirmPRCreation = async (selectedFiles: FilePreview[]) => {
    if (selectedFiles.length === 0) {
      setToastMessage('No files selected');
      return;
    }

    try {
      setFixingDoc(true);

      // Extract repo name for API endpoints (they use database lookup)
      const repoName = previewRepoName.includes('/') ? previewRepoName.split('/')[1] : previewRepoName;

      if (selectedFiles.length === 1) {
        // Single file PR
        const f = selectedFiles[0];
        if (f.type === 'practice') {
          const res = await fetch(`/api/repos/${repoName}/fix-best-practice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              practiceType: f.practiceType,
              content: f.content,
              path: f.path
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.prUrl) window.open(data.prUrl, '_blank');
            setToastMessage(`PR created for ${String(f.practiceType)}!`);
            setPreviewModalOpen(false);
          } else {
            const err = await res.json();
            handlePRError(err);
          }
        } else {
          const docType = f.docType.toLowerCase();
          const res = await fetch(`/api/repos/${repoName}/fix-doc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docType,
              content: f.content,
              path: f.path
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.prUrl) {
              window.open(data.prUrl, '_blank');
            }
            setToastMessage(`PR created for ${docType.toUpperCase()}!`);
            setPreviewModalOpen(false);
          } else {
            const err = await res.json();
            handlePRError(err);
          }
        }
      } else {
        // Batch PRs: group by category
        const allDocs = selectedFiles.filter(f => f.type === 'doc');
        const practices = selectedFiles.filter(f => f.type === 'practice');

        // Split docs into core docs vs community standards
        const CORE_DOCS = new Set(['roadmap', 'tasks', 'metrics', 'features', 'readme']);
        const coreDocs = allDocs.filter(f => CORE_DOCS.has(f.docType.toLowerCase()));
        const standardDocs = allDocs.filter(f => !CORE_DOCS.has(f.docType.toLowerCase()));

        let docsMessage = '';
        let standardsMessage = '';
        let hasError = false;

        // Core docs: single batch PR via fix-all-docs
        if (coreDocs.length > 0) {
          const res = await fetch(`/api/repos/${repoName}/fix-all-docs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: coreDocs }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.prUrl) window.open(data.prUrl, '_blank');
            docsMessage = `Created PR with ${coreDocs.length} documentation file(s).`;
          } else {
            const err = await res.json();
            handlePRError(err);
            hasError = true;
          }
        }

        // Community standards: single batch PR via fix-all-standards
        if (standardDocs.length > 0) {
          const res = await fetch(`/api/repos/${repoName}/fix-all-standards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: standardDocs }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.prUrl) window.open(data.prUrl, '_blank');
            standardsMessage = `Created PR with ${standardDocs.length} standard file(s).`;
          } else {
            const err = await res.json();
            handlePRError(err);
            hasError = true;
          }
        }

        // Practices: create a single batch PR when multiple selected
        let practicesMessage = '';
        if (practices.length > 0) {
          const res = await fetch(`/api/repos/${repoName}/fix-all-practices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: practices }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.prUrl) window.open(data.prUrl, '_blank');
            practicesMessage = `Created PR with ${data.count} best-practice file(s).`;
          } else {
            const err = await res.json();
            handlePRError(err);
            hasError = true;
          }
        }

        const messages = [docsMessage, standardsMessage, practicesMessage].filter(Boolean);
        if (messages.length > 0) {
          setToastMessage(messages.join(' '));
        }

        // Only close modal if no errors occurred
        if (!hasError) {
          setPreviewModalOpen(false);
        }
      }
    } catch (error) {
      console.error('Failed to create PR:', error);
      setToastMessage('Failed to create PR');
    } finally {
      setFixingDoc(false);
    }
  };

  const handlePRError = (err: { type?: string; error?: string; helpUrl?: string; instructions?: string }) => {
    if (err.type === 'oauth_restriction' && err.helpUrl) {
      console.error('🔐 OAuth Restriction - Authorization Required');
      setToastMessage(`${err.error || 'Authorization required'} - Opening authorization page...`);
      setTimeout(() => {
        if (err.helpUrl) {
          window.open(err.helpUrl, '_blank');
        }
      }, 500);
    } else if (err.type === 'oauth_restriction' && err.instructions) {
      console.error('OAuth Restriction:', err.instructions);
      setToastMessage(err.error || 'Failed to create PR - OAuth restriction');
      if (err.helpUrl) {
        setTimeout(() => {
          if (confirm('Need help authorizing the app for this organization? Click OK to view instructions.')) {
            window.open(err.helpUrl!, '_blank');
          }
        }, 1000);
      }
    } else {
      setToastMessage(err.error || 'Failed to create PR');
    }
  };

  return {
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
  };
}
