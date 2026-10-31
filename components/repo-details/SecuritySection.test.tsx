import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { securityRemediation, type SecurityControl } from '../../lib/security-settings-links';
import { SecuritySection, type SecurityConfig } from './SecuritySection';

afterEach(cleanup);

const controls = [
  ['security_policy', 'Security Policy'],
  ['security_advisories', 'Security Advisories'],
  ['private_reporting', 'Private Reporting'],
  ['dependabot_alerts', 'Dependabot Alerts'],
  ['code_scanning', 'Code Scanning'],
  ['secret_scanning', 'Secret Scanning'],
] as const;

const config = (enabled: boolean): SecurityConfig => ({
  hasSecurityPolicy: enabled,
  hasSecurityAdvisories: enabled,
  privateVulnerabilityReportingEnabled: enabled,
  dependabotAlertsEnabled: enabled,
  codeScanningEnabled: enabled,
  secretScanningEnabled: enabled,
});

describe('SecuritySection remediation links', () => {
  it('shows helper-mapped links and prerequisites for all disabled controls', () => {
    render(<SecuritySection securityConfig={config(false)} fullName="nitsuah/vigil" isExpanded />);
    expect(screen.getAllByRole('link', { name: /Open settings for/ })).toHaveLength(6);

    for (const [control, label] of controls) {
      const expected = securityRemediation(control as SecurityControl, 'nitsuah/vigil');
      const link = screen.getByRole('link', { name: 'Open settings for ' + label });
      expect(link.getAttribute('href')).toBe(expected.url);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer');
      expect(screen.getByText(expected.prerequisite)).toBeTruthy();
    }
  });

  it('fails closed for enabled controls or missing/malformed repository identity', () => {
    for (const [securityConfig, fullName] of [
      [config(true), 'owner/repo'],
      [config(false), undefined],
      [config(false), 'not-a-full-name'],
    ] as const) {
      const view = render(<SecuritySection securityConfig={securityConfig} fullName={fullName} isExpanded />);
      expect(screen.queryAllByRole('link', { name: /Open settings for/ })).toHaveLength(0);
      view.unmount();
    }
  });
});
