import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  securityRemediation,
  type SecurityControl,
} from '../../lib/security-settings-links';
import { SecuritySection, type SecurityConfig } from './SecuritySection';

afterEach(cleanup);

const controls: Array<{ control: SecurityControl; label: string }> = [
  { control: 'security_policy', label: 'Security Policy' },
  { control: 'security_advisories', label: 'Security Advisories' },
  { control: 'private_reporting', label: 'Private Reporting' },
  { control: 'dependabot_alerts', label: 'Dependabot Alerts' },
  { control: 'code_scanning', label: 'Code Scanning' },
  { control: 'secret_scanning', label: 'Secret Scanning' },
];

const disabledConfig: SecurityConfig = {
  hasSecurityPolicy: false,
  hasSecurityAdvisories: false,
  privateVulnerabilityReportingEnabled: false,
  dependabotAlertsEnabled: false,
  codeScanningEnabled: false,
  secretScanningEnabled: false,
};

const enabledConfig: SecurityConfig = {
  hasSecurityPolicy: true,
  hasSecurityAdvisories: true,
  privateVulnerabilityReportingEnabled: true,
  dependabotAlertsEnabled: true,
  codeScanningEnabled: true,
  secretScanningEnabled: true,
};

describe('SecuritySection remediation links', () => {
  it('shows one helper-mapped settings link and prerequisite for each disabled control', () => {
    render(
      <SecuritySection
        securityConfig={disabledConfig}
        fullName="nitsuah/vigil"
        isExpanded
      />,
    );

    const links = screen.getAllByRole('link', { name: /Open settings for/ });
    expect(links).toHaveLength(6);

    for (const { control, label } of controls) {
      const expected = securityRemediation(control, 'nitsuah/vigil');
      const link = screen.getByRole('link', {
        name: 'Open settings for ' + label,
      });
      expect(link.getAttribute('href')).toBe(expected.url);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer');
      expect(screen.getByText(expected.prerequisite)).toBeTruthy();
    }
  });

  it('does not show remediation links when every control is enabled', () => {
    render(
      <SecuritySection
        securityConfig={enabledConfig}
        fullName="nitsuah/vigil"
        isExpanded
      />,
    );
    expect(
      screen.queryAllByRole('link', { name: /Open settings for/ }),
    ).toHaveLength(0);
  });

  it('fails closed when the repository identity is missing or malformed', () => {
    for (const fullName of [undefined, 'not-a-full-name', 'owner/repo?x=1']) {
      const view = render(
        <SecuritySection
          securityConfig={disabledConfig}
          fullName={fullName}
          isExpanded
        />,
      );
      expect(
        screen.queryAllByRole('link', { name: /Open settings for/ }),
      ).toHaveLength(0);
      view.unmount();
    }
  });
});
