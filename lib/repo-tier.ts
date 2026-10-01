// Repository importance tiers -- a user-assigned label (T1 most critical)
// that sits next to the repo type icon. Unlike repo_type it is never
// auto-detected: a repo stays untiered (null) until someone picks one.

export type RepoTier = 'T1' | 'T2' | 'T3' | 'T4';

export interface RepoTierInfo {
  id: RepoTier;
  label: string;
  description: string;
  /** Tailwind classes for the badge (text + background + border). */
  badgeClass: string;
}

export const REPO_TIERS: readonly RepoTierInfo[] = [
  {
    id: 'T1',
    label: 'Critical',
    description: 'Production / revenue-bearing. Fix regressions first.',
    badgeClass: 'text-red-300 bg-red-500/15 border-red-500/50',
  },
  {
    id: 'T2',
    label: 'Important',
    description: 'Actively used and maintained; keep healthy.',
    badgeClass: 'text-amber-300 bg-amber-500/15 border-amber-500/50',
  },
  {
    id: 'T3',
    label: 'Standard',
    description: 'Useful but not urgent; maintain opportunistically.',
    badgeClass: 'text-sky-300 bg-sky-500/15 border-sky-500/50',
  },
  {
    id: 'T4',
    label: 'Low',
    description: 'Experiments, archives-in-waiting, side projects.',
    badgeClass: 'text-slate-300 bg-slate-500/15 border-slate-500/50',
  },
];

export const REPO_TIER_IDS: readonly RepoTier[] = REPO_TIERS.map((t) => t.id);

export function isRepoTier(value: unknown): value is RepoTier {
  return typeof value === 'string' && (REPO_TIER_IDS as readonly string[]).includes(value);
}

export function getRepoTierInfo(tier: string | null | undefined): RepoTierInfo | null {
  return REPO_TIERS.find((t) => t.id === tier) ?? null;
}

/** Filter value for the dashboard: a tier, untiered repos only, or everything. */
export type TierFilter = RepoTier | 'untiered' | 'all';

export function matchesTierFilter(tier: string | null | undefined, filter: TierFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'untiered') return !isRepoTier(tier);
  return tier === filter;
}
