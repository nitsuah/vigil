export type HealthState = 'missing' | 'dormant' | 'malformed' | 'healthy';

export interface CommunityStandard {
    type: string;
    status: HealthState;
    details: {
        exists: boolean;
        [key: string]: unknown;
    };
}

export interface CommunityStandardsResult {
    standards: CommunityStandard[];
}

export interface CommunityStandardsOptions {
    fallbackFiles?: string[];
    fallbackRepo?: string;
}

export function checkCommunityStandards(
    fileList: string[],
    options: CommunityStandardsOptions = {}
): CommunityStandardsResult {
    const lowerFiles = fileList.map(f => f.toLowerCase());
    const fallbackFiles = (options.fallbackFiles || []).map(f => f.toLowerCase());
    const fallbackSet = new Set(fallbackFiles);
    const standards: CommunityStandard[] = [];

    // CODE_OF_CONDUCT — root, .github/, or docs/ in repo; root in org .github fallback
    const codeOfConductInRepo = lowerFiles.includes('code_of_conduct.md') ||
                                 lowerFiles.includes('.github/code_of_conduct.md') ||
                                 lowerFiles.includes('docs/code_of_conduct.md');
    const codeOfConductInFallback = fallbackSet.has('code_of_conduct.md');
    const contributingInRepo = lowerFiles.includes('contributing.md') ||
                               lowerFiles.includes('.github/contributing.md') ||
                               lowerFiles.includes('docs/contributing.md');
    const contributingPath = lowerFiles.includes('contributing.md') ? 'CONTRIBUTING.md'
                           : lowerFiles.includes('.github/contributing.md') ? '.github/CONTRIBUTING.md'
                           : lowerFiles.includes('docs/contributing.md') ? 'docs/CONTRIBUTING.md'
                           : null;
    const contributingInFallback = fallbackSet.has('contributing.md');
    // SECURITY — root, .github/, or docs/ in repo; root in org .github fallback
    const securityInRepo = lowerFiles.includes('security.md') ||
                           lowerFiles.includes('.github/security.md') ||
                           lowerFiles.includes('docs/security.md');
    const securityInFallback = fallbackSet.has('security.md');

    // Core community files
    standards.push({
        type: 'code_of_conduct',
        status: codeOfConductInRepo || codeOfConductInFallback ? 'healthy' : 'missing',
        details: {
            exists: codeOfConductInRepo || codeOfConductInFallback,
            existsInRepo: codeOfConductInRepo,
            existsInGithubFallback: codeOfConductInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    standards.push({
        type: 'contributing',
        status: contributingInRepo || contributingInFallback ? 'healthy' : 'missing',
        details: {
            exists: contributingInRepo || contributingInFallback,
            existsInRepo: contributingInRepo,
            foundAt: contributingPath,
            existsInGithubFallback: contributingInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    standards.push({
        type: 'security',
        status: securityInRepo || securityInFallback ? 'healthy' : 'missing',
        details: {
            exists: securityInRepo || securityInFallback,
            existsInRepo: securityInRepo,
            existsInGithubFallback: securityInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    standards.push({
        type: 'license',
        status: lowerFiles.includes('license.md') || lowerFiles.includes('license') ? 'healthy' : 'missing',
        details: { exists: lowerFiles.includes('license.md') || lowerFiles.includes('license') }
    });

    const changelogPath = lowerFiles.includes('changelog.md') ? 'CHANGELOG.md'
                        : lowerFiles.includes('docs/changelog.md') ? 'docs/CHANGELOG.md'
                        : null;
    standards.push({
        type: 'changelog',
        status: changelogPath ? 'healthy' : 'missing',
        details: { exists: !!changelogPath, foundAt: changelogPath }
    });

    // Templates — check repo first, then org .github fallback
    const hasIssueTemplateInRepo = lowerFiles.some(f => f.includes('issue_template'));
    const hasIssueTemplateInFallback = fallbackFiles.some(f => f.includes('issue_template'));
    standards.push({
        type: 'issue_template',
        status: hasIssueTemplateInRepo || hasIssueTemplateInFallback ? 'healthy' : 'missing',
        details: {
            exists: hasIssueTemplateInRepo || hasIssueTemplateInFallback,
            existsInRepo: hasIssueTemplateInRepo,
            existsInGithubFallback: hasIssueTemplateInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    const hasPRTemplateInRepo = lowerFiles.some(f => f.includes('pull_request_template'));
    const hasPRTemplateInFallback = fallbackFiles.some(f => f.includes('pull_request_template'));
    standards.push({
        type: 'pr_template',
        status: hasPRTemplateInRepo || hasPRTemplateInFallback ? 'healthy' : 'missing',
        details: {
            exists: hasPRTemplateInRepo || hasPRTemplateInFallback,
            existsInRepo: hasPRTemplateInRepo,
            existsInGithubFallback: hasPRTemplateInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    // Copilot Instructions — per-repo, with org .github fallback
    const hasCopilotInRepoLocal = lowerFiles.includes('.github/copilot-instructions.md');
    const hasCopilotInFallback = fallbackSet.has('.github/copilot-instructions.md');
    standards.push({
        type: 'copilot_instructions',
        status: hasCopilotInRepoLocal || hasCopilotInFallback ? 'healthy' : 'missing',
        details: {
            exists: hasCopilotInRepoLocal || hasCopilotInFallback,
            existsInRepo: hasCopilotInRepoLocal,
            existsInGithubFallback: hasCopilotInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    // FLOW-TASKS agent prompt — per-repo, with org .github fallback
    const hasFlowTasksInRepoLocal = lowerFiles.includes('.github/prompts/flow-tasks.md');
    const hasFlowTasksInFallback = fallbackSet.has('.github/prompts/flow-tasks.md');
    standards.push({
        type: 'flow_tasks_prompt',
        status: hasFlowTasksInRepoLocal || hasFlowTasksInFallback ? 'healthy' : 'missing',
        details: {
            exists: hasFlowTasksInRepoLocal || hasFlowTasksInFallback,
            existsInRepo: hasFlowTasksInRepoLocal,
            existsInGithubFallback: hasFlowTasksInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    // HANDOFF agent prompt — per-repo, with org .github fallback
    const hasHandoffInRepoLocal = lowerFiles.includes('.github/prompts/handoff.md');
    const hasHandoffInFallback = fallbackSet.has('.github/prompts/handoff.md');
    standards.push({
        type: 'handoff_prompt',
        status: hasHandoffInRepoLocal || hasHandoffInFallback ? 'healthy' : 'missing',
        details: {
            exists: hasHandoffInRepoLocal || hasHandoffInFallback,
            existsInRepo: hasHandoffInRepoLocal,
            existsInGithubFallback: hasHandoffInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    // CODEOWNERS — check .github/, root, docs/ in repo; then org .github fallback
    const hasCodeownersInRepo = lowerFiles.includes('.github/codeowners') ||
                                 lowerFiles.includes('codeowners') ||
                                 lowerFiles.includes('docs/codeowners');
    const hasCodeownersInFallback = fallbackSet.has('codeowners') ||
                                     fallbackSet.has('.github/codeowners');
    standards.push({
        type: 'codeowners',
        status: hasCodeownersInRepo || hasCodeownersInFallback ? 'healthy' : 'missing',
        details: {
            exists: hasCodeownersInRepo || hasCodeownersInFallback,
            existsInRepo: hasCodeownersInRepo,
            existsInGithubFallback: hasCodeownersInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    // Funding configuration — check repo first, then org .github fallback
    const hasFundingInRepo = lowerFiles.includes('.github/funding.yml') || lowerFiles.includes('.github/funding.yaml');
    const hasFundingInFallback = fallbackSet.has('.github/funding.yml') || fallbackSet.has('.github/funding.yaml') || fallbackSet.has('funding.yml');
    standards.push({
        type: 'funding',
        status: hasFundingInRepo || hasFundingInFallback ? 'healthy' : 'missing',
        details: {
            exists: hasFundingInRepo || hasFundingInFallback,
            existsInRepo: hasFundingInRepo,
            existsInGithubFallback: hasFundingInFallback,
            fallbackRepo: options.fallbackRepo || null,
        }
    });

    return { standards };
}
