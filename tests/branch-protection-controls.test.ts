import { describe, it, expect } from 'vitest';
import { branchProtectionControls } from '../lib/branch-protection-controls';

describe('branchProtectionControls', () => {
  it('reports every control missing for an unprotected branch', () => {
    const r = branchProtectionControls({ protected: false, allowForcePushes: false, allowDeletions: false }, 'o/x');
    expect(r.enabled).toBe(0);
    expect(r.total).toBe(9);
    expect(r.controls.every((c) => c.status === 'missing' && c.fixUrl === 'https://github.com/o/x/settings/branches')).toBe(true);
  });

  it('counts a fully protected branch as 9 of 9', () => {
    const r = branchProtectionControls({
      protected: true,
      requiresReviews: true,
      requiredApprovingReviews: 1,
      dismissStaleReviews: true,
      requireCodeOwnerReviews: true,
      requiredStatusChecks: true,
      requireSignedCommits: true,
      requireLinearHistory: true,
      allowForcePushes: false,
      allowDeletions: false,
      requiredConversationResolution: true,
    }, 'o/x');
    expect(r.enabled).toBe(9);
  });

  it('treats reviews with zero approvals as missing and allowed force pushes as missing', () => {
    const r = branchProtectionControls({ protected: true, requiresReviews: true, requiredApprovingReviews: 0, allowForcePushes: true }, 'o/x');
    const byId = Object.fromEntries(r.controls.map((c) => [c.id, c.status]));
    expect(byId['reviews']).toBe('missing');
    expect(byId['no-force-push']).toBe('missing');
    expect(byId['no-deletion']).toBe('enabled');
    expect(r.enabled).toBe(1);
  });

  it('reports controls as unknown, not missing, when branch protection is unreadable', () => {
    const r = branchProtectionControls({ protected: false, unreadable: true, allowForcePushes: false, allowDeletions: false }, 'o/x');
    expect(r.enabled).toBe(0);
    expect(r.total).toBe(9);
    expect(r.controls.every((c) => c.status === 'unknown')).toBe(true);
  });
});