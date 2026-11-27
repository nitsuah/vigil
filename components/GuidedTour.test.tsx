import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

  it('offers Pause for as long as auto-play is on', () => {
    render(<GuidedTour onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });
});
