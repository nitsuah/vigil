/** The fields of the existing `branch_protection` practice details that the controls read. */
export interface BranchProtectionDetails {
  protected?: boolean;
  requiresReviews?: boolean;
  requiredApprovingReviews?: number;
  dismissStaleReviews?: boolean;
  requireCodeOwnerReviews?: boolean;
  requiredStatusChecks?: boolean;
  requireSignedCommits?: boolean;
  requireLinearHistory?: boolean;
  allowForcePushes?: boolean;
  allowDeletions?: boolean;
  requiredConversationResolution?: boolean;
  unreadable?: boolean;
}

export type ControlStatus = 'enabled' | 'missing' | 'unknown';

export interface BranchControl {
  id: string;
  label: string;
  status: ControlStatus;
  /** Where to turn it on. */
  fixUrl: string;
}

export interface BranchControlSummary {
  controls: BranchControl[];
  /** Controls enabled out of `total`; every control weighs the same. */
  enabled: number;
  total: number;
}

export function branchProtectionControls(details: BranchProtectionDetails, fullName: string): BranchControlSummary {
  const fixUrl = `https://github.com/${fullName}/settings/branches`;
  const isProtected = details.protected === true;
  const checks: Array<[string, string, boolean]> = [
    ['reviews', 'Pull request reviews required', !!details.requiresReviews && (details.requiredApprovingReviews ?? 0) >= 1],
    ['stale-reviews', 'Stale approvals dismissed on new commits', !!details.dismissStaleReviews],
    ['code-owners', 'Code owner review required', !!details.requireCodeOwnerReviews],
    ['status-checks', 'Status checks required', !!details.requiredStatusChecks],
    ['conversations', 'Conversation resolution required', !!details.requiredConversationResolution],
    ['signed-commits', 'Signed commits required', !!details.requireSignedCommits],
    ['linear-history', 'Linear history required', !!details.requireLinearHistory],
    ['no-force-push', 'Force pushes blocked', !details.allowForcePushes],
    ['no-deletion', 'Branch deletion blocked', !details.allowDeletions],
  ];
  const controls: BranchControl[] = checks.map(([id, label, ok]) => ({
    id,
    label,
    status: isProtected && ok ? 'enabled' : details.unreadable === true ? 'unknown' : 'missing',
    fixUrl,
  }));
  return { controls, enabled: controls.filter((c) => c.status === 'enabled').length, total: controls.length };
}