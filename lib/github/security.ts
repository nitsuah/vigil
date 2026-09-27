import type { Octokit } from '@octokit/rest';
import logger from '@/lib/log';

export async function getVulnerabilityAlerts(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ total: number; critical: number; high: number }> {
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/dependabot/alerts', {
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });

    const alerts = data as Array<{ security_advisory?: { severity?: string } }>;
    const critical = alerts.filter((a) => a.security_advisory?.severity === 'critical').length;
    const high = alerts.filter((a) => a.security_advisory?.severity === 'high').length;

    return { total: alerts.length, critical, high };
  } catch {
    return { total: 0, critical: 0, high: 0 };
  }
}

export async function getSecurityConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  /** true/false when the caller already knows (repo file tree); null = probe. */
  hasFile: (path: string) => Promise<boolean | null> = async () => null
): Promise<{
  hasSecurityPolicy: boolean;
  hasSecurityAdvisories: boolean;
  privateVulnerabilityReportingEnabled: boolean;
  dependabotAlertsEnabled: boolean;
  dependabotAlertCount: number;
  codeScanningEnabled: boolean;
  codeScanningAlertCount: number;
  secretScanningEnabled: boolean;
  secretScanningAlertCount: number;
}> {
  const defaultResponse = {
    hasSecurityPolicy: false,
    hasSecurityAdvisories: false,
    privateVulnerabilityReportingEnabled: false,
    dependabotAlertsEnabled: false,
    dependabotAlertCount: 0,
    codeScanningEnabled: false,
    codeScanningAlertCount: 0,
    secretScanningEnabled: false,
    secretScanningAlertCount: 0,
  };

  try {
    let hasSecurityPolicy = false;
    for (const path of ['SECURITY.md', '.github/SECURITY.md']) {
      const known = await hasFile(path);
      if (known === false) continue;
      if (known === true) { hasSecurityPolicy = true; break; }
      try {
        await octokit.repos.getContent({ owner, repo, path });
        hasSecurityPolicy = true;
        break;
      } catch {
        // File doesn't exist
      }
    }

    let hasSecurityAdvisories = false;
    try {
      const { data: advisories } = await octokit.request('GET /repos/{owner}/{repo}/security-advisories', {
        owner,
        repo,
        per_page: 1,
      });
      hasSecurityAdvisories = Array.isArray(advisories) && advisories.length > 0;
    } catch {
      // Not enabled or no permission
    }

    let privateVulnerabilityReportingEnabled = false;
    try {
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      const analysis = (repoData as Record<string, unknown>).security_and_analysis as
        | { private_vulnerability_reporting?: { status?: string } }
        | undefined;
      privateVulnerabilityReportingEnabled =
        analysis?.private_vulnerability_reporting?.status === 'enabled' || false;
    } catch {
      // Unable to check
    }

    let dependabotAlertsEnabled = false;
    let dependabotAlertCount = 0;
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/dependabot/alerts', {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      dependabotAlertsEnabled = true;
      dependabotAlertCount = Array.isArray(data) ? data.length : 0;
    } catch {
      // Not enabled or no permission
    }

    let codeScanningEnabled = false;
    let codeScanningAlertCount = 0;
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/code-scanning/alerts', {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      codeScanningEnabled = true;
      codeScanningAlertCount = Array.isArray(data) ? data.length : 0;
    } catch {
      // Not enabled or no permission
    }

    let secretScanningEnabled = false;
    let secretScanningAlertCount = 0;
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/secret-scanning/alerts', {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      secretScanningEnabled = true;
      secretScanningAlertCount = Array.isArray(data) ? data.length : 0;
    } catch {
      // Not enabled or no permission
    }

    return {
      hasSecurityPolicy,
      hasSecurityAdvisories,
      privateVulnerabilityReportingEnabled,
      dependabotAlertsEnabled,
      dependabotAlertCount,
      codeScanningEnabled,
      codeScanningAlertCount,
      secretScanningEnabled,
      secretScanningAlertCount,
    };
  } catch (error) {
    logger.error(`[GitHub] Failed to fetch security config for ${repo}:`, error);
    return defaultResponse;
  }
}
