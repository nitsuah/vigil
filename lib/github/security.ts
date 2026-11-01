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

function responseStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function unavailableControl(error: unknown): boolean | null {
  return responseStatus(error) === 404 ? false : null;
}

export async function getSecurityConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  /** true/false when the caller already knows (repo file tree); null = probe. */
  hasFile: (path: string) => Promise<boolean | null> = async () => null
): Promise<{
  hasSecurityPolicy: boolean | null;
  hasSecurityAdvisories: boolean | null;
  privateVulnerabilityReportingEnabled: boolean | null;
  dependabotAlertsEnabled: boolean | null;
  dependabotAlertCount: number;
  codeScanningEnabled: boolean | null;
  codeScanningAlertCount: number;
  secretScanningEnabled: boolean | null;
  secretScanningAlertCount: number;
}> {
  const defaultResponse = {
    hasSecurityPolicy: null,
    hasSecurityAdvisories: null,
    privateVulnerabilityReportingEnabled: null,
    dependabotAlertsEnabled: null,
    dependabotAlertCount: 0,
    codeScanningEnabled: null,
    codeScanningAlertCount: 0,
    secretScanningEnabled: null,
    secretScanningAlertCount: 0,
  };

  try {
    let hasSecurityPolicy: boolean | null = null;
    let hasUnknownPolicyPath = false;

    for (const path of ['SECURITY.md', '.github/SECURITY.md']) {
      let known: boolean | null = null;
      try {
        known = await hasFile(path);
      } catch {
        // An unreadable repository tree is not proof that the file is absent.
      }

      if (known === true) {
        hasSecurityPolicy = true;
        break;
      }
      if (known === false) continue;

      try {
        await octokit.repos.getContent({ owner, repo, path });
        hasSecurityPolicy = true;
        break;
      } catch (error) {
        if (responseStatus(error) === 404) continue;
        hasUnknownPolicyPath = true;
      }
    }

    if (hasSecurityPolicy !== true) {
      hasSecurityPolicy = hasUnknownPolicyPath ? null : false;
    }

    let hasSecurityAdvisories: boolean | null = null;
    try {
      const { data: advisories } = await octokit.request('GET /repos/{owner}/{repo}/security-advisories', {
        owner,
        repo,
        per_page: 1,
      });
      hasSecurityAdvisories = Array.isArray(advisories) ? advisories.length > 0 : null;
    } catch (error) {
      hasSecurityAdvisories = unavailableControl(error);
    }

    let privateVulnerabilityReportingEnabled: boolean | null = null;
    try {
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      const analysis = (repoData as Record<string, unknown>).security_and_analysis as
        | { private_vulnerability_reporting?: { status?: string } }
        | undefined;
      privateVulnerabilityReportingEnabled =
        analysis?.private_vulnerability_reporting?.status === 'enabled';
    } catch (error) {
      privateVulnerabilityReportingEnabled = unavailableControl(error);
    }

    let dependabotAlertsEnabled: boolean | null = null;
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
    } catch (error) {
      dependabotAlertsEnabled = unavailableControl(error);
    }

    let codeScanningEnabled: boolean | null = null;
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
    } catch (error) {
      codeScanningEnabled = unavailableControl(error);
    }

    let secretScanningEnabled: boolean | null = null;
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
    } catch (error) {
      secretScanningEnabled = unavailableControl(error);
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
