import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import GuidedTour from './GuidedTour';
import { readTourState } from '@/lib/tour-state';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('GuidedTour', () => {
  it('skips on Escape even when focus has left the tooltip', () => {
    const onClose = vi.fn();
    render(<GuidedTour onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(readTourState()).toMatchObject({ tour: 'partial', mode: 'quick', step: 0 });
  });

  it('keeps a step with no target away from the top-left corner', () => {
    render(<GuidedTour onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const dialog = screen.getByRole('dialog');
    expect(parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(100);
    expect(parseFloat(dialog.style.left)).toBeGreaterThanOrEqual(16);
  });

  it.each([
    ['opens the first row when only unrelated grids are on the page', <dl key="a" className="grid" />, 1],
    ['leaves an expanded row alone, even before its report loads', <button key="b" data-report-toggle aria-expanded="true" />, 0],
  ])('%s', async (_name, extra, clicks) => {
    const onRowClick = vi.fn();
    render(
      <>
        {extra}
        <table><tbody><tr onClick={onRowClick}><td>repo</td></tr></tbody></table>
        <GuidedTour onClose={vi.fn()} />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onRowClick).toHaveBeenCalledTimes(clicks);
  });

  it('skips steps whose targets are missing or zero-size, in both directions', () => {
    vi.useFakeTimers();
    try {
      // Rendered but zero-size, like a copy hidden at this screen width.
      render(<><div data-tour="docs" /><GuidedTour onClose={vi.fn()} /></>);
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      for (let i = 0; i < 24; i++) act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('Step 5 of 5')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Back|Previous/ }));
      for (let i = 0; i < 24; i++) act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('Step 1 of 5')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('advances on its own only after Play is chosen', () => {
    vi.useFakeTimers();
    try {
      render(<GuidedTour onClose={vi.fn()} />);
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(screen.getByText('Step 1 of 5')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      act(() => { vi.advanceTimersByTime(3_100); });
      expect(screen.getByText('Step 2 of 5')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers Pause for as long as auto-play is on', () => {
    render(<GuidedTour onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });
});
