export type SecurityControl =
  | 'security_policy'
  | 'security_advisories'
  | 'private_reporting'
  | 'dependabot_alerts'
  | 'code_scanning'
  | 'secret_scanning';

export interface SecurityRemediation {
  /** The GitHub page where this control is turned on or created. */
  url: string;
  /** Access, plan or visibility prerequisite to show beside the link. */
  prerequisite: string;
}

const FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Where to fix a disabled control by hand. Throws on a malformed owner/repo so a bad name never becomes a URL. */
export function securityRemediation(control: SecurityControl, fullName: string): SecurityRemediation {
  if (!FULL_NAME.test(fullName)) throw new Error(`Invalid repository name: ${fullName}`);
  const base = `https://github.com/${fullName}`;
  const analysis = `${base}/settings/security_analysis`;
  switch (control) {
    case 'security_policy':
      return { url: `${base}/security/policy`, prerequisite: 'Needs write access. Adds a SECURITY.md.' };
    case 'security_advisories':
      return { url: `${base}/security/advisories`, prerequisite: 'Needs admin or security manager access.' };
    case 'private_reporting':
      return { url: analysis, prerequisite: 'Needs admin access. Availability depends on repository visibility and plan.' };
    case 'dependabot_alerts':
      return { url: analysis, prerequisite: 'Needs admin access.' };
    case 'code_scanning':
      return { url: analysis, prerequisite: 'Needs admin access. Private repositories need a plan that includes code scanning.' };
    case 'secret_scanning':
      return { url: analysis, prerequisite: 'Needs admin access. Private repositories need a plan that includes secret scanning.' };
  }
}