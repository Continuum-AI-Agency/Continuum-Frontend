import { describe, expect, it } from 'bun:test';
import {
  asOfLine,
  evidenceLine,
  impactLabel,
  impactPerDay,
  queueSummary,
  triggerWords,
} from './recQueueModel';

const evidence = (over: Record<string, unknown> = {}) => ({
  metric: 'cpp',
  value: 140,
  comparator: 'vs 2.5× the robust reference ($10)',
  threshold: 25,
  window: 'd14' as const,
  estImpactPerDay: 100,
  source: 'engine',
  ...over,
});

describe('evidenceLine', () => {
  it('renders metric, value, comparator and window in one line', () => {
    expect(evidenceLine(evidence(), 'USD')).toBe(
      'Cost per result $140 vs 2.5× the robust reference ($10) · 14d',
    );
  });
  it('formats CTR as a percentage and reach growth as a multiple', () => {
    expect(
      evidenceLine(
        evidence({ metric: 'ctr', value: 0.0123, comparator: 'down 40% vs 14d', window: 'd3' }),
        'USD',
      ),
    ).toBe('CTR 1.23% down 40% vs 14d · 3d');
    expect(
      evidenceLine(
        evidence({ metric: 'reach_expansion', value: 1.08, comparator: '14d reach vs 7d' }),
        null,
      ),
    ).toContain('Reach growth 1.08×');
  });
  it('is null for rows written before the engine carried evidence', () => {
    expect(evidenceLine(null, 'USD')).toBeNull();
  });
});

describe('impact', () => {
  it('reads the daily money and labels it, and is 0 / null when unknown', () => {
    expect(impactPerDay({ evidence: evidence() })).toBe(100);
    expect(impactLabel({ evidence: evidence() }, 'USD')).toBe('$100/day at stake');
    expect(impactPerDay({ evidence: null })).toBe(0);
    expect(impactLabel({ evidence: evidence({ estImpactPerDay: null }) }, 'USD')).toBeNull();
  });
});

describe('queueSummary', () => {
  it('groups pending rows by kind + trigger, sums the money, biggest first', () => {
    const rows = [
      { kind: 'pause', trigger: 'P2_sustained_poor', status: 'pending', evidence: evidence() },
      {
        kind: 'pause',
        trigger: 'P2_sustained_poor',
        status: 'pending',
        evidence: evidence({ estImpactPerDay: 40 }),
      },
      {
        kind: 'pause',
        trigger: 'P1_zero_upper_funnel',
        status: 'pending',
        evidence: evidence({ estImpactPerDay: 500 }),
      },
      {
        kind: 'creative_refresh',
        trigger: 'F1_creative_fatigue',
        status: 'pending',
        evidence: null,
      },
      { kind: 'pause', trigger: 'P2_sustained_poor', status: 'expired', evidence: evidence() },
    ];
    expect(queueSummary(rows).map((g) => [g.trigger, g.count, g.impactPerDay])).toEqual([
      ['P1_zero_upper_funnel', 1, 500],
      ['P2_sustained_poor', 2, 140],
      ['F1_creative_fatigue', 1, 0],
    ]);
  });
});

describe('words', () => {
  it('drops the engine prefix from a trigger id', () => {
    expect(triggerWords('P2_sustained_poor')).toBe('sustained poor');
    expect(triggerWords('rule:abc')).toBe('rule abc');
  });
  it('asOfLine names the cycle and the next one, or nothing without a cycle', () => {
    expect(asOfLine('2026-09-17T06:10:00Z', '2026-09-20T06:00:00Z')).toMatch(
      /^As of Sep 1[67] at .* · next cycle Sep (19|20) at /,
    );
    expect(asOfLine(null, '2026-09-20T06:00:00Z')).toBeNull();
  });
});
