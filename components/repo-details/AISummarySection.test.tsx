import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AISummarySection } from './AISummarySection';

afterEach(cleanup);

describe('AISummarySection', () => {
  it('shows when the summary was generated', () => {
    render(<AISummarySection aiSummary="A tool." generatedAt="2026-11-20T10:00:00Z" />);
    expect(screen.getByText('Generated 2026-11-20')).toBeTruthy();
  });

  it('shows no summary when a stored one has no whole sentence', () => {
    render(<AISummarySection aiSummary="A portfolio site built with Next.js and," />);
    expect(screen.getByText('No AI summary generated yet.')).toBeTruthy();
  });

  it('hides the dangling end of an older cut-off summary and says the date is unknown', () => {
    render(<AISummarySection aiSummary="A portfolio site. It is built with Next.js," />);
    expect(screen.getByText('A portfolio site.')).toBeTruthy();
    expect(screen.getByText('Generation date not recorded')).toBeTruthy();
  });
});
