
import { GitHubClient, RepoMetadata } from './github';
import { parseRoadmap, diffRoadmapItems } from './parsers/roadmap';
import { parseTasks } from './parsers/tasks';
import { parseMetrics } from './parsers/metrics';
import { parseFeatures } from './parsers/features';
import { calculateDocHealthState, hashContent } from './doc-health';
import { checkBestPractices } from './best-practices';
import { checkCommunityStandards } from './community-standards';
import { calculateHealthScore } from './health-score';
import { buildHealthScoreInputs, type RepoHealthFields, type RepoHealthRows } from './health-score-inputs';
import { isTestFile, parseTestFile } from './parsers/test-cases';
import { aggregateCodeDensity } from './parsers/code-density';
import { ensureSchema } from './db';
import logger from './log';

const ORG_GITHUB_FALLBACK_CACHE = new Map<string, { files: string[]; expiresAt: number }>();
const FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getOrgGithubFallbackFiles(github: GitHubClient, owner: string): Promise<string[]> {
    const cached = ORG_GITHUB_FALLBACK_CACHE.get(owner);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.files;
    }

    const files = await github.getRepoFileList('.github', owner);
    ORG_GITHUB_FALLBACK_CACHE.set(owner, { files, expiresAt: Date.now() + FALLBACK_CACHE_TTL_MS });
    return files;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncRepoMetadata(repo: RepoMetadata, db: any) {
    await ensureSchema(db);

    const lastCommitDate = repo.pushedAt; // Approximation

    await db`
        INSERT INTO repos (
            name, full_name, description, language, stars, forks, open_issues, url, homepage, topics,
            last_synced, updated_at, last_commit_date, is_archived, private_repo, visibility_verified
        )
        VALUES (
            ${repo.name}, ${repo.fullName}, ${repo.description}, ${repo.language}, ${repo.stars},
            ${repo.forks}, ${repo.openIssues}, ${repo.url}, ${repo.homepage}, ${repo.topics},
            NOW(), NOW(), ${lastCommitDate}, ${repo.archived}, ${repo.isPrivate}, TRUE
        )
        ON CONFLICT (full_name) DO UPDATE SET
          description = EXCLUDED.description,
          language = EXCLUDED.language,
          stars = EXCLUDED.stars,
          forks = EXCLUDED.forks,
          open_issues = EXCLUDED.open_issues,
          url = EXCLUDED.url,
          homepage = EXCLUDED.homepage,
          topics = EXCLUDED.topics,
          last_synced = NOW(),
          updated_at = NOW(),
          last_commit_date = EXCLUDED.last_commit_date,
          is_archived = EXCLUDED.is_archived,
          private_repo = EXCLUDED.private_repo,
          visibility_verified = TRUE
    `;
}

// PostgreSQL NUMERIC columns reject Infinity/-Infinity; return null for any non-finite value.
function finiteOrNull(n: number | null | undefined): number | null {
    return n != null && Number.isFinite(n) ? n : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncRepo(repo: RepoMetadata, github: GitHubClient, db: any) {
    await ensureSchema(db);

    const owner = repo.fullName.split('/')[0];

    // Fetch additional metrics
    let lastCommitDate = null;
    let openPrs = 0;
    let prsReadyCount = 0;
    let prsBlockedCount = 0;
    let staleReviewCount = 0;
    let staleReviewPrNumbers: number[] = [];
    let zombieBranchCount = 0;

    try {
        // Use pushedAt from repo metadata as last commit approximation
        lastCommitDate = repo.pushedAt;
    } catch (e) {
        console.warn(`Failed to get commit data for ${repo.fullName}`, e);
    }

    try {
        // Get open PRs count
        const prs = await github.getPullRequests(repo.name, owner);
        openPrs = prs.length;
    } catch (e) {
        console.warn(`Failed to fetch PRs for ${repo.fullName}`, e);
    }

    if (openPrs > 0) {
        try {
            const readiness = await github.getPullRequestReadiness(repo.name, owner);
            prsReadyCount = readiness.readyCount;
            prsBlockedCount = readiness.blockedCount;
            staleReviewCount = readiness.staleReviewCount;
            staleReviewPrNumbers = readiness.staleReviewPrNumbers;
        } catch (e) {
            console.warn(`Failed to fetch PR readiness for ${repo.fullName}`, e);
        }
    }

    // Fetch branches count
    let branchesCount = 0;
    try {
        const branches = await github.getBranches(repo.name, owner);
        branchesCount = branches.length;
    } catch (e) {
        console.warn(`Could not get branches for ${repo.name}:`, (e as Error).message);
    }

    // Fetch zombie (stale long-lived) branches — excludes the default branch
    // since it's the active trunk.
    try {
        const zombieBranches = await github.getZombieBranches(repo.name, owner);
        zombieBranchCount = zombieBranches.filter((b) => b.name !== repo.defaultBranch).length;
    } catch (e) {
        console.warn(`Could not get zombie branches for ${repo.name}:`, (e as Error).message);
    }

    // Fetch README last updated
    let readmeLastUpdated: string | null = null;
    try {
        readmeLastUpdated = await github.getFileLastModified(repo.name, 'README.md', owner);
    } catch (e) {
        console.warn(`Could not get README last modified for ${repo.name}:`, (e as Error).message);
    }

    // Fetch LOC (Lines of Code) metrics
    let totalLoc = 0;
    let locLanguageBreakdown: Record<string, number> = {};
    try {
        const languageStats = await github.getLanguageStats(repo.name, owner);
        locLanguageBreakdown = languageStats;
        // GitHub returns bytes, rough estimate: 1 LOC ~= 50 bytes (average line length)
        totalLoc = Math.round(Object.values(languageStats).reduce((sum, bytes) => sum + bytes, 0) / 50);
    } catch (e) {
        console.warn(`Could not get language stats for ${repo.name}:`, (e as Error).message);
    }

    // Fetch CI/CD status from GitHub Actions
    let ciStatus = 'unknown';
    let ciLastRun: string | null = null;
    let ciWorkflowName: string | null = null;
    try {
        const workflowData = await github.getWorkflowRuns(repo.name, owner);
        ciStatus = workflowData.status;
        ciLastRun = workflowData.lastRun;
        ciWorkflowName = workflowData.workflowName;
    } catch (e) {
        console.warn(`Could not get workflow runs for ${repo.name}:`, (e as Error).message);
    }

    // Fetch vulnerability alerts
    let vulnAlertCount = 0;
    let vulnCriticalCount = 0;
    let vulnHighCount = 0;
    try {
        const vulnData = await github.getVulnerabilityAlerts(repo.name, owner);
        vulnAlertCount = vulnData.total;
        vulnCriticalCount = vulnData.critical;
        vulnHighCount = vulnData.high;
    } catch (e) {
        console.warn(`Could not get vulnerability alerts for ${repo.name}:`, (e as Error).message);
    }

    // Fetch contributor metrics
    let contributorCount = 0;
    let commitFrequency: number | null = null;
    let busFactor = 0;
    try {
        const contributorStats = await github.getContributorStats(repo.name, owner);
        contributorCount = contributorStats.contributorCount;
        commitFrequency = contributorStats.commitFrequency;
        busFactor = contributorStats.busFactor;
    } catch (e) {
        console.warn(`Could not get contributor stats for ${repo.name}:`, (e as Error).message);
    }

    // Fetch PR merge time
    let avgPrMergeTimeHours = 0;
    try {
        const prStats = await github.getPullRequestStats(repo.name, owner);
        avgPrMergeTimeHours = prStats.avgMergeTimeHours;
    } catch (e) {
        console.warn(`Could not get PR stats for ${repo.name}:`, (e as Error).message);
    }

    // Fetch issues. Both counts stay NULL if the scan fails, so the health score
    // falls back to open_issues instead of treating the repo as issue-free.
    let openIssuesCountDetailed: number | null = null;
    let staleIssuesCount: number | null = null;
    try {
        const issues = await github.getIssues(repo.name, owner, 'open', 100);
        openIssuesCountDetailed = issues.length;
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        staleIssuesCount = issues.filter((issue) => new Date(issue.updatedAt).getTime() < ninetyDaysAgo).length;
    } catch (e) {
        console.warn(`Could not get issues for ${repo.name}:`, (e as Error).message);
    }

    // Fetch security configuration
    let hasSecurityPolicy = false;
    let hasSecurityAdvisories = false;
    let privateVulnReportingEnabled = false;
    let dependabotAlertsEnabled = false;
    let dependabotAlertCount = 0;
    let codeScanningEnabled = false;
    let codeScanningAlertCount = 0;
    let secretScanningEnabled = false;
    let secretScanningAlertCount = 0;
    try {
        const securityConfig = await github.getSecurityConfig(repo.name, owner);
        hasSecurityPolicy = securityConfig.hasSecurityPolicy;
        hasSecurityAdvisories = securityConfig.hasSecurityAdvisories;
        privateVulnReportingEnabled = securityConfig.privateVulnerabilityReportingEnabled;
        dependabotAlertsEnabled = securityConfig.dependabotAlertsEnabled;
        dependabotAlertCount = securityConfig.dependabotAlertCount;
        codeScanningEnabled = securityConfig.codeScanningEnabled;
        codeScanningAlertCount = securityConfig.codeScanningAlertCount;
        secretScanningEnabled = securityConfig.secretScanningEnabled;
        secretScanningAlertCount = securityConfig.secretScanningAlertCount;
    } catch (e) {
        console.warn(`Could not get security config for ${repo.name}:`, (e as Error).message);
    }

    // Upsert repo with new metrics
    const repoRows = await db`
        INSERT INTO repos (
            name, full_name, description, language, stars, forks, open_issues, url, homepage, topics,
            last_synced, updated_at, last_commit_date, open_prs, prs_ready_count, prs_blocked_count, stale_review_count, stale_review_pr_numbers, branches_count, zombie_branch_count, readme_last_updated,
            total_loc, loc_language_breakdown, ci_status, ci_last_run, ci_workflow_name,
            vuln_alert_count, vuln_critical_count, vuln_high_count, vuln_last_checked,
            contributor_count, commit_frequency, bus_factor, avg_pr_merge_time_hours, contributors_last_checked,
            has_security_policy, has_security_advisories, private_vuln_reporting_enabled,
            dependabot_alerts_enabled, dependabot_alert_count, code_scanning_enabled, code_scanning_alert_count,
            secret_scanning_enabled, secret_scanning_alert_count, security_last_checked, private_repo, visibility_verified,
            open_issues_count, stale_issues_count
        )
        VALUES (
            ${repo.name}, ${repo.fullName}, ${repo.description}, ${repo.language}, ${repo.stars},
            ${repo.forks}, ${repo.openIssues}, ${repo.url}, ${repo.homepage}, ${repo.topics},
            NOW(), NOW(), ${lastCommitDate}, ${openPrs}, ${prsReadyCount}, ${prsBlockedCount}, ${staleReviewCount}, ${JSON.stringify(staleReviewPrNumbers)}, ${branchesCount}, ${zombieBranchCount}, ${readmeLastUpdated},
            ${totalLoc}, ${JSON.stringify(locLanguageBreakdown)}, ${ciStatus}, ${ciLastRun}, ${ciWorkflowName},
            ${vulnAlertCount}, ${vulnCriticalCount}, ${vulnHighCount}, NOW(),
            ${contributorCount}, ${finiteOrNull(commitFrequency)}, ${busFactor}, ${finiteOrNull(avgPrMergeTimeHours)}, NOW(),
            ${hasSecurityPolicy}, ${hasSecurityAdvisories}, ${privateVulnReportingEnabled},
            ${dependabotAlertsEnabled}, ${dependabotAlertCount}, ${codeScanningEnabled}, ${codeScanningAlertCount},
            ${secretScanningEnabled}, ${secretScanningAlertCount}, NOW(), ${repo.isPrivate}, TRUE,
            ${openIssuesCountDetailed}, ${staleIssuesCount}
        )
        ON CONFLICT (full_name) DO UPDATE SET
          description = EXCLUDED.description,
          language = EXCLUDED.language,
          stars = EXCLUDED.stars,
          forks = EXCLUDED.forks,
          open_issues = EXCLUDED.open_issues,
          url = EXCLUDED.url,
          homepage = EXCLUDED.homepage,
          topics = EXCLUDED.topics,
          last_synced = NOW(),
          updated_at = NOW(),
          last_commit_date = EXCLUDED.last_commit_date,
          private_repo = EXCLUDED.private_repo,
          visibility_verified = TRUE,
          open_prs = EXCLUDED.open_prs,
          prs_ready_count = EXCLUDED.prs_ready_count,
          prs_blocked_count = EXCLUDED.prs_blocked_count,
          stale_review_count = EXCLUDED.stale_review_count,
          stale_review_pr_numbers = EXCLUDED.stale_review_pr_numbers,
          branches_count = EXCLUDED.branches_count,
          zombie_branch_count = EXCLUDED.zombie_branch_count,
          readme_last_updated = EXCLUDED.readme_last_updated,
          total_loc = EXCLUDED.total_loc,
          loc_language_breakdown = EXCLUDED.loc_language_breakdown,
          ci_status = EXCLUDED.ci_status,
          ci_last_run = EXCLUDED.ci_last_run,
          ci_workflow_name = EXCLUDED.ci_workflow_name,
          vuln_alert_count = EXCLUDED.vuln_alert_count,
          vuln_critical_count = EXCLUDED.vuln_critical_count,
          vuln_high_count = EXCLUDED.vuln_high_count,
          vuln_last_checked = EXCLUDED.vuln_last_checked,
          contributor_count = EXCLUDED.contributor_count,
          commit_frequency = COALESCE(EXCLUDED.commit_frequency, repos.commit_frequency),
          bus_factor = EXCLUDED.bus_factor,
          avg_pr_merge_time_hours = EXCLUDED.avg_pr_merge_time_hours,
          contributors_last_checked = EXCLUDED.contributors_last_checked,
          has_security_policy = EXCLUDED.has_security_policy,
          has_security_advisories = EXCLUDED.has_security_advisories,
          private_vuln_reporting_enabled = EXCLUDED.private_vuln_reporting_enabled,
          dependabot_alerts_enabled = EXCLUDED.dependabot_alerts_enabled,
          dependabot_alert_count = EXCLUDED.dependabot_alert_count,
          code_scanning_enabled = EXCLUDED.code_scanning_enabled,
          code_scanning_alert_count = EXCLUDED.code_scanning_alert_count,
          secret_scanning_enabled = EXCLUDED.secret_scanning_enabled,
          secret_scanning_alert_count = EXCLUDED.secret_scanning_alert_count,
          security_last_checked = EXCLUDED.security_last_checked,
          open_issues_count = EXCLUDED.open_issues_count,
          stale_issues_count = EXCLUDED.stale_issues_count
        RETURNING id;
    `;
    const repoId = repoRows[0].id;

    // Get file list for best practices and community standards checks
    let fileList: string[] = [];
    try {
        fileList = await github.getRepoFileList(repo.name, owner);
    } catch (e) {
        console.warn(`Failed to fetch file list for ${repo.fullName}`, e);
    }

    // Count test cases from test files
    let testCaseCount = 0;
    let testDescribeCount = 0;
    try {
        const testFiles = fileList.filter(isTestFile);
        for (const testFile of testFiles) {
            try {
                const content = await github.getFileContent(repo.name, testFile, owner);
                if (content) {
                    const stats = parseTestFile(content);
                    testCaseCount += stats.tests;
                    testDescribeCount += stats.describes;
                }
            } catch {
                // Skip files that can't be fetched
                console.warn(`Failed to fetch test file ${testFile} for ${repo.fullName}`);
            }
        }
    } catch (e) {
        console.warn(`Failed to count test cases for ${repo.fullName}`, e);
    }

    // Update repo with test case counts
    await db`
        UPDATE repos 
        SET test_case_count = ${testCaseCount}, test_describe_count = ${testDescribeCount}
        WHERE id = ${repoId}
    `;

    // Compute token density + comment-to-code ratio from source files.
    // Sample up to 40 source files to bound GitHub API calls.
    const sourceFiles = fileList.filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|c|h|cpp|hpp|cs|swift|kt|scala|sh|sql)$/i.test(f));
    const sampledFiles = sourceFiles.slice(0, 40);
    let tokenDensity: number | null = null;
    let commentToCodeRatio: number | null = null;
    try {
        const analyzed: { path: string; content: string }[] = [];
        for (const file of sampledFiles) {
            try {
                const content = await github.getFileContent(repo.name, file, owner);
                if (content) analyzed.push({ path: file, content });
            } catch {
                // Skip files that can't be fetched
            }
        }
        const density = aggregateCodeDensity(analyzed);
        tokenDensity = density.tokenDensity;
        commentToCodeRatio = density.commentToCodeRatio;
    } catch (e) {
        console.warn(`Failed to compute code density for ${repo.fullName}`, e);
    }

    await db`
        UPDATE repos 
        SET token_density = ${finiteOrNull(tokenDensity)},
            comment_to_code_ratio = ${finiteOrNull(commentToCodeRatio)}
        WHERE id = ${repoId}
    `;

    // ROADMAP.md (try uppercase, lowercase, then docs/ subdirectory)
    let roadmapContent = await github.getFileContent(repo.name, 'ROADMAP.md', owner).catch(() => null);
    if (!roadmapContent) {
        roadmapContent = await github.getFileContent(repo.name, 'roadmap.md', owner).catch(() => null);
    }
    if (!roadmapContent) {
        roadmapContent = await github.getFileContent(repo.name, 'docs/ROADMAP.md', owner).catch(() => null);
    }
    // Core docs should be in root - no template comparison
    const roadmapHealthState = calculateDocHealthState(!!roadmapContent, roadmapContent, null);
    if (roadmapContent) {
        const roadmapData = parseRoadmap(roadmapContent);
        logger.debug(`[SYNC] ${repo.name} - Roadmap items parsed: ${roadmapData.items.length}`);
        if (roadmapData.items.length === 0) {
            logger.debug(`[SYNC] ${repo.name} - Roadmap content preview:`, roadmapContent.substring(0, 200));
        }
        // Merge instead of delete+insert so DB-only fields (e.g. linked_pr_number,
        // agent_task_id) survive re-syncs - only items no longer present in
        // ROADMAP.md are removed.
        const existingItems = await db`SELECT id, title FROM roadmap_items WHERE repo_id = ${repoId}`;
        const plan = diffRoadmapItems(existingItems, roadmapData.items);
        for (const item of plan.toUpdate) {
            await db`
                UPDATE roadmap_items
                SET quarter = ${item.quarter}, status = ${item.status}, updated_at = NOW()
                WHERE id = ${item.id}
            `;
        }
        for (const item of plan.toInsert) {
            await db`
                INSERT INTO roadmap_items (repo_id, title, quarter, status)
                VALUES (${repoId}, ${item.title}, ${item.quarter}, ${item.status})
            `;
        }
        for (const staleId of plan.toDeleteIds) {
            await db`DELETE FROM roadmap_items WHERE id = ${staleId}`;
        }
    }
    await db`
        INSERT INTO doc_status (repo_id, doc_type, exists, health_state, content_hash, template_version, last_checked)
        VALUES (
            ${repoId}, 'roadmap', ${!!roadmapContent}, ${roadmapHealthState}, ${roadmapContent ? hashContent(roadmapContent) : null}, NULL, NOW()
        )
        ON CONFLICT (repo_id, doc_type) DO UPDATE SET 
            exists = EXCLUDED.exists, 
            health_state = EXCLUDED.health_state,
            content_hash = EXCLUDED.content_hash,
            template_version = EXCLUDED.template_version,
            last_checked = EXCLUDED.last_checked
    `;

    // TASKS.md (try root then docs/ subdirectory)
    let tasksContent = await github.getFileContent(repo.name, 'TASKS.md', owner).catch(() => null);
    if (!tasksContent) {
        tasksContent = await github.getFileContent(repo.name, 'docs/TASKS.md', owner).catch(() => null);
    }
    // Core docs should be in root - no template comparison
    const tasksHealthState = calculateDocHealthState(!!tasksContent, tasksContent, null);
    if (tasksContent) {
        const tasksData = parseTasks(tasksContent);
        logger.debug(`[SYNC] ${repo.name} - Tasks parsed: ${tasksData.tasks.length}`);
        if (tasksData.tasks.length === 0) {
            logger.debug(`[SYNC] ${repo.name} - Tasks content preview:`, tasksContent.substring(0, 200));
        }
        await db`DELETE FROM tasks WHERE repo_id = ${repoId}`;

        // Track seen task IDs to handle duplicates
        const seenTaskIds = new Set<string>();

        for (const task of tasksData.tasks) {
            let taskId = task.id;
            let counter = 1;

            // If duplicate task_id, append counter to make it unique
            while (seenTaskIds.has(taskId)) {
                taskId = `${task.id}-${counter}`;
                counter++;
            }
            seenTaskIds.add(taskId);

            await db`
                INSERT INTO tasks (repo_id, task_id, title, status, section, subsection)
                VALUES (${repoId}, ${taskId}, ${task.title}, ${task.status}, ${task.section}, ${task.subsection})
            `;
        }
    }
    await db`
        INSERT INTO doc_status (repo_id, doc_type, exists, health_state, content_hash, template_version, last_checked)
        VALUES (
            ${repoId}, 'tasks', ${!!tasksContent}, ${tasksHealthState}, ${tasksContent ? hashContent(tasksContent) : null}, NULL, NOW()
        )
        ON CONFLICT (repo_id, doc_type) DO UPDATE SET 
            exists = EXCLUDED.exists, 
            health_state = EXCLUDED.health_state,
            content_hash = EXCLUDED.content_hash,
            template_version = EXCLUDED.template_version,
            last_checked = EXCLUDED.last_checked
    `;

    // METRICS.md (try root then docs/ subdirectory)
    let metricsContent = await github.getFileContent(repo.name, 'METRICS.md', owner).catch(() => null);
    if (!metricsContent) {
        metricsContent = await github.getFileContent(repo.name, 'docs/METRICS.md', owner).catch(() => null);
    }
    const metricsHealthState = calculateDocHealthState(!!metricsContent, metricsContent, null);
    let coverageScore: number | null = null;
    if (metricsContent) {
        const metricsData = parseMetrics(metricsContent);
        // Use logger.debug so these parser logs can be gated in production
        logger.debug(`[SYNC] ${repo.name} - Metrics parsed: ${metricsData.metrics.length}`);
        if (metricsData.metrics.length === 0) {
            logger.debug(`[SYNC] ${repo.name} - Metrics content preview:`, metricsContent.substring(0, 200));
        }
        await db`DELETE FROM metrics WHERE repo_id = ${repoId}`;
        for (const metric of metricsData.metrics) {
            await db`
                INSERT INTO metrics (repo_id, metric_name, value, unit, timestamp)
                VALUES (${repoId}, ${metric.name}, ${metric.value}, ${metric.unit}, NOW())
            `;
            // Extract coverage metric for repos table
            if (metric.name.toLowerCase().includes('coverage') && metric.unit === '%') {
                // Value is already normalized to 0-100 range by parser
                coverageScore = metric.value;
            }
        }
    }

    // Always update coverage_score (set to NULL if no coverage found)
    await db`
        UPDATE repos 
        SET coverage_score = ${finiteOrNull(coverageScore)}
        WHERE id = ${repoId}
    `;
    await db`
        INSERT INTO doc_status (repo_id, doc_type, exists, health_state, content_hash, last_checked)
        VALUES (${repoId}, 'metrics', ${!!metricsContent}, ${metricsHealthState}, ${metricsContent ? hashContent(metricsContent) : null}, NOW())
        ON CONFLICT (repo_id, doc_type) DO UPDATE SET 
            exists = EXCLUDED.exists, 
            health_state = EXCLUDED.health_state,
            content_hash = EXCLUDED.content_hash,
            last_checked = EXCLUDED.last_checked
    `;

    // FEATURES.md (try root then docs/ subdirectory)
    let featuresContent = await github.getFileContent(repo.name, 'FEATURES.md', owner).catch(() => null);
    if (!featuresContent) {
        featuresContent = await github.getFileContent(repo.name, 'docs/FEATURES.md', owner).catch(() => null);
    }
    const featuresHealthState = calculateDocHealthState(!!featuresContent, featuresContent, null);
    if (featuresContent) {
        const featuresData = parseFeatures(featuresContent);
        logger.debug(`[SYNC] ${repo.name} - Features categories parsed: ${featuresData.categories.length}`);
        if (featuresData.categories.length === 0) {
            logger.debug(`[SYNC] ${repo.name} - Features content preview:`, featuresContent.substring(0, 200));
        }
        await db`DELETE FROM features WHERE repo_id = ${repoId}`;
        for (const category of featuresData.categories) {
            await db`
                INSERT INTO features (repo_id, category, title, description, items)
                VALUES (${repoId}, ${category.name}, ${category.name}, ${category.description || ''}, ${category.items})
            `;
        }
    }
    await db`
        INSERT INTO doc_status (repo_id, doc_type, exists, health_state, content_hash, last_checked)
        VALUES (${repoId}, 'features', ${!!featuresContent}, ${featuresHealthState}, ${featuresContent ? hashContent(featuresContent) : null}, NOW())
        ON CONFLICT (repo_id, doc_type) DO UPDATE SET 
            exists = EXCLUDED.exists, 
            health_state = EXCLUDED.health_state,
            content_hash = EXCLUDED.content_hash,
            last_checked = EXCLUDED.last_checked
    `;

    // Other docs (README, LICENSE — root only; CHANGELOG, CONTRIBUTING — also check docs/)
    for (const docFile of ['README.md', 'LICENSE.md']) {
        const content = await github.getFileContent(repo.name, docFile, owner).catch(() => null);
        const docType = docFile.replace('.md', '').toLowerCase();
        const healthState = calculateDocHealthState(!!content, content, null);
        await db`
            INSERT INTO doc_status (repo_id, doc_type, exists, health_state, content_hash, last_checked)
            VALUES (${repoId}, ${docType}, ${content !== null}, ${healthState}, ${content ? hashContent(content) : null}, NOW())
            ON CONFLICT (repo_id, doc_type) DO UPDATE SET
                exists = EXCLUDED.exists,
                health_state = EXCLUDED.health_state,
                content_hash = EXCLUDED.content_hash,
                last_checked = EXCLUDED.last_checked
        `;
    }

    // CHANGELOG.md (try root then docs/ subdirectory)
    let changelogContent = await github.getFileContent(repo.name, 'CHANGELOG.md', owner).catch(() => null);
    if (!changelogContent) {
        changelogContent = await github.getFileContent(repo.name, 'docs/CHANGELOG.md', owner).catch(() => null);
    }
    const changelogHealthState = calculateDocHealthState(!!changelogContent, changelogContent, null);
    await db`
        INSERT INTO doc_status (repo_id, doc_type, exists, health_state, content_hash, last_checked)
        VALUES (${repoId}, 'changelog', ${changelogContent !== null}, ${changelogHealthState}, ${changelogContent ? hashContent(changelogContent) : null}, NOW())
        ON CONFLICT (repo_id, doc_type) DO UPDATE SET
            exists = EXCLUDED.exists,
            health_state = EXCLUDED.health_state,
            content_hash = EXCLUDED.content_hash,
            last_checked = EXCLUDED.last_checked
    `;

    // CONTRIBUTING.md (try root, then .github/, then docs/ — matches community-standards.ts order)
    let contributingContent = await github.getFileContent(repo.name, 'CONTRIBUTING.md', owner).catch(() => null);
    if (!contributingContent) {
        contributingContent = await github.getFileContent(repo.name, '.github/CONTRIBUTING.md', owner).catch(() => null);
    }
    if (!contributingContent) {
        contributingContent = await github.getFileContent(repo.name, 'docs/CONTRIBUTING.md', owner).catch(() => null);
    }
    const contributingHealthState = calculateDocHealthState(!!contributingContent, contributingContent, null);
    await db`
        INSERT INTO doc_status (repo_id, doc_type, exists, health_state, content_hash, last_checked)
        VALUES (${repoId}, 'contributing', ${contributingContent !== null}, ${contributingHealthState}, ${contributingContent ? hashContent(contributingContent) : null}, NOW())
        ON CONFLICT (repo_id, doc_type) DO UPDATE SET
            exists = EXCLUDED.exists,
            health_state = EXCLUDED.health_state,
            content_hash = EXCLUDED.content_hash,
            last_checked = EXCLUDED.last_checked
    `;

    // Best Practices Detection
    try {
        const readmeContent = await github.getFileContent(repo.name, 'README.md', owner);
        const bestPracticesResult = await checkBestPractices(owner, repo.name, github.getOctokit(), fileList, readmeContent || undefined);

        await db`DELETE FROM best_practices WHERE repo_id = ${repoId}`;
        for (const practice of bestPracticesResult.practices) {
            await db`
                INSERT INTO best_practices (repo_id, practice_type, status, details, last_checked)
                VALUES (${repoId}, ${practice.type}, ${practice.status}, ${JSON.stringify(practice.details)}, NOW())
            `;
        }
    } catch (e) {
        console.warn(`Failed to check best practices for ${repo.fullName}`, e);
    }

    // Community Standards Detection
    try {
        const fallbackFiles = await getOrgGithubFallbackFiles(github, owner);
        const communityStandardsResult = checkCommunityStandards(fileList, {
            fallbackFiles,
            fallbackRepo: `${owner}/.github`,
        });

        await db`DELETE FROM community_standards WHERE repo_id = ${repoId}`;
        for (const standard of communityStandardsResult.standards) {
            await db`
                INSERT INTO community_standards (repo_id, standard_type, status, details, last_checked)
                VALUES (${repoId}, ${standard.type}, ${standard.status}, ${JSON.stringify(standard.details)}, NOW())
            `;
        }
    } catch (e) {
        console.warn(`Failed to check community standards for ${repo.fullName}`, e);
    }

    // Calculate and update health score
    try {
        // Score from the persisted rows (the upsert above wrote every repo
        // column the score reads) so a later profile change or dashboard
        // recompute lands on the same number.
        const [repoRow] = await db`SELECT * FROM repos WHERE id = ${repoId} LIMIT 1`;
        const [docStatuses, bestPractices, communityStandards, metrics] = await Promise.all([
            db`SELECT * FROM doc_status WHERE repo_id = ${repoId}`,
            db`SELECT * FROM best_practices WHERE repo_id = ${repoId}`,
            db`SELECT * FROM community_standards WHERE repo_id = ${repoId}`,
            db`SELECT * FROM metrics WHERE repo_id = ${repoId} ORDER BY timestamp DESC`,
        ]);

        const healthScore = calculateHealthScore(
            buildHealthScoreInputs(repoRow as RepoHealthFields, {
                docStatuses,
                bestPractices,
                communityStandards,
                metrics,
            } as RepoHealthRows)
        );

        await db`
            UPDATE repos 
            SET health_score = ${healthScore.total}
            WHERE id = ${repoId}
        `;

        // Record a time-series snapshot so velocity and tech-debt can be
        // trended over rolling quarters.
        try {
            await db`
                INSERT INTO repo_snapshots (
                    repo_id, commit_frequency, avg_pr_merge_time_hours,
                    health_score, open_prs, total_loc
                )
                VALUES (
                    ${repoId}, ${finiteOrNull(commitFrequency)}, ${finiteOrNull(avgPrMergeTimeHours)},
                    ${healthScore.total}, ${openPrs}, ${totalLoc}
                )
            `;
        } catch (snapshotError) {
            console.warn(`Failed to record snapshot for ${repo.fullName}`, snapshotError);
        }

        logger.info(`✓ Health score for ${repo.name}: ${healthScore.total}/100`);
    } catch (e) {
        console.warn(`Failed to calculate health score for ${repo.fullName}`, e);
    }
}

// Wrapper function to sync a single repo by name
export async function syncSingleRepo(github: GitHubClient, repoName: string) {
    const { getNeonClient } = await import('./db');
    const db = getNeonClient();

    // Get the repo metadata from GitHub
    const repos = await github.listRepos();
    const repo = repos.find((r: RepoMetadata) => r.name === repoName);

    if (!repo) {
        throw new Error(`Repository ${repoName} not found in user's repos`);
    }

    await syncRepo(repo, github, db);
    logger.info(`✓ Synced ${repoName}`);
}
