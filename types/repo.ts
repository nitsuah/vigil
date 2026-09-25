// Shared repository and detail types

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
  section: string | null;
  subsection?: string | null;
}

export interface RoadmapItem {
  id: string;
  title: string;
  quarter: string | null;
  status: 'planned' | 'in-progress' | 'completed';
  linked_pr_number?: number | null;
  agent_task_id?: string | null;
}

export interface DocStatus {
  doc_type: string;
  exists: boolean;
  health_state?: string;
}

export interface Metric {
  name: string;
  value: number;
  unit: string | null;
}

export interface Feature {
  id: string;
  category: string;
  title: string;
  description: string;
  items: string[];
}

export interface BestPractice {
  practice_type: string;
  status: string;
  details: Record<string, unknown>;
}

export interface CommunityStandard {
  standard_type: string;
  status: string;
  details: Record<string, unknown>;
}

export interface SecurityConfig {
  hasSecurityPolicy: boolean;
  hasSecurityAdvisories: boolean;
  privateVulnerabilityReportingEnabled: boolean;
  dependabotAlertsEnabled: boolean;
  dependabotAlertCount: number;
  codeScanningEnabled: boolean;
  codeScanningAlertCount: number;
  secretScanningEnabled: boolean;
  secretScanningAlertCount: number;
}

export interface Repo {
  health_profile?: 'starter' | 'production' | 'enterprise';
  id: string;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  branches_count: number;
  url: string;
  homepage: string | null;
  topics: string[];
  last_synced: string;
  is_fork?: boolean;
  repo_type?: string;
  health_score?: number;
  testing_status?: string;
  coverage_score?: number;
  ai_summary?: string;
  last_commit_date?: string | null;
  open_prs?: number;
  prs_ready_count?: number;
  prs_blocked_count?: number;
  stale_review_count?: number;
  stale_review_pr_numbers?: number[] | null;
  zombie_branch_count?: number;
  token_density?: number | null;
  comment_to_code_ratio?: number | null;
  open_issues?: number;
  open_issues_count?: number | null;
  stale_issues_count?: number | null;
  readme_last_updated?: string | null;
  total_loc?: number;
  loc_language_breakdown?: Record<string, number>;
  test_case_count?: number;
  test_describe_count?: number;
  ci_status?: string;
  ci_last_run?: string | null;
  ci_workflow_name?: string | null;
  vuln_alert_count?: number;
  vuln_critical_count?: number;
  vuln_high_count?: number;
  vuln_last_checked?: string | null;
  contributor_count?: number;
  commit_frequency?: number;
  bus_factor?: number;
  avg_pr_merge_time_hours?: number;
  is_hidden?: boolean;
  has_security_policy?: boolean;
  has_security_advisories?: boolean;
  private_vuln_reporting_enabled?: boolean;
  dependabot_alerts_enabled?: boolean;
  dependabot_alert_count?: number;
  code_scanning_enabled?: boolean;
  code_scanning_alert_count?: number;
  secret_scanning_enabled?: boolean;
  secret_scanning_alert_count?: number;
  security_last_checked?: string | null;
}

export interface RepoDetails {
  tasks: Task[];
  roadmapItems: RoadmapItem[];
  docStatuses: DocStatus[];
  metrics: Metric[];
  features: Feature[];
  bestPractices: BestPractice[];
  communityStandards: CommunityStandard[];
  securityConfig?: SecurityConfig;
}
