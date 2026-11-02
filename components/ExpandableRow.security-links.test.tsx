import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import ExpandableRow from './ExpandableRow';

afterEach(cleanup);

const securityConfig = {
  hasSecurityPolicy: false,
  hasSecurityAdvisories: false,
  privateVulnerabilityReportingEnabled: false,
  dependabotAlertsEnabled: false,
  codeScanningEnabled: false,
  secretScanningEnabled: false,
  dependabotAlertCount: 0,
  codeScanningAlertCount: 0,
  secretScanningAlertCount: 0,
};

function renderRow(repoUrl?: string) {
  return render(
    <ExpandableRow
      tasks={[]}
      roadmapItems={[]}
      docStatuses={[]}
      repoName="owner/repo"
      repoUrl={repoUrl}
      securityConfig={securityConfig}
      isAuthenticated={false}
    />,
  );
}

function openSecurity(container: HTMLElement) {
  const section = container.querySelector('[data-tour="security"]');
  if (!(section instanceof HTMLElement)) throw new Error('Security section missing');
  fireEvent.click(within(section).getByText('Security'));
  return within(section);
}

describe('ExpandableRow security links', () => {
  it('accepts canonical GitHub URLs only and does not enable Fix actions', () => {
    for (const [repoUrl, expectedCount] of [
      ['https://github.com/owner/repo.git/', 6],
      [undefined, 0],
      ['https://example.com/owner/repo', 0],
      ['https://github.com/owner/repo/tree/main', 0],
    ] as const) {
      const view = renderRow(repoUrl);
      const security = openSecurity(view.container);
      expect(
        security.queryAllByRole('link', { name: /Open settings for/ }),
      ).toHaveLength(expectedCount);
      expect(security.queryAllByRole('button', { name: /^Fix$/ })).toHaveLength(0);
      if (expectedCount) {
        expect(
          security
            .getByRole('link', { name: 'Open settings for Security Policy' })
            .getAttribute('href'),
        ).toBe('https://github.com/owner/repo/security/policy');
      }
      view.unmount();
    }
  });
});
