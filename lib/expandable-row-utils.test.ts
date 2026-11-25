import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  groupByQuarter,
  groupBySubsection,
  getDisplayedItems,
  getStatusIcon,
  getStatusColor,
  getStandardLabel,
  formatLocNumber,
  getReadmeFreshness,
} from './expandable-row-utils';
import type { RoadmapItem, Task } from '@/types/repo';

describe('expandable-row-utils', () => {
  describe('groupByQuarter', () => {
    it('groups items with same quarter together', () => {
      const items = [
        { id: '1', title: 'A', quarter: 'Q1', status: 'planned' },
        { id: '2', title: 'B', quarter: 'Q1', status: 'in-progress' },
        { id: '3', title: 'C', quarter: 'Q2', status: 'completed' },
      ] as unknown as RoadmapItem[];

      const result = groupByQuarter(items);

      expect(result.Q1).toHaveLength(2);
      expect(result.Q2).toHaveLength(1);
    });

    it('items with no quarter land under Other', () => {
      const items = [
        { id: '1', title: 'A', quarter: 'Q1', status: 'planned' },
        { id: '2', title: 'B', quarter: null, status: 'in-progress' },
      ] as unknown as RoadmapItem[];

      const result = groupByQuarter(items);

      expect(result.Q1).toHaveLength(1);
      expect(result.Other).toHaveLength(1);
    });

    it('empty array returns empty object', () => {
      const result = groupByQuarter([] as unknown as RoadmapItem[]);
      expect(result).toEqual({});
    });
  });

  describe('groupBySubsection', () => {
    it('groups items with same subsection together', () => {
      const items = [
        { id: '1', title: 'A', subsection: 'frontend', status: 'todo' },
        { id: '2', title: 'B', subsection: 'frontend', status: 'in-progress' },
        { id: '3', title: 'C', subsection: 'backend', status: 'done' },
      ] as unknown as Task[];

      const result = groupBySubsection(items);

      expect(result.frontend).toHaveLength(2);
      expect(result.backend).toHaveLength(1);
    });

    it('items with no subsection land under Other', () => {
      const items = [
        { id: '1', title: 'A', subsection: 'frontend', status: 'todo' },
        { id: '2', title: 'B', subsection: null, status: 'in-progress' },
      ] as unknown as Task[];

      const result = groupBySubsection(items);

      expect(result.frontend).toHaveLength(1);
      expect(result.Other).toHaveLength(1);
    });

    it('empty array returns empty object', () => {
      const result = groupBySubsection([] as unknown as Task[]);
      expect(result).toEqual({});
    });
  });

  describe('getDisplayedItems', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it('returns first 5 by default when section not expanded', () => {
      const result = getDisplayedItems(items, 'section1', new Set());
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('returns first limit items when limit provided', () => {
      const result = getDisplayedItems(items, 'section1', new Set(), 3);
      expect(result).toEqual([1, 2, 3]);
    });

    it('returns all items when section is expanded', () => {
      const result = getDisplayedItems(items, 'section1', new Set(['section1']));
      expect(result).toEqual(items);
    });

    it('works with empty items array', () => {
      const result = getDisplayedItems([], 'section1', new Set());
      expect(result).toEqual([]);
    });
  });

  describe('getStatusIcon', () => {
    it('present returns CheckCircle2 green', () => {
      expect(getStatusIcon('present')).toEqual({ icon: 'CheckCircle2', color: 'text-green-400' });
    });

    it('healthy returns CheckCircle2 green', () => {
      expect(getStatusIcon('healthy')).toEqual({ icon: 'CheckCircle2', color: 'text-green-400' });
    });

    it('missing returns XCircle red', () => {
      expect(getStatusIcon('missing')).toEqual({ icon: 'XCircle', color: 'text-red-400' });
    });

    it('dormant returns Clock yellow', () => {
      expect(getStatusIcon('dormant')).toEqual({ icon: 'Clock', color: 'text-yellow-400' });
    });

    it('malformed returns AlertCircle orange', () => {
      expect(getStatusIcon('malformed')).toEqual({ icon: 'AlertCircle', color: 'text-orange-400' });
    });

    it('unknown returns Circle slate', () => {
      expect(getStatusIcon('unknown')).toEqual({ icon: 'Circle', color: 'text-slate-500' });
    });
  });

  describe('getStatusColor', () => {
    it('present returns green', () => {
      expect(getStatusColor('present')).toBe('text-green-400');
    });

    it('healthy returns green', () => {
      expect(getStatusColor('healthy')).toBe('text-green-400');
    });

    it('missing returns red', () => {
      expect(getStatusColor('missing')).toBe('text-red-400');
    });

    it('dormant returns yellow', () => {
      expect(getStatusColor('dormant')).toBe('text-yellow-400');
    });

    it('malformed returns orange', () => {
      expect(getStatusColor('malformed')).toBe('text-orange-400');
    });

    it('unknown returns slate', () => {
      expect(getStatusColor('unknown')).toBe('text-slate-400');
    });
  });

  describe('getStandardLabel', () => {
    it('code_of_conduct -> Code of Conduct', () => {
      expect(getStandardLabel('code_of_conduct')).toBe('Code of Conduct');
    });

    it('security -> Security Policy', () => {
      expect(getStandardLabel('security')).toBe('Security Policy');
    });

    it('pr_template -> PR Template', () => {
      expect(getStandardLabel('pr_template')).toBe('PR Template');
    });

    it('unknown snake_case -> Title Case', () => {
      expect(getStandardLabel('my_new_doc')).toBe('My New Doc');
    });
  });

  describe('formatLocNumber', () => {
    it('undefined returns N/A', () => {
      expect(formatLocNumber(undefined)).toBe('N/A');
    });

    it('0 returns N/A', () => {
      expect(formatLocNumber(0)).toBe('N/A');
    });

    it('999 returns 999', () => {
      expect(formatLocNumber(999)).toBe('999');
    });

    it('1500 returns 1.5K', () => {
      expect(formatLocNumber(1500)).toBe('1.5K');
    });

    it('12000 returns 12.0K', () => {
      expect(formatLocNumber(12000)).toBe('12.0K');
    });
  });

  describe('getReadmeFreshness', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-30T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('null returns Unknown', () => {
      const result = getReadmeFreshness(null);
      expect(result).toEqual({ daysSince: 0, label: 'Unknown', color: 'text-slate-400' });
    });

    it('undefined returns Unknown', () => {
      const result = getReadmeFreshness(undefined);
      expect(result).toEqual({ daysSince: 0, label: 'Unknown', color: 'text-slate-400' });
    });

    it('10 days ago returns Fresh', () => {
      const date = new Date('2026-06-20T00:00:00Z').toISOString();
      const result = getReadmeFreshness(date);
      expect(result.daysSince).toBe(10);
      expect(result.label).toBe('Fresh');
      expect(result.color).toBe('text-green-400');
    });

    it('45 days ago returns Recent', () => {
      const date = new Date('2026-05-16T00:00:00Z').toISOString();
      const result = getReadmeFreshness(date);
      expect(result.daysSince).toBe(45);
      expect(result.label).toBe('Recent');
      expect(result.color).toBe('text-blue-400');
    });

    it('120 days ago returns Aging', () => {
      const date = new Date('2026-03-02T00:00:00Z').toISOString();
      const result = getReadmeFreshness(date);
      expect(result.daysSince).toBe(120);
      expect(result.label).toBe('Aging');
      expect(result.color).toBe('text-yellow-400');
    });

    it('200 days ago returns Stale', () => {
      const date = new Date('2025-12-12T00:00:00Z').toISOString();
      const result = getReadmeFreshness(date);
      expect(result.daysSince).toBe(200);
      expect(result.label).toBe('Stale');
      expect(result.color).toBe('text-red-400');
    });
  });
});