import { parseFrontMatter } from './front-matter';

export interface RoadmapData {
    frontmatter: {
        status?: string;
        priority?: 'low' | 'medium' | 'high';
        owner?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
    items: RoadmapItemData[];
}

export interface RoadmapItemData {
    title: string;
    quarter: string | null;
    status: 'planned' | 'in-progress' | 'completed';
    section: string;
}

export interface ExistingRoadmapRow {
    id: string;
    title: string;
}

export interface RoadmapMergePlan {
    toUpdate: { id: string; title: string; quarter: string | null; status: RoadmapItemData['status'] }[];
    toInsert: { title: string; quarter: string | null; status: RoadmapItemData['status'] }[];
    toDeleteIds: string[];
}

// Diffs freshly-parsed ROADMAP.md items against existing DB rows by title, so
// sync can merge instead of delete+insert - preserving DB-only columns
// (e.g. linked_pr_number, agent_task_id) on items that persist across syncs.
export function diffRoadmapItems(existing: ExistingRoadmapRow[], parsed: RoadmapItemData[]): RoadmapMergePlan {
    const remaining = new Map(existing.map(row => [row.title, row.id]));
    const toUpdate: RoadmapMergePlan['toUpdate'] = [];
    const toInsert: RoadmapMergePlan['toInsert'] = [];

    for (const item of parsed) {
        const existingId = remaining.get(item.title);
        if (existingId) {
            toUpdate.push({ id: existingId, title: item.title, quarter: item.quarter, status: item.status });
            remaining.delete(item.title);
        } else {
            toInsert.push({ title: item.title, quarter: item.quarter, status: item.status });
        }
    }

    return { toUpdate, toInsert, toDeleteIds: [...remaining.values()] };
}

export function parseRoadmap(content: string): RoadmapData {
    const { data: frontmatter, content: markdown } = parseFrontMatter(content);

    const items: RoadmapItemData[] = [];
    const lines = markdown.split(/\r?\n/);
    let currentSection = '';

    for (const line of lines) {
        // Detect section headers (## Q1 2025, ## Phase 1, etc.) - also accept # as fallback
        const sectionMatch = line.match(/^(#{1,2})\s+(.+)$/);
        if (sectionMatch) {
            currentSection = sectionMatch[2].trim();
            continue;
        }

        // Parse task list items - handle both - and * bullets
        const taskMatch = line.match(/^[-*]\s+\[([ x/])\]\s+(.+)$/);
        if (taskMatch) {
            const [, statusChar, title] = taskMatch;
            const status = statusChar === 'x' ? 'completed' : statusChar === '/' ? 'in-progress' : 'planned';

            items.push({
                title: title.trim(),
                quarter: currentSection || null,
                status,
                section: currentSection,
            });
        }
    }

    return {
        frontmatter,
        items,
    };
}
