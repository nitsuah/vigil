#!/usr/bin/env node
'use strict';

const token = process.env.GITHUB_TOKEN;
const repository = process.argv[2] || process.env.GITHUB_REPOSITORY;
const match = typeof repository === 'string' && repository.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);

if (!token || !match) {
    console.error('Set GITHUB_TOKEN and GITHUB_REPOSITORY=owner/repo, or pass owner/repo.');
    process.exit(2);
}

const [, owner, repo] = match;
const categories = {
    vulnerability: new Set(['security', 'vulnerability', 'vulnerabilities', 'security vulnerability']),
    bug: new Set(['bug', 'defect', 'type: bug', 'kind/bug']),
    feedback: new Set(['enhancement', 'feature', 'feature request', 'feature-request', 'feedback', 'request', 'type: feature', 'kind/feature']),
};
const counts = { total: 0, vulnerability: 0, bug: 0, feedback: 0, other: 0 };
const seen = new Set();

function category(labels) {
    const names = new Set(labels.map((label) => label.name.trim().toLowerCase()));
    for (const name of categories.vulnerability) if (names.has(name)) return 'vulnerability';
    for (const name of categories.bug) if (names.has(name)) return 'bug';
    for (const name of categories.feedback) if (names.has(name)) return 'feedback';
    return 'other';
}

async function main() {
    const base = `https://api.github.com/repos/${owner}/${repo}/issues`;
    let page = 1;
    let complete = false;

    while (!complete) {
        const response = await fetch(`${base}?state=open&per_page=100&page=${page}`, {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub API request failed with HTTP ${response.status}`);
        }
        const batch = await response.json();
        if (!Array.isArray(batch) || batch.some((item) =>
            !item || !Number.isInteger(item.number) || !Array.isArray(item.labels)
        )) {
            throw new Error('GitHub API returned a malformed issue page');
        }

        for (const issue of batch) {
            if (issue.pull_request || seen.has(issue.number)) continue;
            seen.add(issue.number);
            counts[category(issue.labels)] += 1;
            counts.total += 1;
        }

        complete = batch.length < 100;
        page += 1;
    }

    process.stdout.write(`${JSON.stringify({
        repository: `${owner}/${repo}`,
        timestamp: new Date().toISOString(),
        complete,
        ...counts,
    }, null, 2)}\n`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
