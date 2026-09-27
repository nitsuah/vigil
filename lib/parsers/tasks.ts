import matter from 'gray-matter';
import { Task, TaskPriority } from '@/types/repo';

export interface TaskData {
    frontmatter: {
        repo?: string;
        updated?: Date;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
    tasks: Task[];
}

/** `P0`–`P3` as a standalone token, e.g. "P1 - High", "(P3, M)", "[P2]". */
const PRIORITY_TOKEN = /(?<![A-Za-z0-9])P([0-3])(?![A-Za-z0-9])/;

/** A heading that names a priority bucket: "P1 - High", "P1", "P3 - Exploratory / Deferred". */
function headingPriority(heading: string): TaskPriority | null {
    const m = heading.match(/^P([0-3])(?![A-Za-z0-9])/);
    return m ? (`P${m[1]}` as TaskPriority) : null;
}

export function parseTasks(content: string): TaskData {
    const { data: frontmatter, content: markdown } = matter(content);

    const tasks: Task[] = [];
    const lines = markdown.split(/\r?\n/);
    let currentSection = '';
    let currentSubsection = '';
    // Priority implied by the enclosing heading; an explicit tag on the task wins.
    let sectionPriority: TaskPriority | null = null;
    let subsectionPriority: TaskPriority | null = null;
    // The last top-level task, so indented `- Priority:` / `- Owner:` lines can attach to it.
    let lastTask: Task | null = null;
    let lastTaskHasPriorityLine = false;

    for (const line of lines) {
        // Detect main section headers (## Done, ## In Progress, ## Todo)
        const sectionMatch = line.match(/^##\s+(.+)$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim();
            currentSubsection = ''; // Reset subsection when entering new section
            sectionPriority = headingPriority(currentSection);
            subsectionPriority = null;
            lastTask = null;
            continue;
        }

        // Detect subsection headers (### Phase 1, ### Phase 2, etc.)
        const subsectionMatch = line.match(/^###\s+(.+)$/);
        if (subsectionMatch) {
            currentSubsection = subsectionMatch[1].trim();
            subsectionPriority = headingPriority(currentSubsection);
            lastTask = null;
            continue;
        }

        // Parse task list items with optional ID in HTML comment - handle both - and * bullets
        const taskMatch = line.match(/^[-*]\s+\[([ x/])\]\s+(.+?)(?:\s+<!--\s*id:\s*(.+?)\s*-->)?$/);
        if (taskMatch) {
            const [, statusChar, title, id] = taskMatch;
            // An unchecked box under an "In Progress" heading is in progress, not todo.
            const inProgressSection = /^in[\s-]progress\b/i.test(currentSection);
            const status = statusChar === 'x' ? 'done'
                : statusChar === '/' || inProgressSection ? 'in-progress'
                : 'todo';

            // Generate ID if not provided - include section for better uniqueness
            const taskId = id?.trim() || generateTaskId(title, currentSection, currentSubsection);

            const inlinePriority = title.match(PRIORITY_TOKEN);
            lastTask = {
                id: taskId,
                title: title.trim(),
                status,
                section: currentSection || null,
                subsection: currentSubsection || null,
                priority: inlinePriority
                    ? (`P${inlinePriority[1]}` as TaskPriority)
                    : subsectionPriority ?? sectionPriority,
                owner: null,
            };
            lastTaskHasPriorityLine = false;
            tasks.push(lastTask);
            continue;
        }

        // Indented metadata under the last task: "  - Priority: P2", "  - Owner: agent-board".
        const metaMatch = lastTask && line.match(/^\s+[-*]\s+(?:\*\*)?(Priority|Owner|Assignee)(?:\*\*)?:\s*(.+)$/i);
        if (metaMatch && lastTask) {
            const [, key, value] = metaMatch;
            if (key.toLowerCase() === 'priority') {
                // A dedicated Priority line beats an inline tag or heading; only the first one counts.
                const p = value.match(PRIORITY_TOKEN);
                if (p && !lastTaskHasPriorityLine) {
                    lastTask.priority = `P${p[1]}` as TaskPriority;
                    lastTaskHasPriorityLine = true;
                }
            } else if (!lastTask.owner) {
                lastTask.owner = value.replace(/\*\*/g, '').trim() || null;
            }
            continue;
        }

        // Any other non-indented, non-blank line ends the current task's metadata block.
        if (line.trim() && !/^\s/.test(line)) lastTask = null;
    }

    if (frontmatter.updated !== undefined && !(frontmatter.updated instanceof Date)) {
        const d = new Date(frontmatter.updated);
        frontmatter.updated = isNaN(d.getTime()) ? frontmatter.updated : d;
    }

    return {
        frontmatter,
        tasks,
    };
}

function generateTaskId(title: string, section?: string, subsection?: string): string {
    // Create a more unique ID by incorporating section/subsection
    let baseId = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    
    // If we have section context, prepend a short version of it
    if (subsection) {
        const subsectionPrefix = subsection
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 20);
        baseId = `${subsectionPrefix}-${baseId}`;
    } else if (section) {
        const sectionPrefix = section
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 15);
        baseId = `${sectionPrefix}-${baseId}`;
    }
    
    return baseId.substring(0, 100);
}
