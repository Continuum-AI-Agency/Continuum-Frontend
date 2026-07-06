import { describe, expect, it } from 'bun:test';

import { confidenceBand, parseReport, recommendationLabel } from './reportModel';

describe('parseReport', () => {
  it('returns null for a null report', () => {
    expect(parseReport(null)).toBeNull();
    expect(parseReport(undefined)).toBeNull();
  });

  it('narrows a well-formed loose report into typed rows', () => {
    const parsed = parseReport({
      portfolio: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'P',
        mode: 'balanced',
        apply_mode: 'recommend',
        status: 'active',
      },
      latest_run: {
        id: '22222222-2222-4222-8222-222222222222',
        cycle_ts: '2026-07-05T00:00:00Z',
        mode: 'balanced',
        confidence: { band: 'high', score: 0.86 },
      },
      latest_items: [
        {
          adset_id: 'a1',
          current_budget: 100,
          final_budget: 120,
          change_abs: 20,
          change_pct: 0.2,
          diagnostics: { ci: { cpa: 29, lo: 26, hi: 33, events: 410 } },
        },
      ],
      recommendations: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          adset_id: 'a2',
          kind: 'pause',
          trigger: 'P2_sustained_poor',
          severity: 'high',
          reason: 'CPA high',
          status: 'pending',
        },
      ],
      history: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.latest_items[0]?.diagnostics?.ci?.cpa).toBe(29);
    expect(parsed?.recommendations[0]?.kind).toBe('pause');
    expect(parsed?.latest_run?.confidence?.band).toBe('high');
  });

  it('falls back to an empty-but-valid shape when a row is malformed', () => {
    // recommendations[0] is missing the required `id` — the whole safeParse fails,
    // and the fallback keeps the surface renderable rather than throwing.
    const parsed = parseReport({
      portfolio: null,
      latest_run: null,
      latest_items: [],
      recommendations: [{ adset_id: 'x' } as never],
      history: [],
    });
    expect(parsed).toEqual({
      portfolio: null,
      latest_run: null,
      latest_items: [],
      recommendations: [],
      history: [],
    });
  });
});

describe('confidenceBand', () => {
  it('maps known bands to variants', () => {
    expect(confidenceBand('high')).toEqual({ variant: 'success', label: 'High' });
    expect(confidenceBand('LOW')).toEqual({ variant: 'destructive', label: 'Low' });
    expect(confidenceBand('medium')).toEqual({ variant: 'secondary', label: 'Medium' });
  });

  it('defaults unknown/empty bands to medium', () => {
    expect(confidenceBand(null).label).toBe('Medium');
    expect(confidenceBand(undefined).variant).toBe('secondary');
  });
});

describe('recommendationLabel', () => {
  it('maps known kinds', () => {
    expect(recommendationLabel('pause').label).toBe('Pause');
    expect(recommendationLabel('creative_refresh').label).toBe('Refresh creative');
    expect(recommendationLabel('audience_expand').label).toBe('Expand audience');
  });

  it('humanizes unknown kinds', () => {
    expect(recommendationLabel('some_new_kind').label).toBe('some new kind');
  });
});
