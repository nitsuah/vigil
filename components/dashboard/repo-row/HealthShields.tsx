// Health shields component showing compact badges for various metrics

import { useId, useState } from 'react';
import { Repo, RepoDetails } from '@/types/repo';
import { calculateHealthScore } from '@/lib/health-score';
import { buildHealthScoreInputs } from '@/lib/health-score-inputs';

interface HealthShieldsProps {
  details: RepoDetails;
  repo: Repo;
  docHealth: { score: number } | null;
}

function Chip({ panelId, id, title, open, onOpen, className, children, ...rest }: {
  panelId: string;
  id: string;
  title: string;
  open: string | null;
  onOpen: (next: string | null) => void;
  className: string;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  return (
    <>
      <button
        type="button"
        title={title}
        aria-expanded={open === id}
        aria-controls={open === id ? panelId : undefined}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(open === id ? null : id);
        }}
        {...rest}
      >
        {children}
      </button>
      {/* Drawn from the current title, so a sync updates an open explanation. */}
      {open === id && (
        <p id={panelId} role="status" className="order-last basis-full whitespace-pre-line rounded border border-slate-700 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300">
          {title}
        </p>
      )}
    </>
  );
}

export function HealthShields({ details, repo, docHealth }: HealthShieldsProps) {
  // The chip whose explanation is open: touch and keyboard users have no hover.
  const [openChip, setOpenChip] = useState<string | null>(null);
  const panelId = useId();
  // Capture timestamp once
  const [now] = useState(() => Date.now());

  // Testing checks: framework, CI/CD exists, CI/CD health
  const hasTestFramework = details.bestPractices.some(
    (p) => p.practice_type === 'testing_framework' && p.status === 'healthy'
  );
  const hasCICD = repo.ci_status && repo.ci_status !== 'unknown';
  const cicdPassing = repo.ci_status === 'passing';

  const testingChecks = [];
  if (hasTestFramework) testingChecks.push('framework');
  if (hasCICD) testingChecks.push('ci_exists');
  if (cicdPassing) testingChecks.push('ci_healthy');

  const testingCount = testingChecks.length;
  const testingTotal = 3;

  // Build testing tooltip with details
  const testingTooltip = [
    `Testing: ${testingCount}/${testingTotal} checks`,
    '',
    `${hasTestFramework ? '✓' : '✗'} Testing Framework: ${hasTestFramework ? 'healthy' : 'missing'}`,
    `${hasCICD ? '✓' : '✗'} CI/CD Configured: ${hasCICD ? 'yes' : 'no'}`,
    `${cicdPassing ? '✓' : '✗'} CI/CD Status: ${repo.ci_status || 'unknown'}`,
  ].join('\n');

  const bpHealthy = details.bestPractices.filter((p) => p.status === 'healthy').length;
  const bpTotal = details.bestPractices.length;
  const bpPercentage = bpTotal > 0 ? Math.round((bpHealthy / bpTotal) * 100) : 0;

  const csHealthy = details.communityStandards.filter((s) => s.status === 'healthy').length;
  const csTotal = details.communityStandards.length;
  const csPercentage = csTotal > 0 ? Math.round((csHealthy / csTotal) * 100) : 0;

  // Build detailed Community Standards tooltip
  const csTooltip = [
    `Community Standards: ${csHealthy}/${csTotal} (${csPercentage}%)`,
    '',
    ...details.communityStandards.map((s) => {
      const status = s.status === 'healthy' ? '✓' : '✗';
      const name = s.standard_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return `${status} ${name}: ${s.status}`;
    })
  ].join('\n');

  // Build detailed Best Practices tooltip
  const bpTooltip = [
    `Best Practices: ${bpHealthy}/${bpTotal} (${bpPercentage}%)`,
    '',
    ...details.bestPractices.map((p) => {
      const status = p.status === 'healthy' ? '✓' : '✗';
      const name = p.practice_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return `${status} ${name}: ${p.status}`;
    })
  ].join('\n');

  // Build detailed Doc Health tooltip
  const repoType = repo.repo_type || 'unknown';
  const expectedDocsMap: Record<string, string[]> = {
    'web-app': ['readme', 'features', 'roadmap', 'tasks', 'metrics'],
    'game': ['readme', 'features', 'roadmap', 'tasks', 'metrics'],
    'library': ['readme', 'features', 'changelog', 'metrics'],
    'tool': ['readme', 'features', 'roadmap', 'tasks', 'metrics'],
    'bot': ['readme', 'features', 'roadmap', 'tasks', 'metrics'],
    'research': ['readme', 'features', 'metrics'],
    'unknown': ['readme', 'features', 'roadmap', 'metrics']
  };
  const expectedDocs = expectedDocsMap[repoType] || expectedDocsMap['unknown'];
  const existingDocs = new Set(details.docStatuses.filter(d => d.exists).map(d => d.doc_type));
  const presentCount = expectedDocs.filter((docType: string) => existingDocs.has(docType)).length;

  const docHealthTooltip = [
    `Repo Type: ${repoType}`,
    `Score: ${presentCount}/${expectedDocs.length} docs present = ${docHealth?.score}%`,
    '',
    'Expected Documents:',
    ...expectedDocs.map((docType: string) => {
      const doc = details.docStatuses.find((d) => d.doc_type === docType);
      const exists = doc && doc.exists;
      const healthState = doc?.health_state || (exists ? 'healthy' : 'missing');
      const status = exists ? (healthState === 'healthy' ? '✓' : healthState === 'dormant' ? '~' : '!') : '✗';
      return `  ${status} ${docType.toUpperCase()}: ${healthState}`;
    })
  ].join('\n');

  // Security health calculation (same as HealthBreakdown.tsx)
  const securityScore = repo.security_last_checked != null
    ? calculateHealthScore(buildHealthScoreInputs(
        { ...repo, health_profile: repo.health_profile || 'production' },
        details,
        now
      )).security
    : null;

  // Activity freshness calculation
  const getActivityColor = (dateString: string | null | undefined) => {
    if (!dateString) return 'bg-slate-700/50 text-slate-500';
    const date = new Date(dateString);
    const diffDays = Math.floor((now - date.getTime()) / 86400000);

    if (diffDays <= 7) return 'bg-green-500/20 text-green-400';
    if (diffDays <= 30) return 'bg-yellow-500/20 text-yellow-400';
    if (diffDays <= 90) return 'bg-orange-500/20 text-orange-400';
    return 'bg-red-500/20 text-red-400';
  };

  const formatActivityTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Never';
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffHours < 1) return '< 1h';
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 30) return `${diffDays}d`;
    if (diffMonths < 12) return `${diffMonths}mo`;
    return `${Math.floor(diffDays / 365)}y`;
  };

  return (
    <>
      <Chip
        panelId={panelId}
        id="community"
        open={openChip}
        onOpen={setOpenChip}
        title={csTooltip}
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          csPercentage >= 70
            ? 'bg-green-500/20 text-green-400'
            : csPercentage >= 40
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-red-500/20 text-red-400'
        }`}
      >
        Community {csHealthy}/{csTotal}
      </Chip>
      {!details.postureHidden && (
      <Chip
        panelId={panelId}
        id="practices"
        open={openChip}
        onOpen={setOpenChip}
        title={bpTooltip}
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          bpPercentage >= 70
            ? 'bg-purple-500/20 text-purple-400'
            : bpPercentage >= 40
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-red-500/20 text-red-400'
        }`}
      >
        Practices {bpHealthy}/{bpTotal}
      </Chip>
      )}
      <Chip
        panelId={panelId}
        id="testing"
        open={openChip}
        onOpen={setOpenChip}
        title={testingTooltip}
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          testingCount === 3
            ? 'bg-blue-500/20 text-blue-400'
            : testingCount >= 2
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-red-500/20 text-red-400'
        }`}
      >
        Tests {testingCount}/{testingTotal}
      </Chip>
      {repo.coverage_score != null && (
        <Chip
          panelId={panelId}
          id="coverage"
          open={openChip}
          onOpen={setOpenChip}
          title={`Test Coverage: ${repo.coverage_score}%`}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            repo.coverage_score >= 80
              ? 'bg-blue-500/20 text-blue-400'
              : repo.coverage_score >= 50
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          Coverage {repo.coverage_score}%
        </Chip>
      )}
      {docHealth && (
        <Chip
          panelId={panelId}
          id="docs"
          open={openChip}
          onOpen={setOpenChip}
          title={docHealthTooltip}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            docHealth.score === 100
              ? 'bg-slate-500/20 text-slate-400'
              : docHealth.score >= 50
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          Docs {docHealth.score}%
        </Chip>
      )}
      {/* Security health badge */}
      {details.postureHidden ? null : securityScore != null ? (
        <Chip
          panelId={panelId}
          id="security"
          open={openChip}
          onOpen={setOpenChip}
          title={`Security health: ${securityScore}%`}
          aria-label={`Security health: ${securityScore}%`}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            securityScore >= 80
              ? 'bg-green-500/20 text-green-400'
              : securityScore >= 60
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          Sec {securityScore}%
        </Chip>
      ) : (
        <Chip
          panelId={panelId}
          id="security"
          open={openChip}
          onOpen={setOpenChip}
          title="Security health unavailable (not checked yet)"
          aria-label="Security health unavailable (not checked yet)"
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-500"
        >
          Sec —
        </Chip>
      )}
      <Chip
        panelId={panelId}
        id="commit"
        open={openChip}
        onOpen={setOpenChip}
        title={repo.last_commit_date ? `Last commit: ${repo.last_commit_date}` : 'No commits'}
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getActivityColor(repo.last_commit_date)}`}
      >
        Commit {formatActivityTime(repo.last_commit_date)}
      </Chip>
    </>
  );
}
