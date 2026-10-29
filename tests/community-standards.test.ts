import { test, expect } from 'vitest';
import { checkCommunityStandards } from '../lib/community-standards';

test('marks core standards healthy when present in owner .github fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: ['CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md'],
    fallbackRepo: 'nitsuah/.github',
  });

  const contributing = result.standards.find((s) => s.type === 'contributing');
  const codeOfConduct = result.standards.find((s) => s.type === 'code_of_conduct');
  const security = result.standards.find((s) => s.type === 'security');

  expect(contributing?.status).toBe('healthy');
  expect(codeOfConduct?.status).toBe('healthy');
  expect(security?.status).toBe('healthy');

  expect(contributing?.details.existsInRepo).toBe(false);
  expect(contributing?.details.existsInGithubFallback).toBe(true);
});

test('marks core standards missing when absent from both repo and fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: [],
    fallbackRepo: 'nitsuah/.github',
  });

  const contributing = result.standards.find((s) => s.type === 'contributing');
  const codeOfConduct = result.standards.find((s) => s.type === 'code_of_conduct');
  const security = result.standards.find((s) => s.type === 'security');

  expect(contributing?.status).toBe('missing');
  expect(codeOfConduct?.status).toBe('missing');
  expect(security?.status).toBe('missing');

  expect(contributing?.details.existsInRepo).toBe(false);
  expect(contributing?.details.existsInGithubFallback).toBe(false);
});

test('prefers repo-local presence details when both local and fallback files exist', () => {
  const result = checkCommunityStandards(['CONTRIBUTING.md', 'SECURITY.md'], {
    fallbackFiles: ['CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md'],
    fallbackRepo: 'nitsuah/.github',
  });

  const contributing = result.standards.find((s) => s.type === 'contributing');
  const security = result.standards.find((s) => s.type === 'security');

  expect(contributing?.status).toBe('healthy');
  expect(security?.status).toBe('healthy');

  expect(contributing?.details.existsInRepo).toBe(true);
  expect(contributing?.details.existsInGithubFallback).toBe(true);
  expect(security?.details.existsInRepo).toBe(true);
  expect(security?.details.existsInGithubFallback).toBe(true);
});

test('marks funding/issue_template/pr_template healthy when present in org .github fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: [
      '.github/funding.yml',
      '.github/ISSUE_TEMPLATE/bug_report.md',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ],
    fallbackRepo: 'nitsuah/.github',
  });

  const funding = result.standards.find((s) => s.type === 'funding');
  const issueTemplate = result.standards.find((s) => s.type === 'issue_template');
  const prTemplate = result.standards.find((s) => s.type === 'pr_template');

  expect(funding?.status).toBe('healthy');
  expect(funding?.details.existsInRepo).toBe(false);
  expect(funding?.details.existsInGithubFallback).toBe(true);

  expect(issueTemplate?.status).toBe('healthy');
  expect(issueTemplate?.details.existsInRepo).toBe(false);
  expect(issueTemplate?.details.existsInGithubFallback).toBe(true);

  expect(prTemplate?.status).toBe('healthy');
  expect(prTemplate?.details.existsInRepo).toBe(false);
  expect(prTemplate?.details.existsInGithubFallback).toBe(true);
});

test('marks codeowners healthy when present in repo (.github/, root, docs/)', () => {
  const cases = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
  for (const file of cases) {
    const result = checkCommunityStandards([file], {});
    const codeowners = result.standards.find((s) => s.type === 'codeowners');
    expect(codeowners?.status, `expected healthy for ${file}`).toBe('healthy');
    expect(codeowners?.details.existsInRepo).toBe(true);
    expect(codeowners?.details.existsInGithubFallback).toBe(false);
  }
});

test('marks codeowners healthy when present in org .github fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: ['CODEOWNERS'],
    fallbackRepo: 'nitsuah/.github',
  });
  const codeowners = result.standards.find((s) => s.type === 'codeowners');
  expect(codeowners?.status).toBe('healthy');
  expect(codeowners?.details.existsInRepo).toBe(false);
  expect(codeowners?.details.existsInGithubFallback).toBe(true);
});

test('marks codeowners missing when absent from both repo and fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: [],
    fallbackRepo: 'nitsuah/.github',
  });
  const codeowners = result.standards.find((s) => s.type === 'codeowners');
  expect(codeowners?.status).toBe('missing');
  expect(codeowners?.details.existsInRepo).toBe(false);
  expect(codeowners?.details.existsInGithubFallback).toBe(false);
});

test('marks flow_tasks_prompt and handoff_prompt missing when absent', () => {
  const result = checkCommunityStandards(['README.md', '.github/copilot-instructions.md'], {});

  const flowTasks = result.standards.find((s) => s.type === 'flow_tasks_prompt');
  const handoff = result.standards.find((s) => s.type === 'handoff_prompt');

  expect(flowTasks?.status).toBe('missing');
  expect(flowTasks?.details.exists).toBe(false);

  expect(handoff?.status).toBe('missing');
  expect(handoff?.details.exists).toBe(false);
});

test('marks flow_tasks_prompt and handoff_prompt healthy when present in repo (no org fallback)', () => {
  const result = checkCommunityStandards(
    ['README.md', '.github/prompts/FLOW-TASKS.md', '.github/prompts/HANDOFF.md'],
    { fallbackFiles: [], fallbackRepo: 'nitsuah/.github' }
  );

  const flowTasks = result.standards.find((s) => s.type === 'flow_tasks_prompt');
  const handoff = result.standards.find((s) => s.type === 'handoff_prompt');

  expect(flowTasks?.status).toBe('healthy');
  expect(flowTasks?.details.exists).toBe(true);

  expect(handoff?.status).toBe('healthy');
  expect(handoff?.details.exists).toBe(true);
});

test('changelog is healthy when at root CHANGELOG.md', () => {
  const result = checkCommunityStandards(['CHANGELOG.md'], {});
  const changelog = result.standards.find((s) => s.type === 'changelog');
  expect(changelog?.status).toBe('healthy');
  expect(changelog?.details.exists).toBe(true);
  expect(changelog?.details.foundAt).toBe('CHANGELOG.md');
});

test('changelog is healthy when at docs/CHANGELOG.md', () => {
  const result = checkCommunityStandards(['docs/CHANGELOG.md', 'README.md'], {});
  const changelog = result.standards.find((s) => s.type === 'changelog');
  expect(changelog?.status).toBe('healthy');
  expect(changelog?.details.exists).toBe(true);
  expect(changelog?.details.foundAt).toBe('docs/CHANGELOG.md');
});

test('changelog is missing when absent entirely', () => {
  const result = checkCommunityStandards(['README.md'], {});
  const changelog = result.standards.find((s) => s.type === 'changelog');
  expect(changelog?.status).toBe('missing');
  expect(changelog?.details.exists).toBe(false);
  expect(changelog?.details.foundAt).toBe(null);
});

test('contributing is healthy when at root CONTRIBUTING.md', () => {
  const result = checkCommunityStandards(['CONTRIBUTING.md'], {});
  const contributing = result.standards.find((s) => s.type === 'contributing');
  expect(contributing?.status).toBe('healthy');
  expect(contributing?.details.existsInRepo).toBe(true);
  expect(contributing?.details.foundAt).toBe('CONTRIBUTING.md');
});

test('contributing is healthy when at .github/CONTRIBUTING.md', () => {
  const result = checkCommunityStandards(['.github/CONTRIBUTING.md'], {});
  const contributing = result.standards.find((s) => s.type === 'contributing');
  expect(contributing?.status).toBe('healthy');
  expect(contributing?.details.existsInRepo).toBe(true);
  expect(contributing?.details.foundAt).toBe('.github/CONTRIBUTING.md');
});

test('contributing is healthy when at docs/CONTRIBUTING.md', () => {
  const result = checkCommunityStandards(['docs/CONTRIBUTING.md'], {});
  const contributing = result.standards.find((s) => s.type === 'contributing');
  expect(contributing?.status).toBe('healthy');
  expect(contributing?.details.existsInRepo).toBe(true);
  expect(contributing?.details.foundAt).toBe('docs/CONTRIBUTING.md');
});

test('contributing is missing when absent from repo and fallback', () => {
  const result = checkCommunityStandards(['README.md'], { fallbackFiles: [] });
  const contributing = result.standards.find((s) => s.type === 'contributing');
  expect(contributing?.status).toBe('missing');
  expect(contributing?.details.existsInRepo).toBe(false);
  expect(contributing?.details.foundAt).toBe(null);
});

test('code_of_conduct is healthy when at .github/CODE_OF_CONDUCT.md in repo', () => {
  const result = checkCommunityStandards(['.github/CODE_OF_CONDUCT.md'], {});
  const coc = result.standards.find((s) => s.type === 'code_of_conduct');
  expect(coc?.status).toBe('healthy');
  expect(coc?.details.existsInRepo).toBe(true);
  expect(coc?.details.existsInGithubFallback).toBe(false);
});

test('security is healthy when at .github/SECURITY.md in repo', () => {
  const result = checkCommunityStandards(['.github/SECURITY.md'], {});
  const security = result.standards.find((s) => s.type === 'security');
  expect(security?.status).toBe('healthy');
  expect(security?.details.existsInRepo).toBe(true);
  expect(security?.details.existsInGithubFallback).toBe(false);
});

test('copilot_instructions is healthy when present in org .github fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: ['.github/copilot-instructions.md'],
    fallbackRepo: 'nitsuah/.github',
  });
  const copilot = result.standards.find((s) => s.type === 'copilot_instructions');
  expect(copilot?.status).toBe('healthy');
  expect(copilot?.details.existsInRepo).toBe(false);
  expect(copilot?.details.existsInGithubFallback).toBe(true);
});

test('flow_tasks_prompt is healthy when present in org .github fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: ['.github/prompts/flow-tasks.md'],
    fallbackRepo: 'nitsuah/.github',
  });
  const flowTasks = result.standards.find((s) => s.type === 'flow_tasks_prompt');
  expect(flowTasks?.status).toBe('healthy');
  expect(flowTasks?.details.existsInRepo).toBe(false);
  expect(flowTasks?.details.existsInGithubFallback).toBe(true);
});

test('handoff_prompt is healthy when present in org .github fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: ['.github/prompts/handoff.md'],
    fallbackRepo: 'nitsuah/.github',
  });
  const handoff = result.standards.find((s) => s.type === 'handoff_prompt');
  expect(handoff?.status).toBe('healthy');
  expect(handoff?.details.existsInRepo).toBe(false);
  expect(handoff?.details.existsInGithubFallback).toBe(true);
});

test('flow_tasks_prompt and handoff_prompt are missing when absent from repo and fallback', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: [],
    fallbackRepo: 'nitsuah/.github',
  });
  const flowTasks = result.standards.find((s) => s.type === 'flow_tasks_prompt');
  const handoff = result.standards.find((s) => s.type === 'handoff_prompt');
  expect(flowTasks?.status).toBe('missing');
  expect(flowTasks?.details.existsInRepo).toBe(false);
  expect(flowTasks?.details.existsInGithubFallback).toBe(false);
  expect(handoff?.status).toBe('missing');
  expect(handoff?.details.existsInRepo).toBe(false);
  expect(handoff?.details.existsInGithubFallback).toBe(false);
});

test('flow_tasks_prompt and handoff_prompt are healthy when the owner .github repo keeps them under prompts/', () => {
  const result = checkCommunityStandards(['README.md'], {
    fallbackFiles: ['prompts/FLOW-TASKS.md', 'prompts/HANDOFF.md'],
    fallbackRepo: 'nitsuah/.github',
  });
  const flowTasks = result.standards.find((s) => s.type === 'flow_tasks_prompt');
  const handoff = result.standards.find((s) => s.type === 'handoff_prompt');
  expect(flowTasks?.status).toBe('healthy');
  expect(flowTasks?.details.existsInGithubFallback).toBe(true);
  expect(handoff?.status).toBe('healthy');
  expect(handoff?.details.existsInGithubFallback).toBe(true);
});
