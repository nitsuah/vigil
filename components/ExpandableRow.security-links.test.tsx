import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  within,
} from '@testing-library/react';
import ExpandableRow from './ExpandableRow';

afterEach(cleanup);

const securityConfig = {
  hasSecurityPolicy: false,
  hasSecurityAdvisories: false,
  privateVulnerabilityReportingEnabled: false,
  dependabotAlertsEnabled: false,
  codeScanningEnabled: false,
  secretScanningEnabled: false,
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

function expandSecurity(container: HTMLElement) {
  const section = container.querySelector('[data-tour="security"]');
  if (!(section instanceof HTMLElement)) {
    throw new Error('Security section was not rendered');
  }
  fireEvent.click(within(section).getByText('Security'));
  return within(section);
}

describe('ExpandableRow security settings links', () => {
  it('forwards a canonical GitHub URL as owner/repo without enabling Fix actions', () => {
    const { container } = renderRow('https://github.com/owner/repo.git/');
    const security = expandSecurity(container);
    const links = security.getAllByRole('link', { name: /Open settings for/ });

    expect(links).toHaveLength(6);
    expect(links[0].getAttribute('href')).toBe(
      'https://github.com/owner/repo/security/policy',
    );
    expect(security.queryAllByRole('button', { name: /^Fix$/ })).toHaveLength(0);
  });

  it('omits links for missing, non-GitHub, or non-canonical repository URLs', () => {
    for (const repoUrl of [
      undefined,
      'https://example.com/owner/repo',
      'https://github.com/owner/repo/tree/main',
    ]) {
      const view = renderRow(repoUrl);
      const security = expandSecurity(view.container);
      expect(
        security.queryAllByRole('link', { name: /Open settings for/ }),
      ).toHaveLength(0);
      expect(security.queryAllByRole('button', { name: /^Fix$/ })).toHaveLength(0);
      view.unmount();
    }
  });
});
