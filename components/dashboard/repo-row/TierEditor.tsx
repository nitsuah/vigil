// Tier editor component for inline editing of a repository's importance tier

import { useEffect, useState } from 'react';
import { REPO_TIERS, getRepoTierInfo, isRepoTier, type RepoTier } from '@/lib/repo-tier';

interface TierEditorProps {
  tier: string | null | undefined;
  repoName: string;
  isAuthenticated: boolean;
  /**
   * Called optimistically with the new tier, and again with the previous one
   * if the save fails, so the dashboard's shared repo state stays the source
   * of truth for filters and remounted editors.
   */
  onTierChange?: (tier: RepoTier | null) => void;
}

const UNTIERED_CLASS = 'text-slate-500 bg-transparent border-dashed border-slate-600';

export function TierEditor({ tier: initialTier, repoName, isAuthenticated, onTierChange }: TierEditorProps) {
  const [tier, setTier] = useState<RepoTier | null>(isRepoTier(initialTier) ? initialTier : null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Follow server-side changes (e.g. a dashboard refetch after sync).
  useEffect(() => {
    setTier(isRepoTier(initialTier) ? initialTier : null);
  }, [initialTier]);

  const info = getRepoTierInfo(tier);
  const badgeClass = `inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded border text-[11px] font-semibold leading-none ${info ? info.badgeClass : UNTIERED_CLASS}`;
  const title = info ? `${info.id} · ${info.label}: ${info.description}` : 'No tier set';

  const handleChange = async (value: string) => {
    const next: RepoTier | null = isRepoTier(value) ? value : null;
    const previous = tier;
    setTier(next);
    onTierChange?.(next);
    setEditing(false);
    try {
      setSaving(true);
      const res = await fetch(`/api/repos/${repoName}/update-tier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: next }),
      });
      if (!res.ok) {
        console.error('Failed to update repo tier');
        setTier(previous);
        onTierChange?.(previous);
      }
    } catch (error) {
      console.error('Error updating repo tier:', error);
      setTier(previous);
      onTierChange?.(previous);
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    // Read-only: only show a badge when a tier has actually been assigned.
    if (!info) return null;
    return (
      <span className={badgeClass} title={title} data-testid="repo-tier-badge">
        {info.id}
      </span>
    );
  }

  if (editing) {
    return (
      <select
        aria-label={`Set tier for ${repoName}`}
        value={tier ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        onBlur={() => setEditing(false)}
        onClick={(e) => e.stopPropagation()}
        autoFocus
      >
        <option value="">— No tier</option>
        {REPO_TIERS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id} · {t.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      disabled={saving}
      className={`${badgeClass} hover:scale-110 transition-transform`}
      title={`Click to edit tier (${title})`}
      aria-label={`Tier for ${repoName}: ${info ? info.id : 'none'}`}
      data-testid="repo-tier-badge"
    >
      {info ? info.id : 'T–'}
    </button>
  );
}
