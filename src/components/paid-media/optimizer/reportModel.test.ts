import { describe, expect, it } from 'bun:test';

import {
  applyModePill,
  confidenceBand,
  freezeLabel,
  partitionHeldItems,
  parseReport,
  recommendationActionCopy,
  recommendationLabel,
} from './reportModel';

describe('pause is advisory, never an implied execution', () => {
  it('labels a pause recommendation as manual-review, not "Pause"', () => {
    // The optimizer never pauses an ad set on Meta, so the label must not imply it does.
    expect(recommendationLabel('pause').label).toBe('Review · pause manually');
  });

  it('gives a pause row an "Acknowledge" action + advisory copy (not "Approve")', () => {
    const copy = recommendationActionCopy('pause');
    expect(copy.approveLabel).toBe('Acknowledge');
    expect(copy.advisory).toContain('never pauses');
  });

  it('keeps "Approve" (no advisory) for fatigue kinds that DO open a renewal task', () => {
    for (const kind of ['creative_refresh', 'audience_expand']) {
      const copy = recommendationActionCopy(kind);
      expect(copy.approveLabel).toBe('Approve');
      expect(copy.advisory).toBeNull();
    }
  });
});

describe('freezeLabel', () => {
  it('returns null when the item was not held (budget actually moved)', () => {
    expect(freezeLabel(null)).toBeNull();
    expect(freezeLabel(undefined)).toBeNull();
  });
  it('labels each freeze reason as a distinct Held state', () => {
    expect(freezeLabel('no_conversions')?.label).toBe('Held · no conversion signal');
    expect(freezeLabel('missing_window')?.label).toBe('Held · incomplete data');
    expect(freezeLabel('unsupported_budget')?.label).toBe('Held · CBO/lifetime');
  });
  it('falls back to a generic Held for an unknown loose reason', () => {
    expect(freezeLabel('some_future_reason')?.label).toBe('Held');
  });
});

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
    expect(recommendationLabel('pause').label).toBe('Review · pause manually');
    expect(recommendationLabel('creative_refresh').label).toBe('Refresh creative');
    expect(recommendationLabel('audience_expand').label).toBe('Expand audience');
  });

  it('humanizes unknown kinds', () => {
    expect(recommendationLabel('some_new_kind').label).toBe('some new kind');
  });
});

describe('applyModePill', () => {
  it('maps the three autonomy tiers to short labeled identifiers', () => {
    expect(applyModePill('observe')).toEqual({
      label: 'Observe',
      variant: 'muted',
      indicator: 'info',
    });
    expect(applyModePill('recommend')?.label).toBe('Recommend');
    expect(applyModePill('recommend')?.variant).toBe('violet');
    expect(applyModePill('autopilot')?.label).toBe('Autopilot');
    expect(applyModePill('autopilot')?.variant).toBe('success');
    expect(applyModePill('yolo')).toBeNull();
  });
});

describe('partitionHeldItems', () => {
  const items = [
    { adset_id: 'a', apply_status: 'held' as const },
    { adset_id: 'b', apply_status: 'approved_pending' as const },
    { adset_id: 'c', apply_status: 'applied' as const },
    { adset_id: 'd', apply_status: 'failed' as const },
    { adset_id: 'e', apply_status: null },
    { adset_id: 'f' },
  ];

  it('surfaces only the two states that need a human', () => {
    const { held, approved } = partitionHeldItems(items);
    expect(held.map((i) => i.adset_id)).toEqual(['a']);
    expect(approved.map((i) => i.adset_id)).toEqual(['b']);
  });

  it('never treats an applied, failed, skipped or unset item as awaiting approval', () => {
    // A guardrail hold is the ONLY thing that strands a scored change; everything else has
    // already resolved. Mis-classifying here would offer to re-apply a written budget.
    const { held, approved } = partitionHeldItems(
      items.filter((i) => i.apply_status !== 'held' && i.apply_status !== 'approved_pending'),
    );
    expect(held).toHaveLength(0);
    expect(approved).toHaveLength(0);
  });
});
