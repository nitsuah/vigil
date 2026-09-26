
import { describe, it, expect } from 'vitest';
import { parseTasks } from './tasks';

describe('parseTasks', () => {
    it('should parse tasks correctly', () => {
        const content = `
# Tasks

## Todo
- [ ] Task 1

## In Progress
- [/] Task 2

## Done
- [x] Task 3
`;
        const result = parseTasks(content);

        expect(result.tasks).toHaveLength(3);
        expect(result.tasks[0].title).toBe('Task 1');
        expect(result.tasks[0].status).toBe('todo');
        expect(result.tasks[0].section).toBe('Todo');

        expect(result.tasks[1].title).toBe('Task 2');
        expect(result.tasks[1].status).toBe('in-progress');

        expect(result.tasks[2].title).toBe('Task 3');
        expect(result.tasks[2].status).toBe('done');
    });
});

describe('parseTasks — priority, owner, and in-progress sections', () => {
    it('takes priority from a P-heading when the task has no tag', () => {
        const { tasks } = parseTasks(`
## Todo
### P1 - High
- [ ] Ship it
### P3 - Exploratory / Deferred
- [ ] Maybe later
### Documentation
- [ ] No bucket
`);
        expect(tasks.map(t => t.priority)).toEqual(['P1', 'P3', null]);
    });

    it('takes priority from a bare "## P2" section heading', () => {
        const { tasks } = parseTasks(`## P2\n- [ ] Thing\n`);
        expect(tasks[0].priority).toBe('P2');
    });

    it('prefers a "- Priority:" sub-bullet over the heading and an inline tag', () => {
        const { tasks } = parseTasks(`
## Todo
### P3 - Exploratory
- [ ] Mentions (P2, M) inline
  - Priority: P1 — Calendly has been removed
  - Priority: P0
`);
        expect(tasks[0].priority).toBe('P1');
    });

    it('reads inline tags like "(P3, M)" and "(P2, S · Type: Security)"', () => {
        const { tasks } = parseTasks(`
## Todo
- [ ] Basic CLI interface (P3, M) — not started.
- [ ] Triage Slither (P2, S · Type: Security · Confidence: High).
- [ ] Finish P6 and P7 polish, see PR #55
`);
        expect(tasks.map(t => t.priority)).toEqual(['P3', 'P2', null]);
    });

    it('attaches an Owner/Assignee sub-bullet to the preceding task only', () => {
        const { tasks } = parseTasks(`
## Todo
- [ ] Owned
  - Context: something
  - **Owner:** nitsuah
- [ ] Unowned

- [ ] Assigned
  - Assignee: agent-board
`);
        expect(tasks.map(t => t.owner)).toEqual(['nitsuah', null, 'agent-board']);
    });

    it('does not leak metadata across a paragraph break', () => {
        const { tasks } = parseTasks(`
## Todo
- [ ] First
Some paragraph text.
  - Priority: P0
`);
        expect(tasks[0].priority).toBeNull();
    });

    it('treats an unchecked box under "In Progress" as in-progress', () => {
        const { tasks } = parseTasks(`
## In Progress
- [ ] Working on it
## Todo
- [ ] Not yet
`);
        expect(tasks.map(t => t.status)).toEqual(['in-progress', 'todo']);
    });
});
