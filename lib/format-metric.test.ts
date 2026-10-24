import { describe, it, expect } from 'vitest';
import { joinMetricValue } from './format-metric';

describe('joinMetricValue', () => {
  it('returns value as string when no unit', () => {
    expect(joinMetricValue(5, undefined)).toBe('5');
    expect(joinMetricValue('5', null)).toBe('5');
  });

  it('joins compact units without space', () => {
    expect(joinMetricValue(86, '%')).toBe('86%');
    expect(joinMetricValue(6, 's')).toBe('6s');
    expect(joinMetricValue(245, 'KB')).toBe('245KB');
  });

  it('adds space for longer units', () => {
    expect(joinMetricValue('2.4992', 'functions')).toBe('2.4992 functions');
    expect(joinMetricValue(11, 'high')).toBe('11 high');
    expect(joinMetricValue(151, '🟢 Pass')).toBe('151 🟢 Pass');
  });
});