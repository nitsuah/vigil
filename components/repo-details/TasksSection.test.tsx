import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TasksSection } from './TasksSection';
import type { Task } from '@/types/repo';

afterEach(cleanup);

describe('TasksSection empty states', () => {
    it('renders nothing when TASKS.md is missing (Documentation flags that)', () => {
        const { container } = render(<TasksSection tasks={[]} />);
        expect(container.innerHTML).toBe('');
    });

    it('shows an explicit empty card when TASKS.md exists but has no checklist items (regression: ats-fill)', () => {
        render(<TasksSection tasks={[]} tasksDocExists />);
        expect(screen.getByText('Tasks')).toBeTruthy();
        expect(screen.getByText(/TASKS\.md found, but it has no task items/)).toBeTruthy();
    });

    it('still renders the normal card when tasks exist', () => {
        render(<TasksSection tasks={[{ id: 't', title: 'Do it', status: 'todo', section: 'Todo' }]} tasksDocExists />);
        expect(screen.queryByText(/no task items/)).toBeNull();
    });
});

describe('TasksSection collapsed priority order', () => {
    it('shows the highest-priority group (P2 before P3) in collapsed view', () => {
        const tasks: Task[] = [
            { id: '1', title: 'P2 task', status: 'todo', section: 'Todo', subsection: 'P2 - Medium' },
            { id: '2', title: 'P3 task', status: 'todo', section: 'Todo', subsection: 'P3 - Exploratory' },
        ];
        render(<TasksSection tasks={tasks} tasksDocExists />);
        // Collapsed view shows only first subsection group
        expect(screen.getByText('P2 task')).toBeTruthy();
        expect(screen.queryByText('P3 task')).toBeNull();
        // Show all button shows count of remaining subsections
        expect(screen.getByText(/Show all \(1\)/)).toBeTruthy();
    });
});
