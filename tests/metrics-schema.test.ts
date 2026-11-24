import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Static checks: new tables live in database/schema.sql (see
// database/migrations/README.md), not in a new migration file.
const schema = readFileSync(join(process.cwd(), 'database/schema.sql'), 'utf8').replace(/\r\n/g, '\n');

const tableBody = (name: string): string => {
    const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
    if (start === -1) throw new Error(`${name} is not declared in database/schema.sql`);
    return schema.slice(start, schema.indexOf('\n);', start));
};

describe('delivery-metrics schema', () => {
    it.each(['gh_issues', 'gh_prs', 'weekly_rollups', 'metrics_sync_state'])('declares %s against repos', (name) => {
        expect(tableBody(name)).toContain('repo_id UUID');
        expect(tableBody(name)).toContain('REFERENCES repos(id)');
    });

    it('keys issues and PRs by repo and number, rollups by repo and week', () => {
        expect(tableBody('gh_issues')).toContain('PRIMARY KEY (repo_id, number)');
        expect(tableBody('gh_prs')).toContain('PRIMARY KEY (repo_id, number)');
        expect(tableBody('weekly_rollups')).toContain('PRIMARY KEY (repo_id, iso_week)');
        expect(tableBody('metrics_sync_state')).toContain('repo_id UUID PRIMARY KEY');
    });

    it('has one rollup column per WeeklyRollup field', () => {
        const body = tableBody('weekly_rollups');
        for (const col of [
            'issues_opened', 'issues_closed', 'leaf_closed', 'scope_end', 'prs_opened', 'prs_merged',
            'bugs_opened', 'bugs_closed', 'imp_prs_opened', 'imp_prs_merged', 'lead_time_p50_hours', 'lead_time_p90_hours',
        ]) {
            expect(body).toContain(`${col} `);
        }
    });

    it('limits author_type to the three classifications', () => {
        expect(tableBody('gh_issues')).toContain("author_type IN ('human', 'imp', 'bot')");
        expect(tableBody('gh_prs')).toContain("author_type IN ('human', 'imp', 'bot')");
    });
});