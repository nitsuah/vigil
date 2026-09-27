/**
 * Session scoping for /api/relationships: a signed-in user sees and edits only
 * edges with at least one endpoint in a repo they may access (CWE-639). The
 * MCP bearer key is portfolio admin and skips this, like get_open_tasks.
 */

import type { getNeonClient } from '@/lib/db';
import { getAccessibleRepoIds } from '@/lib/repo-access';
import type { KnownRepo, Relationship } from '@/lib/relationships';

type Db = ReturnType<typeof getNeonClient>;

export interface RelationshipScope {
    known: KnownRepo[];
    names: Set<string>;
    allows: (r: Pick<Relationship, 'source' | 'target'>) => boolean;
}

export async function relationshipScope(db: Db, githubUserId: string | undefined): Promise<RelationshipScope> {
    const ids = await getAccessibleRepoIds(db, githubUserId);
    const rows = await db`
        SELECT id, name, full_name FROM repos WHERE (is_hidden = FALSE OR is_hidden IS NULL)
    ` as Array<{ id: string; name: string; full_name: string }>;
    const known = rows.filter((r) => ids.has(r.id)).map(({ name, full_name }) => ({ name, full_name }));
    const names = new Set(known.map((r) => r.full_name.toLowerCase()));
    return { known, names, allows: (r) => names.has(r.source) || names.has(r.target) };
}
