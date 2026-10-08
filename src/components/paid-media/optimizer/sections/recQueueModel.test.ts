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
  queueHeadline,
  queueHeadlineLine,
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
    // Day AND month — the same pair the account cards print, from the same helper.
    expect(impactLabel({ evidence: evidence() }, 'USD')).toBe('$100/day · $3,000/mo at stake');
    expect(impactPerDay({ evidence: null })).toBe(0);
    expect(impactLabel({ evidence: evidence({ estImpactPerDay: null }) }, 'USD')).toBeNull();
  });
});

// The queue and the account cards are two views of the same findings. A row that carries the
// engine's headline leads with it; one that does not falls back to its money, exactly as an
// account candidate with no headline does.
describe('the headline a queue row leads with', () => {
  const headline = {
    kind: 'efficiency',
    value: 33,
    unit: 'percent',
    label: 'cheaper per result',
    from: 90,
    to: 60,
  };

  it('surfaces a headline the engine wrote onto the row', () => {
    expect(queueHeadline({ evidence: evidence({ headline }) })).toEqual({
      kind: 'efficiency',
      value: 33,
      unit: 'percent',
      label: 'cheaper per result',
      from: 90,
      to: 60,
    });
    expect(queueHeadlineLine({ evidence: evidence({ headline }) }, 'USD')).toBe(
      '33% cheaper per result',
    );
  });

  it('prints money per day in the account currency, never multiplied', () => {
    expect(
      queueHeadlineLine(
        {
          evidence: evidence({
            headline: {
              kind: 'avoided',
              value: 96,
              unit: 'currency_per_day',
              label: 'a day buying nothing',
              from: null,
              to: null,
            },
          }),
        },
        'USD',
      ),
    ).toBe('$96.00 a day buying nothing');
  });

  it('reads a malformed headline as no headline, rather than printing a figure nobody computed', () => {
    // A label longer than the 32 characters the schema allows, and a value that is not a number.
    expect(
      queueHeadline({ evidence: evidence({ headline: { kind: 'efficiency', value: 'lots' } }) }),
    ).toBeNull();
    expect(
      queueHeadline({
        evidence: evidence({
          headline: { ...headline, label: 'a label far longer than the thirty-two allowed' },
        }),
      }),
    ).toBeNull();
  });

  it('is null on every row written before the engine carried one', () => {
    expect(queueHeadline({ evidence: evidence() })).toBeNull();
    expect(queueHeadline({ evidence: null })).toBeNull();
    expect(queueHeadlineLine({ evidence: evidence() }, 'USD')).toBeNull();
  });
});

// The shapes below are PRODUCTION rows, copied verbatim from
// `optimizer_get_portfolio_performance` on the Easy Fit account (2026-09-21, MXN), together
// with the headline `optimizer:queue:headline:bench` proved the engine now writes for each
// one. A fixture invented here would agree with itself; these do not get that luxury —
// the engine is a different package in a different repo and the only thing joining the two
// ends is `candidateHeadlineSchema`.
describe('a real production row, before and after the engine carries a headline', () => {
  const live = {
    F1: {
      value: 0.007450050795800881,
      metric: 'ctr',
      source: 'engine',
      window: 'd3' as const,
      threshold: 0.01031055900621118,
      comparator: 'down 28% vs 14d, CPA up 156%',
      estImpactPerDay: 32.76571428571428,
    },
    P2: {
      value: 193.215,
      metric: 'cpp',
      source: 'engine',
      window: 'd14' as const,
      threshold: 114.084375,
      comparator: 'vs 2.5× the robust reference ($46)',
      estImpactPerDay: 27.60214285714286,
    },
    P1: {
      value: 76.62,
      metric: 'spend',
      source: 'engine',
      window: 'd3' as const,
      threshold: 5,
      comparator: 'with 0 leads, landing-page view cost 77 vs 14 avg',
      estImpactPerDay: 25.540000000000003,
    },
  };

  it('reads as finished on its money today, because no live row carries a headline yet', () => {
    for (const row of Object.values(live)) {
      expect(queueHeadline({ evidence: row })).toBeNull();
      expect(queueHeadlineLine({ evidence: row }, 'MXN')).toBeNull();
      // The fallback is not a hole: the money line is still there to lead with.
      expect(impactLabel({ evidence: row }, 'MXN')).not.toBeNull();
    }
  });

  it('leads with the trigger’s own figure once the engine writes one onto the same row', () => {
    expect(
      queueHeadlineLine(
        {
          evidence: {
            ...live.F1,
            headline: {
              kind: 'drift',
              value: 28,
              unit: 'percent',
              label: 'less click-through than 14d',
              from: null,
              to: null,
            },
          },
        },
        'MXN',
      ),
    ).toBe('28% less click-through than 14d');

    expect(
      queueHeadlineLine(
        {
          evidence: {
            ...live.P2,
            headline: {
              kind: 'efficiency',
              value: 323,
              unit: 'percent',
              label: 'more per result than best',
              from: 193.22,
              to: 45.63,
            },
          },
        },
        'MXN',
      ),
    ).toBe('323% more per result than best');

    expect(
      queueHeadlineLine(
        {
          evidence: {
            ...live.P1,
            headline: {
              kind: 'avoided',
              value: 25.54,
              unit: 'currency_per_day',
              label: 'a day buying nothing',
              from: null,
              to: null,
            },
          },
        },
        'MXN',
      ),
      // 25.54 is not 26, and pesos are not dollars: the queue line says both, exactly as the
      // compiled card of the same finding does.
    ).toBe('25.54 MXN a day buying nothing');
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
  it("asOfLine calls a stale portfolio's next_realloc_at an attempt, never a cycle", () => {
    expect(asOfLine('2026-08-05T06:10:00Z', '2026-09-24T06:00:00Z', true)).toMatch(
      /^As of Aug [45] at .* · next attempt Sep 2[34] at /,
    );
    expect(asOfLine('2026-08-05T06:10:00Z', '2026-09-24T06:00:00Z', true)).not.toContain(
      'next cycle',
    );
    // Fresh is the default, so every existing caller reads exactly as before.
    expect(asOfLine('2026-08-05T06:10:00Z', '2026-09-24T06:00:00Z', false)).toContain('next cycle');
    expect(asOfLine('2026-08-05T06:10:00Z', null, true)).toMatch(/^As of Aug [45] at [^·]*$/);
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
    // The stored field is a fraction; the formatter it goes through never multiplies twice.
    expect(formatSettingsValue('max_change_pct_per_cycle', 1, 'USD')).toBe('100%');
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
    expect(formatEvidenceValue('money', 40, 'USD')).toBe('$40.00');
    expect(formatEvidenceValue('money', 40, null)).toBe('40.00');
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
