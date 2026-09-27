import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TasksSection } from './TasksSection';

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
