import { describe, it, expect } from 'vitest';
import { securityRemediation, type SecurityControl } from '../lib/security-settings-links';

const ALL: SecurityControl[] = ['security_policy', 'security_advisories', 'private_reporting', 'dependabot_alerts', 'code_scanning', 'secret_scanning'];

describe('securityRemediation', () => {
  it('gives every control a github.com url inside the repo and a prerequisite', () => {
    for (const control of ALL) {
      const r = securityRemediation(control, 'nitsuah/vigil');
      expect(r.url.startsWith('https://github.com/nitsuah/vigil/')).toBe(true);
      expect(r.prerequisite.length).toBeGreaterThan(0);
    }
  });

  it('points the scanning and reporting controls at the security_analysis settings page', () => {
    expect(securityRemediation('dependabot_alerts', 'o/x').url).toBe('https://github.com/o/x/settings/security_analysis');
    expect(securityRemediation('security_policy', 'o/x').url).toBe('https://github.com/o/x/security/policy');
    expect(securityRemediation('security_advisories', 'o/x').url).toBe('https://github.com/o/x/security/advisories');
  });

  it('rejects malformed repository names', () => {
    expect(() => securityRemediation('code_scanning', 'no-slash')).toThrow();
    expect(() => securityRemediation('code_scanning', 'a/b/../c')).toThrow();
    expect(() => securityRemediation('code_scanning', 'a/b?x=1')).toThrow();
  });
});