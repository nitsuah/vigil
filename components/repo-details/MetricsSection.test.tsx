import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MetricsSection } from './MetricsSection';

afterEach(cleanup);

describe('MetricsSection', () => {
  it('shows the self-reported explanation without hover', () => {
    render(<MetricsSection metrics={[{ name: 'Health Score', value: 95, unit: '/100' }]} />);
    expect(screen.getByText('Self-reported')).toBeTruthy();
  });

  it('shows whole dates and hides year-only rows from older syncs', () => {
    render(<MetricsSection metrics={[{ name: 'Last Updated', value: 20260924, unit: 'date' }, { name: 'Last Updated', value: 2026, unit: null }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Metrics/ }));
    expect(screen.getByText('2026-09-24')).toBeTruthy();
    expect(screen.queryByText('2026')).toBeNull();
  });

  it('keeps ordinary counts whose names mention updates', () => {
    render(<MetricsSection metrics={[{ name: 'Updated files', value: 2000, unit: 'files' }]} />);
    expect(screen.getByText('1 value')).toBeTruthy();
  });

  it('preserves the tracked metric count and values', () => {
    render(<MetricsSection metrics={[{ name: 'Health Score', value: 95, unit: '/100' }]} />);
    expect(screen.getByText('1 value')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Metrics/ }));
    expect(screen.getByText('Health Score (self-reported)')).toBeTruthy();
    expect(screen.getByText(/can differ from its own health grade/)).toBeTruthy();
  });
});
