import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MetricsSection } from './MetricsSection';

afterEach(cleanup);

describe('MetricsSection', () => {
  it('shows the self-reported explanation without hover', () => {
    render(<MetricsSection metrics={[{ name: 'Health Score', value: 95, unit: '/100' }]} />);
    expect(screen.getByText('Self-reported')).toBeTruthy();
  });

  it('preserves the tracked metric count and values', () => {
    render(<MetricsSection metrics={[{ name: 'Health Score', value: 95, unit: '/100' }]} />);
    expect(screen.getByText('1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Metrics/ }));
    expect(screen.getByText('Health Score')).toBeTruthy();
  });
});
