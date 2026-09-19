import { describe, expect, it } from 'bun:test';
import {
  asOfLine,
  audienceExpansionPrompt,
  evidenceLine,
  evidenceSeries,
  formatEvidenceValue,
  formatSettingsValue,
  impactLabel,
  impactPerDay,
  jainaPromptHref,
  queueSummary,
  settingsPatchOf,
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

describe('settings patch', () => {
  it('reads a well-formed patch from seed and rejects anything else', () => {
    expect(
      settingsPatchOf({
        seed: { patch: { field: 'max_change_pct_per_cycle', from: 0.2, to: 0.3 } },
      }),
    ).toEqual({ field: 'max_change_pct_per_cycle', from: 0.2, to: 0.3 });
    expect(
      settingsPatchOf({ seed: { patch: { field: 'apply_mode', from: null, to: 1 } } }),
    ).toBeNull();
    expect(settingsPatchOf({ seed: { patch: { field: 'daily_total', to: 'x' } } })).toBeNull();
    expect(settingsPatchOf({ seed: null })).toBeNull();
  });
  it('formats a percentage knob and a money knob', () => {
    expect(formatSettingsValue('max_change_pct_per_cycle', 0.3, 'USD')).toBe('30%');
    expect(formatSettingsValue('daily_total', 340, 'USD')).toBe('$340');
    expect(formatSettingsValue('daily_total', null, 'USD')).toBe('not set');
  });
});

describe('evidenceSeries', () => {
  const w = (spend: number, leads: number, clicks: number, impressions: number) => ({
    spend,
    purchases: 0,
    addToCarts: 0,
    clicks,
    impressions,
    leads,
  });
  const snapshot = {
    id: 'a',
    status: 'active',
    currentBudget: 100,
    ageDays: 30,
    frequency7d: 3.4,
    windows: { d3: w(300, 2, 30, 3000), d7: w(700, 10, 100, 8000), d14: w(1400, 35, 300, 20000) },
  } as never;

  it('turns a cost-per-result argument into the three windows against the reference', () => {
    const series = evidenceSeries(evidence(), snapshot, 'leads');
    expect(series?.unit).toBe('money');
    expect(series?.points).toEqual([
      { label: '3d', value: 150 },
      { label: '7d', value: 70 },
      { label: '14d', value: 40 },
    ]);
    expect(series?.threshold).toBe(25);
  });
  it('reads CTR from clicks over impressions and frequency from the 7d scalar', () => {
    const ctr = evidenceSeries(evidence({ metric: 'ctr', threshold: 0.015 }), snapshot, 'leads');
    expect(ctr?.points.map((p) => p.value)).toEqual([0.01, 0.0125, 0.015]);
    const freq = evidenceSeries(evidence({ metric: 'frequency', threshold: 3 }), snapshot, 'leads');
    expect(freq?.points).toEqual([{ label: '7d', value: 3.4 }]);
    expect(freq?.thresholdLabel).toBe('cap');
  });
  it('is null without a snapshot or for a metric it cannot draw', () => {
    expect(evidenceSeries(evidence(), null, 'leads')).toBeNull();
    expect(evidenceSeries(evidence({ metric: 'cap_binding_share' }), snapshot, 'leads')).toBeNull();
  });
  it('formats by unit', () => {
    expect(formatEvidenceValue('money', 40, 'USD')).toBe('$40');
    expect(formatEvidenceValue('percent', 0.0125, null)).toBe('1.25%');
    expect(formatEvidenceValue('number', 3.4, null)).toBe('3.4');
  });
});

describe('audience expansion hand-off', () => {
  it('names the ad set, carries the diagnosis and asks for the three buckets with sizes', () => {
    const prompt = audienceExpansionPrompt(
      {
        adset_id: '1202',
        reason: 'Frequency 5.4 ≥ 3 with CPA up 39%.',
        trigger: 'F2_audience_saturation',
      },
      'ITESO // AGOSTO - BROAD',
    );
    expect(prompt).toContain('"ITESO // AGOSTO - BROAD" (ad set 1202)');
    expect(prompt).toContain('Frequency 5.4');
    expect(prompt).toContain('three buckets');
    expect(prompt).toContain('estimated size');
    expect(jainaPromptHref('a b')).toBe('/scale?tab=jaina&prompt=a%20b');
  });
});
