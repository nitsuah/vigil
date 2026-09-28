"use client";

import { Shield, CheckCircle2, XCircle, AlertTriangle, Wrench } from 'lucide-react';
import { useState } from 'react';

export interface SecurityConfig {
  hasSecurityPolicy: boolean;
  hasSecurityAdvisories: boolean;
  privateVulnerabilityReportingEnabled: boolean;
  dependabotAlertsEnabled: boolean;
  dependabotAlertCount?: number;
  codeScanningEnabled: boolean;
  codeScanningAlertCount?: number;
  secretScanningEnabled: boolean;
  secretScanningAlertCount?: number;
}

interface SecuritySectionProps {
  securityConfig?: SecurityConfig;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  repoName?: string;
}

async function fixSecurityFeature(repoName: string, featureType: string) {
  const res = await fetch(`/api/repos/${repoName}/fix-security`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featureType })
  });

  // Handle non-JSON error responses (HTML, plain text, etc.)
  const contentType = res.headers.get('content-type');
  let data: unknown;
  try {
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
  } catch {
    data = { error: 'Failed to parse response' };
  }

  if (!res.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data
      ? (data as { error?: string }).error
      : 'Failed to fix security feature';
    throw new Error(message);
  }
  return data as { prUrl: string };
}

export function SecuritySection({
  securityConfig,
  isExpanded: isExpandedProp,
  onToggleExpanded,
  repoName
}: SecuritySectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const setIsExpanded = onToggleExpanded || (() => setInternalExpanded(!internalExpanded));
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixSuccess, setFixSuccess] = useState<string | null>(null);

  if (!securityConfig) return null;

  const getStatusIcon = (enabled: boolean) => {
    return enabled
      ? <CheckCircle2 className="h-3 w-3 text-green-400" />
      : <XCircle className="h-3 w-3 text-slate-500" />;
  };

  const getAlertIcon = (count?: number) => {
    if (count === undefined || count === 0) {
      return <CheckCircle2 className="h-3 w-3 text-green-400" />;
    }
    if (count > 0 && count <= 5) {
      return <AlertTriangle className="h-3 w-3 text-yellow-400" />;
    }
    return <AlertTriangle className="h-3 w-3 text-red-400" />;
  };

  const hasAnyAlerts =
    (securityConfig.dependabotAlertCount && securityConfig.dependabotAlertCount > 0) ||
    (securityConfig.codeScanningAlertCount && securityConfig.codeScanningAlertCount > 0) ||
    (securityConfig.secretScanningAlertCount && securityConfig.secretScanningAlertCount > 0);

  const allFeaturesEnabled =
    securityConfig.hasSecurityPolicy &&
    securityConfig.privateVulnerabilityReportingEnabled &&
    securityConfig.dependabotAlertsEnabled &&
    securityConfig.codeScanningEnabled &&
    securityConfig.secretScanningEnabled;

  const borderColor = hasAnyAlerts
    ? (allFeaturesEnabled ? 'border-yellow-500/40' : 'border-purple-500/40')
    : (allFeaturesEnabled ? 'border-green-500/40' : 'border-purple-500/40');

  const bgGradient = hasAnyAlerts
    ? 'from-yellow-900/30 via-slate-800/50 to-yellow-800/20'
    : (allFeaturesEnabled
      ? 'from-green-900/30 via-slate-800/50 to-green-800/20'
      : 'from-purple-900/30 via-slate-800/50 to-purple-800/20');

  const handleFix = async (featureType: string) => {
    if (!repoName) return;
    setFixing(featureType);
    setFixError(null);
    setFixSuccess(null);
    try {
      const result = await fixSecurityFeature(repoName, featureType);
      setFixSuccess(`PR created: ${result.prUrl}`);
    } catch (err) {
      setFixError(err instanceof Error ? err.message : 'Failed to create fix PR');
    } finally {
      setFixing(null);
    }
  };

  return (
    <div
      className={`bg-gradient-to-br ${bgGradient} rounded-lg overflow-hidden border ${borderColor} shadow-lg shadow-purple-500/10 hover:border-purple-400/50 transition-colors`}
      data-tour="security"
    >
      <div
        onClick={setIsExpanded}
        className="w-full px-4 py-3 hover:bg-purple-900/20 transition-colors border-b border-purple-500/20 cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Shield className="h-4 w-4 text-purple-400" />
            <h4 className="text-sm font-semibold text-slate-200">Security</h4>
            <span className="text-slate-500 text-xs ml-2">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 py-3">
          <div className="space-y-2">
            {/* Security Policy */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                {getStatusIcon(securityConfig.hasSecurityPolicy)}
                <span>Security Policy</span>
              </span>
              <div className="flex items-center gap-2">
                <span className={securityConfig.hasSecurityPolicy ? "text-green-400" : "text-slate-500"}>
                  {securityConfig.hasSecurityPolicy ? 'Present' : 'Missing'}
                </span>
                {!securityConfig.hasSecurityPolicy && repoName && (
                  <button
                    onClick={() => handleFix('security_policy')}
                    disabled={fixing === 'security_policy'}
                    className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {fixing === 'security_policy' ? 'Fixing...' : 'Fix'}
                  </button>
                )}
              </div>
            </div>

            {/* Security Advisories */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                {getStatusIcon(securityConfig.hasSecurityAdvisories)}
                <span>Security Advisories</span>
              </span>
              <div className="flex items-center gap-2">
                <span className={securityConfig.hasSecurityAdvisories ? "text-green-400" : "text-slate-500"}>
                  {securityConfig.hasSecurityAdvisories ? 'Enabled' : 'Disabled'}
                </span>
                {!securityConfig.hasSecurityAdvisories && repoName && (
                  <button
                    onClick={() => handleFix('security_advisories')}
                    disabled={fixing === 'security_advisories'}
                    className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {fixing === 'security_advisories' ? 'Fixing...' : 'Fix'}
                  </button>
                )}
              </div>
            </div>

            {/* Private Vulnerability Reporting */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                {getStatusIcon(securityConfig.privateVulnerabilityReportingEnabled)}
                <span>Private Reporting</span>
              </span>
              <div className="flex items-center gap-2">
                <span className={securityConfig.privateVulnerabilityReportingEnabled ? "text-green-400" : "text-slate-500"}>
                  {securityConfig.privateVulnerabilityReportingEnabled ? 'Enabled' : 'Disabled'}
                </span>
                {!securityConfig.privateVulnerabilityReportingEnabled && repoName && (
                  <button
                    onClick={() => handleFix('private_reporting')}
                    disabled={fixing === 'private_reporting'}
                    className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {fixing === 'private_reporting' ? 'Fixing...' : 'Fix'}
                  </button>
                )}
              </div>
            </div>

            {/* Dependabot Alerts */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                {securityConfig.dependabotAlertsEnabled
                  ? getAlertIcon(securityConfig.dependabotAlertCount)
                  : getStatusIcon(false)
                }
                <span>Dependabot Alerts</span>
              </span>
              <div className="flex items-center gap-2">
                <span className={
                  securityConfig.dependabotAlertsEnabled
                    ? (securityConfig.dependabotAlertCount && securityConfig.dependabotAlertCount > 0 ? "text-yellow-400" : "text-green-400")
                    : "text-slate-500"
                }>
                  {securityConfig.dependabotAlertsEnabled
                    ? `${securityConfig.dependabotAlertCount || 0} alerts`
                    : 'Disabled'}
                </span>
                {!securityConfig.dependabotAlertsEnabled && repoName && (
                  <button
                    onClick={() => handleFix('dependabot_alerts')}
                    disabled={fixing === 'dependabot_alerts'}
                    className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {fixing === 'dependabot_alerts' ? 'Fixing...' : 'Fix'}
                  </button>
                )}
              </div>
            </div>

            {/* Code Scanning */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                {securityConfig.codeScanningEnabled
                  ? getAlertIcon(securityConfig.codeScanningAlertCount)
                  : getStatusIcon(false)
                }
                <span>Code Scanning</span>
              </span>
              <div className="flex items-center gap-2">
                <span className={
                  securityConfig.codeScanningEnabled
                    ? (securityConfig.codeScanningAlertCount && securityConfig.codeScanningAlertCount > 0 ? "text-yellow-400" : "text-green-400")
                    : "text-slate-500"
                }>
                  {securityConfig.codeScanningEnabled
                    ? `${securityConfig.codeScanningAlertCount || 0} alerts`
                    : 'Disabled'}
                </span>
                {!securityConfig.codeScanningEnabled && repoName && (
                  <button
                    onClick={() => handleFix('code_scanning')}
                    disabled={fixing === 'code_scanning'}
                    className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {fixing === 'code_scanning' ? 'Fixing...' : 'Fix'}
                  </button>
                )}
              </div>
            </div>

            {/* Secret Scanning */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                {securityConfig.secretScanningEnabled
                  ? getAlertIcon(securityConfig.secretScanningAlertCount)
                  : getStatusIcon(false)
                }
                <span>Secret Scanning</span>
              </span>
              <div className="flex items-center gap-2">
                <span className={
                  securityConfig.secretScanningEnabled
                    ? (securityConfig.secretScanningAlertCount && securityConfig.secretScanningAlertCount > 0 ? "text-yellow-400" : "text-green-400")
                    : "text-slate-500"
                }>
                  {securityConfig.secretScanningEnabled
                    ? `${securityConfig.secretScanningAlertCount || 0} alerts`
                    : 'Disabled'}
                </span>
                {!securityConfig.secretScanningEnabled && repoName && (
                  <button
                    onClick={() => handleFix('secret_scanning')}
                    disabled={fixing === 'secret_scanning'}
                    className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {fixing === 'secret_scanning' ? 'Fixing...' : 'Fix'}
                  </button>
                )}
              </div>
            </div>

            {(fixError || fixSuccess) && (
              <div className="mt-2 p-2 text-xs rounded bg-slate-800/50 border border-slate-600/50">
                {fixError && <span className="text-red-400">Error: {fixError}</span>}
                {fixSuccess && <span className="text-green-400">{fixSuccess}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}