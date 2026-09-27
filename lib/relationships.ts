/**
 * Cross-repo relationship map: durable, directed edges that say how one repo
 * actually uses another ("agent-board calls bb-mcp's chat API"), with the
 * context and evidence behind them. Replaces the old /api/dependencies graph,
 * which inferred edges from shared topics and primary language.
 *
 * Every edge is one row in `repo_relationships` (see lib/schema-migrations.ts):
 *   - endpoints are lower-cased `owner/repo` names; the target need not be a
 *     tracked repo, so an edge to an untracked dependency is still expressible.
 *   - `context` is required: a sentence on what the usage is. An edge with no
 *     reason is exactly the noise this replaces.
 *   - `status` separates what a person has confirmed from what an agent (MCP)
 *     or an import proposed. Agents can propose, never confirm.
 *
 * Read by the PMO relationship map, the `get_relationships` MCP tool and
 * GET /api/context; written by /api/relationships and `propose_relationship`.
 */

import type { getNeonClient } from '@/lib/db';

type Db = ReturnType<typeof getNeonClient>;

export const RELATIONSHIP_KINDS = {
    depends_on:  'Source installs or imports target as a package, library, submodule or template.',
    calls:       'Source calls target at runtime: its HTTP API, MCP server, webhook or CLI.',
    deploys:     'Source builds, deploys or provisions target (contracts, infra, releases).',
    embeds:      'Source embeds or vendors target\'s UI, content or assets.',
    shares_data: 'Both read or write the same data store, schema or file format.',
    tracks:      'Source monitors, documents or plans work for target (dashboards, vaults, PMO).',
} as const;
export type RelationshipKind = keyof typeof RELATIONSHIP_KINDS;
export const KIND_NAMES = Object.keys(RELATIONSHIP_KINDS) as RelationshipKind[];

export type RelationshipStatus = 'proposed' | 'confirmed';
export type RelationshipOrigin = 'manual' | 'agent' | 'import';

export interface Relationship {
    id: string;
    source: string;
    target: string;
    kind: RelationshipKind;
    context: string;
    evidence: string | null;
    status: RelationshipStatus;
    origin: RelationshipOrigin;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    confirmed_at: string | null;
}

export interface RelationshipInput {
    source: string;
    target: string;
    kind: RelationshipKind;
    context: string;
    evidence: string | null;
}

export const CONTEXT_MIN = 12;
export const CONTEXT_MAX = 500;
export const EVIDENCE_MAX = 500;

export class RelationshipValidationError extends Error {}

const FULL_NAME = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;

/** Tracked repos, for resolving a bare "name" to its owner/repo. */
export interface KnownRepo {
    name: string;
    full_name: string;
}

/**
 * Normalize an endpoint to lower-case `owner/repo`. A bare name resolves
 * against tracked repos when exactly one matches; otherwise it must be given
 * in full (so an untracked target is never guessed).
 */
export function resolveEndpoint(raw: unknown, known: KnownRepo[], field: string): string {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '') : '';
    if (!value) throw new RelationshipValidationError(`${field} is required (owner/repo)`);
    if (value.includes('/')) {
        if (!FULL_NAME.test(value)) throw new RelationshipValidationError(`${field} must look like owner/repo`);
        return value;
    }
    const matches = known.filter((r) => r.name.toLowerCase() === value);
    if (matches.length === 1) return matches[0].full_name.toLowerCase();
    throw new RelationshipValidationError(matches.length > 1
        ? `${field} "${value}" is ambiguous; use one of: ${matches.map((m) => m.full_name).join(', ')}`
        : `${field} "${value}" is not a tracked repo; give it as owner/repo`);
}

/**
 * Validate one relationship from untrusted input (API body, MCP args, import).
 * `requireEvidence` is set for agent proposals: an agent must point at the
 * file, URL or PR that shows the usage, not just assert it.
 */
export function parseRelationshipInput(
    body: Record<string, unknown>,
    known: KnownRepo[],
    opts: { requireEvidence?: boolean } = {},
): RelationshipInput {
    const source = resolveEndpoint(body.source, known, 'source');
    const target = resolveEndpoint(body.target, known, 'target');
    if (source === target) throw new RelationshipValidationError('source and target must differ');

    const kind = typeof body.kind === 'string' ? body.kind.trim().toLowerCase() : '';
    if (!KIND_NAMES.includes(kind as RelationshipKind)) {
        throw new RelationshipValidationError(`kind must be one of: ${KIND_NAMES.join(', ')}`);
    }

    const context = typeof body.context === 'string' ? body.context.trim() : '';
    if (context.length < CONTEXT_MIN || context.length > CONTEXT_MAX) {
        throw new RelationshipValidationError(
            `context must be ${CONTEXT_MIN}-${CONTEXT_MAX} characters describing how ${source} uses ${target}`);
    }

    const evidenceRaw = typeof body.evidence === 'string' ? body.evidence.trim() : '';
    if (evidenceRaw.length > EVIDENCE_MAX) throw new RelationshipValidationError(`evidence must be at most ${EVIDENCE_MAX} characters`);
    if (opts.requireEvidence && !evidenceRaw) {
        throw new RelationshipValidationError('evidence is required: a file path, URL or PR that shows the usage');
    }

    return { source, target, kind: kind as RelationshipKind, context, evidence: evidenceRaw || null };
}

/** Relationships touching any of `repos` (lower-case owner/repo); all when omitted. */
export async function listRelationships(
    db: Db,
    filters: { repos?: string[]; kind?: RelationshipKind; status?: RelationshipStatus } = {},
): Promise<Relationship[]> {
    const repos = filters.repos?.map((r) => r.toLowerCase()) ?? null;
    const rows = await db`
        SELECT id, source, target, kind, context, evidence, status, origin, created_by,
               created_at, updated_at, confirmed_at
        FROM repo_relationships
        WHERE (${repos}::text[] IS NULL OR source = ANY(${repos}::text[]) OR target = ANY(${repos}::text[]))
          AND (${filters.kind ?? null}::text IS NULL OR kind = ${filters.kind ?? null})
          AND (${filters.status ?? null}::text IS NULL OR status = ${filters.status ?? null})
        ORDER BY status DESC, source, target, kind
    `;
    return rows as Relationship[];
}

/**
 * Insert, or update the matching (source, target, kind) edge. People
 * (`manual`) create confirmed edges and may rewrite any edge; agents and
 * imports create proposed edges and may only refine ones still proposed,
 * so a confirmed edge's wording is never overwritten by a machine.
 */
export async function upsertRelationship(
    db: Db,
    input: RelationshipInput,
    origin: RelationshipOrigin,
    createdBy: string | null,
): Promise<{ relationship: Relationship; created: boolean }> {
    const status: RelationshipStatus = origin === 'manual' ? 'confirmed' : 'proposed';
    const rows = await db`
        INSERT INTO repo_relationships (source, target, kind, context, evidence, status, origin, created_by, confirmed_at)
        VALUES (${input.source}, ${input.target}, ${input.kind}, ${input.context}, ${input.evidence},
                ${status}, ${origin}, ${createdBy}, ${status === 'confirmed' ? new Date().toISOString() : null})
        ON CONFLICT (source, target, kind) DO UPDATE SET
            context      = CASE WHEN ${origin} = 'manual' OR repo_relationships.status = 'proposed'
                                THEN EXCLUDED.context ELSE repo_relationships.context END,
            evidence     = CASE WHEN ${origin} = 'manual' OR repo_relationships.status = 'proposed'
                                THEN COALESCE(EXCLUDED.evidence, repo_relationships.evidence) ELSE repo_relationships.evidence END,
            status       = CASE WHEN ${origin} = 'manual' THEN 'confirmed' ELSE repo_relationships.status END,
            confirmed_at = CASE WHEN ${origin} = 'manual' THEN COALESCE(repo_relationships.confirmed_at, NOW())
                                ELSE repo_relationships.confirmed_at END,
            updated_at   = NOW()
        RETURNING id, source, target, kind, context, evidence, status, origin, created_by,
                  created_at, updated_at, confirmed_at, (xmax = 0) AS created
    `;
    const { created, ...relationship } = rows[0] as Relationship & { created: boolean };
    return { relationship, created };
}

export async function getRelationship(db: Db, id: string): Promise<Relationship | null> {
    const rows = await db`
        SELECT id, source, target, kind, context, evidence, status, origin, created_by,
               created_at, updated_at, confirmed_at
        FROM repo_relationships WHERE id = ${id}
    `;
    return (rows[0] as Relationship | undefined) ?? null;
}

/** A person confirming or editing an edge (PATCH /api/relationships/[id]). */
export async function updateRelationship(
    db: Db,
    id: string,
    patch: { context?: string; evidence?: string | null; confirm?: boolean },
): Promise<Relationship | null> {
    const rows = await db`
        UPDATE repo_relationships SET
            context      = COALESCE(${patch.context ?? null}, context),
            evidence     = CASE WHEN ${patch.evidence !== undefined} THEN ${patch.evidence ?? null} ELSE evidence END,
            status       = CASE WHEN ${!!patch.confirm} THEN 'confirmed' ELSE status END,
            confirmed_at = CASE WHEN ${!!patch.confirm} THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
            updated_at   = NOW()
        WHERE id = ${id}
        RETURNING id, source, target, kind, context, evidence, status, origin, created_by,
                  created_at, updated_at, confirmed_at
    `;
    return (rows[0] as Relationship | undefined) ?? null;
}

export async function deleteRelationship(db: Db, id: string): Promise<boolean> {
    const rows = await db`DELETE FROM repo_relationships WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
}

/** Compact shape for agents: one line of meaning per edge. */
export function describeRelationship(r: Relationship): string {
    return `${r.source} ${r.kind} ${r.target}: ${r.context}${r.status === 'proposed' ? ' (proposed, unconfirmed)' : ''}`;
}
