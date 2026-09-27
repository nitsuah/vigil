/**
 * Fictional demo portfolio for promo captures (owner "acme"). Every screen in
 * the promo is the real vigil UI rendering this data through mocked APIs, so
 * nothing here is the owner's portfolio. Change it, then re-run
 * `promo/build.sh --recapture`.
 */

export const OWNER = 'acme';

type Grade = { name: string; description: string; language: string; type: string; health: number; ci?: string; prs?: number };

export const REPOS: Grade[] = [
    { name: 'storefront', description: 'Customer-facing web shop', language: 'TypeScript', type: 'web-app', health: 94, prs: 2 },
    { name: 'api-gateway', description: 'Public REST + webhook edge', language: 'Go', type: 'tool', health: 88, prs: 1 },
    { name: 'auth-service', description: 'Sessions, SSO and API keys', language: 'Go', type: 'tool', health: 91 },
    { name: 'mobile-app', description: 'iOS + Android client', language: 'TypeScript', type: 'web-app', health: 76, prs: 3 },
    { name: 'design-system', description: 'Shared React components', language: 'TypeScript', type: 'library', health: 97 },
    { name: 'billing', description: 'Invoices, plans and dunning', language: 'Python', type: 'tool', health: 68, ci: 'failing', prs: 1 },
    { name: 'analytics', description: 'Event pipeline and dashboards', language: 'Python', type: 'research', health: 82 },
    { name: 'infra', description: 'Terraform and deploy pipelines', language: 'HCL', type: 'tool', health: 85 },
    { name: 'docs-site', description: 'Developer documentation', language: 'MDX', type: 'web-app', health: 58 },
    { name: 'cli', description: 'Command-line client', language: 'Rust', type: 'tool', health: 90 },
];

type T = [repo: string, title: string, priority: 'P0' | 'P1' | 'P2' | 'P3' | null, status?: 'todo' | 'in-progress'];

export const TASKS: T[] = [
    ['billing', 'Fix failing proration test on plan downgrade', 'P0', 'in-progress'],
    ['billing', 'Retry failed card charges with backoff', 'P1'],
    ['billing', 'Move invoice PDFs to signed URLs', 'P2'],
    ['api-gateway', 'Rate-limit the public webhook endpoint', 'P0'],
    ['api-gateway', 'Rotate the staging TLS certificate', 'P1', 'in-progress'],
    ['api-gateway', 'Add request tracing headers', 'P2'],
    ['mobile-app', 'Crash on resume after background refresh', 'P1'],
    ['mobile-app', 'Offline cart sync', 'P2'],
    ['mobile-app', 'Dark mode for settings screens', 'P3'],
    ['storefront', 'Checkout button hidden on small screens', 'P1'],
    ['storefront', 'Lazy-load product images below the fold', 'P2'],
    ['storefront', 'Wishlist sharing', 'P3'],
    ['auth-service', 'Expire API keys unused for 90 days', 'P1'],
    ['auth-service', 'SAML metadata refresh job', 'P2'],
    ['docs-site', 'Broken links in the webhook guide', 'P1'],
    ['docs-site', 'Search across API reference', 'P2'],
    ['analytics', 'Backfill events dropped on 09-14', 'P2', 'in-progress'],
    ['analytics', 'Weekly retention dashboard', 'P3'],
    ['infra', 'Pin the Terraform provider versions', 'P2'],
    ['infra', 'Staging cost alerts', 'P3'],
    ['design-system', 'Date picker keyboard navigation', 'P2'],
    ['cli', 'Shell completion for zsh', 'P3'],
    ['cli', 'Config file validation', null],
];

/** [source, kind, target, context, status] — source uses target. */
export const RELATIONSHIPS: [string, string, string, string, 'confirmed' | 'proposed'][] = [
    ['storefront', 'calls', 'api-gateway', 'Every page load reads catalog and cart through the gateway', 'confirmed'],
    ['mobile-app', 'calls', 'api-gateway', 'All app traffic goes through the public gateway', 'confirmed'],
    ['api-gateway', 'calls', 'auth-service', 'Validates sessions and API keys on each request', 'confirmed'],
    ['storefront', 'embeds', 'design-system', 'Buttons, forms and the checkout modal', 'confirmed'],
    ['mobile-app', 'depends_on', 'design-system', 'Shares tokens and icons via the npm package', 'confirmed'],
    ['billing', 'shares_data', 'analytics', 'Writes invoice events into the analytics warehouse', 'confirmed'],
    ['infra', 'deploys', 'api-gateway', 'Terraform module and blue/green deploy pipeline', 'confirmed'],
    ['cli', 'calls', 'api-gateway', 'Found GATEWAY_URL in src/config.rs', 'proposed'],
];

/** Repo-details panel data for the repo the promo expands (a C grade with gaps to fix). */
export const DETAIL_REPO = 'mobile-app';
export const DOCS: [string, boolean, string][] = [
    ['readme', true, 'healthy'], ['roadmap', true, 'healthy'], ['tasks', true, 'healthy'], ['features', true, 'dormant'],
    ['metrics', false, 'missing'], ['changelog', true, 'healthy'], ['contributing', false, 'missing'], ['license', true, 'healthy'],
];
export const PRACTICES: [string, string][] = [
    ['ci_cd', 'healthy'], ['testing_framework', 'healthy'], ['linting', 'healthy'], ['gitignore', 'healthy'],
    ['branch_protection', 'missing'], ['pre_commit_hooks', 'missing'], ['dependabot', 'missing'], ['docker', 'healthy'],
    ['env_template', 'healthy'], ['deploy_badge', 'dormant'], ['visual_docs', 'missing'],
];
/** Files the Fix All preview proposes for the missing, fixable practices above (first one opens active). */
export const FIX_PREVIEWS = [
    { type: 'practice', docType: 'dependabot', practiceType: 'dependabot', path: '.github/dependabot.yml', content: `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
` },
    { type: 'practice', docType: 'pre_commit_hooks', practiceType: 'pre_commit_hooks', path: '.husky/pre-commit', content: `#!/usr/bin/env sh
npx lint-staged
` },
];
export const STANDARDS: [string, string][] = [
    ['license', 'healthy'], ['contributing', 'missing'], ['code_of_conduct', 'healthy'], ['security', 'missing'],
    ['issue_template', 'healthy'], ['pr_template', 'healthy'], ['changelog', 'healthy'], ['codeowners', 'missing'],
    ['copilot_instructions', 'healthy'], ['flow_tasks_prompt', 'healthy'], ['handoff_prompt', 'healthy'], ['funding', 'missing'],
];
