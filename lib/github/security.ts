import type { Octokit } from '@octokit/rest';
import logger from '@/lib/log';
import type { SecurityConfig } from '@/types/repo';

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

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.status ?? candidate.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function falseOrUnknown(error: unknown): false | null {
  return getStatusCode(error) === 404 ? false : null;
}

export async function getSecurityConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  /** true/false when the caller already knows (repo file tree); null = probe. */
  hasFile: (path: string) => Promise<boolean | null> = async () => null
): Promise<SecurityConfig> {
  const response: SecurityConfig = {
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
    let policyFound = false;
    let policyUnreadable = false;
    for (const path of ['SECURITY.md', '.github/SECURITY.md']) {
      let known: boolean | null = null;
      try {
        known = await hasFile(path);
      } catch {
        // Fall through to the API probe; only a successful/404 response is conclusive.
      }

      if (known === true) {
        policyFound = true;
        break;
      }
      if (known === false) continue;

      try {
        await octokit.repos.getContent({ owner, repo, path });
        policyFound = true;
        break;
      } catch (error) {
        if (getStatusCode(error) !== 404) policyUnreadable = true;
      }
    }
    response.hasSecurityPolicy = policyFound ? true : policyUnreadable ? null : false;

    try {
      const { data: advisories } = await octokit.request('GET /repos/{owner}/{repo}/security-advisories', {
        owner,
        repo,
        per_page: 1,
      });
      response.hasSecurityAdvisories = Array.isArray(advisories) && advisories.length > 0;
    } catch (error) {
      response.hasSecurityAdvisories = falseOrUnknown(error);
    }

    try {
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      const analysis = (repoData as Record<string, unknown>).security_and_analysis as
        | { private_vulnerability_reporting?: { status?: string } }
        | undefined;
      response.privateVulnerabilityReportingEnabled =
        analysis?.private_vulnerability_reporting?.status === 'enabled';
    } catch (error) {
      response.privateVulnerabilityReportingEnabled = falseOrUnknown(error);
    }

    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/dependabot/alerts', {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      response.dependabotAlertsEnabled = true;
      response.dependabotAlertCount = Array.isArray(data) ? data.length : 0;
    } catch (error) {
      response.dependabotAlertsEnabled = falseOrUnknown(error);
    }

    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/code-scanning/alerts', {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      response.codeScanningEnabled = true;
      response.codeScanningAlertCount = Array.isArray(data) ? data.length : 0;
    } catch (error) {
      response.codeScanningEnabled = falseOrUnknown(error);
    }

    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/secret-scanning/alerts', {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      response.secretScanningEnabled = true;
      response.secretScanningAlertCount = Array.isArray(data) ? data.length : 0;
    } catch (error) {
      response.secretScanningEnabled = falseOrUnknown(error);
    }
  } catch (error) {
    logger.error(`[GitHub] Failed to fetch security config for ${repo}:`, error);
  }

  return response;
}
