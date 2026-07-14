import { describe, expect, it } from 'bun:test';
import type { OrganicComputedInsight } from '@/lib/organic/organic-insights.types';
import { isZeroDataInsightSet } from './organicInsightPresentation';

const insight = (value: number, delta: number): OrganicComputedInsight =>
  ({
    category: 'engagement',
    text: 'Computed insight',
    severity: 'neutral',
    source: 'computed',
    value,
    delta,
  }) as OrganicComputedInsight;

describe('isZeroDataInsightSet', () => {
  it('recognizes repeated zero-data analysis', () => {
    expect(isZeroDataInsightSet([insight(0, 0), insight(0, 0), insight(0, 0)])).toBe(true);
  });

  it('preserves stable insights backed by a non-zero metric', () => {
    expect(isZeroDataInsightSet([insight(120, 0), insight(0, 0)])).toBe(false);
  });
});
