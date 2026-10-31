import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { IssuesSection } from './IssuesSection';

afterEach(cleanup);

const counts = { total: 5, vulnerability: 1, bug: 2, feedback: 1, other: 1, complete: true };
const repoUrl = 'https://github.com/o/r';

describe('IssuesSection open issues', () => {
  it('renders nothing with no vulnerabilities and no open issues', () => {
    const { container } = render(<IssuesSection vulnAlertCount={0} issueCategoryCounts={null} isExpanded />);
    expect(container.innerHTML).toBe('');
  });

  it('shows Total, Feedback, Bugs, Other, then Vulnerabilities when there are no alerts', () => {
    const { container } = render(<IssuesSection vulnAlertCount={0} issueCategoryCounts={counts} repoUrl={repoUrl} isExpanded />);
    const text = container.textContent ?? '';
    expect(text.indexOf('Total')).toBeGreaterThan(-1);
    expect(text.indexOf('Total')).toBeLessThan(text.indexOf('Feedback'));
    expect(text.indexOf('Feedback')).toBeLessThan(text.indexOf('Bugs'));
    expect(text.indexOf('Bugs')).toBeLessThan(text.indexOf('Other'));
    expect(text.indexOf('Other')).toBeLessThan(text.indexOf('Vulnerabilities'));
  });

  it('links Bugs to the bug label filter', () => {
    const { container } = render(<IssuesSection vulnAlertCount={0} issueCategoryCounts={counts} repoUrl={repoUrl} isExpanded />);
    expect(container.querySelector('a[href$="label%3Abug"]')).not.toBeNull();
  });

  it('shows the incomplete notice only when counts are incomplete', () => {
    const first = render(<IssuesSection vulnAlertCount={0} issueCategoryCounts={{ ...counts, complete: false }} repoUrl={repoUrl} isExpanded />);
    expect(screen.getByText(/Counts are incomplete/)).toBeTruthy();
    first.unmount();
    render(<IssuesSection vulnAlertCount={0} issueCategoryCounts={counts} repoUrl={repoUrl} isExpanded />);
    expect(screen.queryByText(/Counts are incomplete/)).toBeNull();
  });
});