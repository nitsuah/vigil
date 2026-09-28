import { Octokit } from '@octokit/rest';
import { detectVisualDocs, VISUAL_DOCS_PRACTICE } from '@/lib/visual-docs';

/**
 * Represents the health state of a best practice check.
 *
 * - 'missing': The best practice is not present or not implemented.
 * - 'dormant': The best practice exists but is not actively enforced or used.
 * - 'malformed': The best practice exists but is incorrectly configured or broken.
 * - 'healthy': The best practice is present and correctly configured.
 */
export type HealthState = 'missing' | 'dormant' | 'malformed' | 'healthy';

export interface BestPractice {
    type: string;
    status: HealthState;
    details: {
        exists: boolean;
        [key: string]: unknown;
    };
}

export interface BestPracticesResult {
    practices: BestPractice[];
}

export async function checkBestPractices(
    owner: string,
    repo: string,
    octokit: Octokit,
    fileList: string[],
    readmeContent?: string
): Promise<BestPracticesResult> {
    const practices: BestPractice[] = [];

    // 1. Branch Protection - comprehensive check
    let branchProtection: BestPractice = {
        type: 'branch_protection',
        status: 'missing',
        details: {
            exists: false,
            protected: false,
            requiresReviews: false,
            requiredApprovingReviews: 0,
            dismissStaleReviews: false,
            requireCodeOwnerReviews: false,
            requiredStatusChecks: false,
            strictStatusChecks: false,
            requiredStatusCheckContexts: [] as string[],
            requireSignedCommits: false,
            requireLinearHistory: false,
            allowForcePushes: false,
            allowDeletions: false,
            requiredConversationResolution: false,
            lockBranch: false,
            allowForkSyncing: false,
            score: 0,
            maxScore: 10
        }
    };
    
    try {
        // Try 'main' first, then 'master' as fallback
        let protection;
        let branchName = 'main';
        try {
            const { data } = await octokit.rest.repos.getBranchProtection({
                owner,
                repo,
                branch: 'main',
            });
            protection = data;
        } catch (mainError: unknown) {
            // If main branch not found or not protected, try master
            const status = mainError instanceof Error && 'status' in mainError
                ? (mainError as { status?: number }).status
                : undefined;
            if (status === 404) {
                try {
                    const { data } = await octokit.rest.repos.getBranchProtection({
                        owner,
                        repo,
                        branch: 'master',
                    });
                    protection = data;
                    branchName = 'master';
                } catch {
                    // Neither main nor master has protection
                }
            }
        }

        // Also check for branch protection rulesets (GitHub's newer mechanism)
        // Rulesets can protect branches even without legacy branch protection
        if (!protection) {
            try {
                // Fetch the repository to get default branch for selector resolution
                const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
                const defaultBranch = repoData.default_branch;

                // Fetch all pages of rulesets (pagination)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub API returns complex union types for rulesets
                const allRulesets: any[] = [];
                for await (const { data: page } of octokit.paginate.iterator(
                    octokit.rest.repos.getRepoRulesets,
                    { owner, repo, per_page: 100 }
                )) {
                    allRulesets.push(...page);
                }

                // Find rulesets targeting branches with active enforcement
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub API returns complex union types for rulesets
                const candidateRulesets = allRulesets.filter((rs: any) =>
                    rs.target === 'branch' && rs.enforcement === 'active'
                );

                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub API returns complex union types for rulesets
                type RulesetDetail = any;

                for (const rs of candidateRulesets) {
                    // Fetch full ruleset details to get conditions (summary may lack them)
                     
                    let ruleset: RulesetDetail = rs;
                    try {
                        const { data: fullRuleset } = await octokit.rest.repos.getRepoRuleset({
                            owner,
                            repo,
                            ruleset_id: rs.id,
                        });
                        ruleset = fullRuleset;
                    } catch {
                        ruleset = rs; // fallback to summary
                    }

                    // Check if this ruleset applies to our branch
                    // Handle include patterns: exact match, wildcards, and GitHub selectors (~DEFAULT_BRANCH, ~ALL)
                    // Also check exclude patterns - excluded branches are NOT protected by this ruleset
                    const includePatterns = ruleset.conditions?.ref_name?.include ?? [];
                    const excludePatterns = ruleset.conditions?.ref_name?.exclude ?? [];

                    // Helper: GitHub fnmatch semantics - dots are literal, * matches single segment, ** matches any depth
                    function matchesPattern(pattern: string, ref: string): boolean {
                        // Resolve GitHub selectors
                        let resolvedPattern = pattern;
                        if (pattern === '~DEFAULT_BRANCH') {
                            resolvedPattern = `refs/heads/${defaultBranch}`;
                        } else if (pattern === '~ALL') {
                            resolvedPattern = 'refs/heads/**';
                        }

                        // Convert fnmatch to regex: * -> [^/]+, ** -> .*
                        // Escape regex metacharacters (including backslash) before restoring wildcards.
                        const escaped = resolvedPattern
                            .replace(/\*\*/g, '___DOUBLE_STAR___')
                            .replace(/\*/g, '___SINGLE_STAR___')
                            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                            .replace(/___DOUBLE_STAR___/g, '.*')
                            .replace(/___SINGLE_STAR___/g, '[^/]+');
                        const regex = new RegExp('^' + escaped + '$');
                        return regex.test(ref);
                    }

                    const ref = `refs/heads/${branchName}`;

                    const matchesInclude = includePatterns.some((pattern: string) =>
                        matchesPattern(pattern, ref)
                    );

                    const matchesExclude = excludePatterns.some((pattern: string) =>
                        matchesPattern(pattern, ref)
                    );

                    if (matchesInclude && !matchesExclude) {
                        // Extract ruleset rules and map to legacy protection fields for scoring
                        const rulesetRules = ruleset.rules ?? [];
                        type RulesetRule = { type: string; parameters?: Record<string, unknown> };
                        const reviewsRule = rulesetRules.find((r: RulesetRule) => r.type === 'pull_request');
                        const statusChecksRule = rulesetRules.find((r: RulesetRule) => r.type === 'required_status_checks');
                        const signedCommitsRule = rulesetRules.find((r: RulesetRule) => r.type === 'required_signatures');
                        const linearHistoryRule = rulesetRules.find((r: RulesetRule) => r.type === 'required_linear_history');
                        const conversationResolutionRule = rulesetRules.find((r: RulesetRule) => r.type === 'required_conversation_resolution');
                        const forcePushRule = rulesetRules.find((r: RulesetRule) => r.type === 'force_push');
                        const deletionRule = rulesetRules.find((r: RulesetRule) => r.type === 'deletion');
                        const forkSyncRule = rulesetRules.find((r: RulesetRule) => r.type === 'fork_sync');

                        protection = {
                            source: 'ruleset',
                            ruleset,
                            required_pull_request_reviews: reviewsRule?.parameters ?? undefined,
                            required_status_checks: statusChecksRule?.parameters ?? undefined,
                            required_signatures: signedCommitsRule?.parameters ?? undefined,
                            required_linear_history: linearHistoryRule?.parameters ?? undefined,
                            required_conversation_resolution: conversationResolutionRule?.parameters ?? undefined,
                            allow_force_pushes: forcePushRule?.parameters ?? { enabled: false },
                            allow_deletions: deletionRule?.parameters ?? { enabled: false },
                            lock_branch: { enabled: false }, // rulesets don't have lock_branch
                            allow_fork_syncing: forkSyncRule?.parameters ?? { enabled: false },
                        };
                        break;
                    }
                }
            } catch {
                // Rulesets API not available or no rulesets
            }
        }

        if (protection) {
            // Type narrowing for protection rules
            type ProtectionRules = {
                required_pull_request_reviews?: { required_approving_review_count?: number; dismiss_stale_reviews?: boolean; require_code_owner_reviews?: boolean };
                required_status_checks?: { strict?: boolean; contexts?: string[] };
                required_signatures?: Record<string, unknown>;
                required_linear_history?: Record<string, unknown>;
                required_conversation_resolution?: Record<string, unknown>;
                allow_force_pushes?: { enabled: boolean };
                allow_deletions?: { enabled: boolean };
                lock_branch?: { enabled: boolean };
                allow_fork_syncing?: { enabled: boolean };
            };

            const rules = protection as ProtectionRules;
            const reviews = rules.required_pull_request_reviews;
            const statusChecks = rules.required_status_checks;

            // Calculate score based on protection features (10 conditions, maxScore=10)
            let score = 0;
            const maxScore = 10;

            // 1. Basic protection exists
            score += 1;

            // 2. Requires PR reviews
            const hasReviews = reviews !== undefined;
            if (hasReviews) score += 1;

            // 3. Requires minimum approving reviews (>= 1)
            const requiredApprovingReviews = reviews?.required_approving_review_count ?? 0;
            if (requiredApprovingReviews >= 1) score += 1;

            // 4. Dismisses stale reviews on new commits
            const dismissStaleReviews = reviews?.dismiss_stale_reviews ?? false;
            if (dismissStaleReviews) score += 1;

            // 5. Requires code owner reviews
            const requireCodeOwnerReviews = reviews?.require_code_owner_reviews ?? false;
            if (requireCodeOwnerReviews) score += 1;

            // 6. Requires status checks
            const hasStatusChecks = statusChecks !== undefined;
            if (hasStatusChecks) score += 1;

            // 7. Strict status checks (branches must be up to date)
            const strictStatusChecks = statusChecks?.strict ?? false;
            if (strictStatusChecks) score += 1;

            // 8. Requires signed commits
            const requireSignedCommits = protection?.required_signatures?.enabled ?? false;
            if (requireSignedCommits) score += 1;

            // 9. Requires linear history
            const requireLinearHistory = protection?.required_linear_history?.enabled ?? false;
            if (requireLinearHistory) score += 1;

            // 10. Required conversation resolution
            const requiredConversationResolution = protection?.required_conversation_resolution?.enabled ?? false;
            if (requiredConversationResolution) score += 1;
            
            // Determine status based on score (out of 10)
            // >= 7 healthy, >= 4 dormant, >= 1 malformed
            let status: HealthState = 'missing';
            if (score >= 7) status = 'healthy';
            else if (score >= 4) status = 'dormant';
            else if (score >= 1) status = 'malformed';
            
            branchProtection = {
                type: 'branch_protection',
                status,
                details: {
                    exists: true,
                    protected: true,
                    requiresReviews: hasReviews,
                    requiredApprovingReviews,
                    dismissStaleReviews,
                    requireCodeOwnerReviews,
                    requiredStatusChecks: hasStatusChecks,
                    strictStatusChecks,
                    requiredStatusCheckContexts: statusChecks?.contexts ?? [],
                    requireSignedCommits,
                    requireLinearHistory,
                    allowForcePushes: protection?.allow_force_pushes?.enabled ?? false,
                    allowDeletions: protection?.allow_deletions?.enabled ?? false,
                    requiredConversationResolution,
                    lockBranch: protection?.lock_branch?.enabled ?? false,
                    allowForkSyncing: protection?.allow_fork_syncing?.enabled ?? false,
                    score,
                    maxScore
                }
            };
        } else {
            branchProtection.status = 'missing';
        }
    } catch {
        console.warn(`Failed to check branch protection for ${owner}/${repo}`);
    }
    practices.push(branchProtection);

    // 2. .gitignore
    const gitignoreExists = fileList.includes('.gitignore');
    practices.push({
        type: 'gitignore',
        status: gitignoreExists ? 'healthy' : 'missing',
        details: { exists: gitignoreExists }
    });

    // 3. CI/CD Detection
    const cicdFiles = [
        '.github/workflows',
        '.gitlab-ci.yml',
        'netlify.toml',
        '.circleci',
        'azure-pipelines.yml',
        'bitbucket-pipelines.yml'
    ];
    const detectedCICD = fileList.filter(f => cicdFiles.some(ci => f.includes(ci)));
    const hasCICD = detectedCICD.length > 0;
    
    // Check if CI/CD files seem minimal/template (dormant check)
    let cicdStatus: HealthState = 'missing';
    if (hasCICD) {
        // If we detect workflow files, consider them healthy by default
        // Could be enhanced to check file size/content in the future
        cicdStatus = 'healthy';
    }
    
    practices.push({
        type: 'ci_cd',
        status: cicdStatus,
        details: { 
            exists: hasCICD,
            detected: detectedCICD
        }
    });

    // 4. Pre-commit Hooks Detection
    const preCommitFiles = ['.husky/', '.git/hooks/', '.pre-commit-config.yaml'];
    const detectedHooks = fileList.filter(f => preCommitFiles.some(hook => f.includes(hook)));
    const hasHooks = detectedHooks.length > 0;
    practices.push({
        type: 'pre_commit_hooks',
        status: hasHooks ? 'healthy' : 'missing',
        details: { 
            exists: hasHooks,
            detected: detectedHooks
        }
    });

    // 5. Testing Framework Detection
    const testingFiles = [
        'vitest.config',
        'jest.config',
        'playwright.config',
        'cypress.config',
        '.mocharc',
        'pytest.ini',
        'pyproject.toml',  // Can contain pytest config
        'tox.ini',
        // Web3/Solidity testing frameworks
        'hardhat.config',  // Hardhat testing framework
        'truffle-config',  // Truffle testing framework
        'foundry.toml',    // Foundry testing framework
        'dappfile',        // DappTools testing
        'brownie-config'   // Brownie testing framework
    ];
    const detectedTestingConfigs = fileList.filter(f => testingFiles.some(test => f.includes(test)));
    const hasTesting = detectedTestingConfigs.length > 0;
    
    // Count test files
    const testFilePatterns = [
        '.test.', 
        '.spec.', 
        '__tests__/',
        'tests/',      // Match tests/ at any level (not just /tests/)
        'test/',       // Match test/ at any level  
        'e2e/',
        'test_',       // Python test files: test_*.py
        '_test.',      // Go test files: *_test.go
        '.t.sol'       // Solidity test files (Foundry convention)
    ];
    const testFiles = fileList.filter(f => 
        testFilePatterns.some(pattern => f.toLowerCase().includes(pattern))
    );
    
    // Testing is 'dormant' if config exists but no test files, 'healthy' if both exist
    let testingStatus: HealthState = 'missing';
    if (hasTesting) {
        testingStatus = testFiles.length > 0 ? 'healthy' : 'dormant';
    }
    
    practices.push({
        type: 'testing_framework',
        status: testingStatus,
        details: { 
            exists: hasTesting,
            detected: detectedTestingConfigs,
            testFileCount: testFiles.length,
            testFiles: testFiles.slice(0, 10) // Limit to first 10 for details
        }
    });

    // 6. Linting
    const lintingFiles = [
        '.eslintrc',
        'eslint.config',
        '.prettierrc',
        'biome.json',
        '.flake8',
        '.pylintrc',
        'pylint.ini',
        'ruff.toml',
        'pyproject.toml',  // Can contain ruff/black/isort config
        // Web3/Solidity linting
        '.solhint.json',   // Solhint config
        '.solhintrc',      // Alternative Solhint config
        'slither.config',  // Slither static analyzer
        'mythril.yml'      // Mythril security analyzer
    ];
    const hasLinting = fileList.some(f => lintingFiles.some(lint => f.includes(lint)));
    practices.push({
        type: 'linting',
        status: hasLinting ? 'healthy' : 'missing',
        details: { 
            exists: hasLinting,
            detected: fileList.filter(f => lintingFiles.some(lint => f.includes(lint)))
        }
    });

    // 7. Deploy Badge
    type Evidence = { url: string; alt?: string; confidence: number; kind: 'deploy'|'ci'|'qa'|'unknown' };
    let deployBadgeStatus: HealthState = 'missing';
    let deployBadgeDetails: { exists: boolean; evidence?: Evidence[]; hasCI?: boolean; isDeployable?: boolean } = { exists: false };
    
    if (readmeContent) {
        // Check for common deployment badges
        // Robust detection of CI/CD and deploy badges via URL + alt-text keywords with scoring
        const badgeMdRegex = /!\[[^\]]*\]\(([^)]+)\)/gi; // Markdown image
        const badgeLinkMdRegex = /\[!\[[^\]]*\]\(([^)]+)\)\]\(([^)]+)\)/gi; // Linked badge
        const badgeHtmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']+)["'])?[^>]*>/gi; // HTML image
        
        const urlPatterns: RegExp[] = [
            /github\.com\/.+?\/actions\/workflows\/.+?\.yml\/badge\.svg/i, // GitHub Actions workflow badge
            /api\.netlify\.com\/api\/v1\/badges\/[a-f0-9-]+\/deploy-status(?:\?branch=[^\s"')]+)?/i, // Netlify deploy badge
            /img\.shields\.io\/badge\/Deployed%20on-Vercel(?:-black)?/i, // Vercel deployed-on badge
            /gitlab\.com\/.+?\/badges\/.+?\/pipeline\.svg/i, // GitLab pipeline
            /circleci\.com\/gh\/.+?\.svg/i, // CircleCI
            /travis-ci\.(com|org)\/.+?\.svg/i // Travis
        ];
        const lowConfidencePatterns: RegExp[] = [
            /img\.shields\.io\/.*(deploy|deployment|vercel|netlify|render|pages)/i, // generic shields - low confidence
        ];
        const altKeywords = /(deploy|deployment|deployed|ci|cd|build|pipeline|actions|netlify|vercel|render|pages|status)/i;

        const evidences: Evidence[] = [];

        function score(url: string, alt?: string): Evidence {
            let confidence = 0;
            const highConfidenceMatch = urlPatterns.some(p => p.test(url));
            const lowConfidenceMatch = lowConfidencePatterns.some(p => p.test(url));
            if (highConfidenceMatch) confidence += 0.6;
            else if (lowConfidenceMatch) confidence += 0.4; // Lower confidence for generic patterns
            if (alt && altKeywords.test(alt)) confidence += 0.3;
            // simple type classification
            const lower = url.toLowerCase() + ' ' + (alt || '').toLowerCase();
            let kind: Evidence['kind'] = 'unknown';
            if (/(netlify|vercel|render|pages|deploy)/.test(lower)) kind = 'deploy';
            else if (/(actions|workflow|pipeline|circleci|travis|gitlab)/.test(lower)) kind = 'ci';
            else if (/(pylint|bandit|codeql|coverage|lint|test)/.test(lower)) kind = 'qa';
            return { url, alt, confidence, kind };
        }

    // Extract Markdown badges
    for (const match of readmeContent.matchAll(badgeMdRegex)) {
        const src = match[1] || '';
        evidences.push(score(src));
    }
    // Extract linked badges
    for (const match of readmeContent.matchAll(badgeLinkMdRegex)) {
        const src = match[1] || '';
        evidences.push(score(src));
    }
    // Extract HTML badges
    for (const match of readmeContent.matchAll(badgeHtmlRegex)) {
        const src = match[1] || '';
        const alt = match[2];
        evidences.push(score(src, alt));
    }
    const top = evidences.sort((a, b) => b.confidence - a.confidence)[0];
    const hasDeploy = evidences.some(e => e.kind === 'deploy' && e.confidence >= 0.6) ||
        (top && top.confidence >= 0.8 && /deploy|netlify|vercel|render|pages/i.test((top.alt || '') + top.url));
    
    // Check if repo has ANY quality badge (CI, QA, deploy) - having something is better than nothing
    const hasAnyCIorQABadge = evidences.some(e => 
        (e.kind === 'ci' || e.kind === 'qa') && e.confidence >= 0.6
    );
    
        // For non-deployable repos (tools, libraries, bots), CI badges are sufficient
        const isLikelyDeployable = fileList.some(f => 
            f.includes('netlify.toml') || 
            f.includes('vercel.json') || 
            f.includes('render.yaml') ||
            f.includes('fly.toml') ||
            f.includes('railway.json') ||
            f.includes('Procfile') ||
            f.includes('app.yaml') || // Google App Engine
            f.includes('azure-pipelines.yml')
        );

        deployBadgeStatus = hasDeploy ? 'healthy' : 
                hasAnyCIorQABadge && !isLikelyDeployable ? 'healthy' : // CI badge is good enough for non-deployable repos
                hasAnyCIorQABadge && isLikelyDeployable ? 'dormant' : // Has CI but should have deploy badge
                evidences.some(e=>e.kind==='deploy' && e.confidence>=0.4) ? 'dormant' : 
                'missing';
        
        deployBadgeDetails = {
            exists: hasDeploy || (hasAnyCIorQABadge && !isLikelyDeployable),
            evidence: evidences.slice(0,5),
            hasCI: hasAnyCIorQABadge,
            isDeployable: isLikelyDeployable
        };
    }
    
    // Always add deploy_badge practice, even if README is not available
    practices.push({
        type: 'deploy_badge',
        status: deployBadgeStatus,
        details: deployBadgeDetails
    });

    // 8. Environment Template
    const hasEnvExample = fileList.some(f => f.includes('.env.example') || f.includes('.env.template'));
    practices.push({
        type: 'env_template',
        status: hasEnvExample ? 'healthy' : 'missing',
        details: { exists: hasEnvExample }
    });

    // 9. Dependabot
    const hasDependabot = fileList.some(f => f.includes('.github/dependabot.yml'));
    practices.push({
        type: 'dependabot',
        status: hasDependabot ? 'healthy' : 'missing',
        details: { exists: hasDependabot }
    });

    // 10. Docker
    const dockerFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore'];
    const detectedDockerFiles = fileList.filter(f => {
        const lowerF = f.toLowerCase();
        return dockerFiles.some(docker => {
            const lowerDocker = docker.toLowerCase();
            // Match exact files or variants like Dockerfile.test, docker-compose.test.yml
            return lowerF.endsWith(lowerDocker) || 
                   lowerF.includes(`/${lowerDocker}`) ||
                   lowerF.match(new RegExp(`dockerfile(?:\\.\\w+)?$`)) ||
                   lowerF.match(new RegExp(`docker-compose(?:\\.\\w+)?\\.ya?ml$`));
        });
    });
    const hasDocker = detectedDockerFiles.length > 0;
    practices.push({
        type: 'docker',
        status: hasDocker ? 'healthy' : 'missing',
        details: { 
            exists: hasDocker,
            detected: detectedDockerFiles
        }
    });

    // 11. Visual docs (diagrams + screenshots embedded in README) — informational, not scored
    const visualDocs = detectVisualDocs(fileList, readmeContent);
    practices.push({ type: VISUAL_DOCS_PRACTICE, ...visualDocs });

    return { practices };
}
