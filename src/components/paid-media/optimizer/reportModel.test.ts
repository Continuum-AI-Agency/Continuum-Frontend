import { describe, expect, it } from 'bun:test';
import { FreezeReasonSchema } from '@continuum/contracts';

import {
  actionRoute,
  applyModePill,
  confidenceBand,
  freezeLabel,
  isExecutable,
  notImplementedMessage,
  parseReport,
  partitionHeldItems,
  recommendationActionCopy,
  recommendationLabel,
} from './reportModel';

describe('pause is an executable ad-set write, not an advisory', () => {
  it('labels a pause recommendation as the write it authorizes', () => {
    // The app pauses the ad set on Meta through the audited drain, so the label names it.
    expect(recommendationLabel('pause').label).toBe('Pause ad set');
  });

  it('gives a pause row a "Pause ad set" action with no advisory', () => {
    const copy = recommendationActionCopy('pause');
    expect(copy.approveLabel).toBe('Pause ad set');
    expect(copy.advisory).toBeNull();
  });

  it('keeps "Approve" (no advisory) for fatigue kinds that DO open a renewal task', () => {
    for (const kind of ['creative_refresh', 'audience_expand']) {
      const copy = recommendationActionCopy(kind);
      expect(copy.approveLabel).toBe('Approve');
      expect(copy.advisory).toBeNull();
    }
  });
});

describe('actionRoute — which drain a rec kind executes through', () => {
  it('routes a pause to the audited ad-set status drain', () => {
    expect(actionRoute('pause')).toBe('pause');
  });

  it('routes fatigue kinds (and unknown kinds) to the renewal-task path', () => {
    expect(actionRoute('creative_refresh')).toBe('fatigue');
    expect(actionRoute('audience_expand')).toBe('fatigue');
    expect(actionRoute('some_future_kind')).toBe('fatigue');
  });

  it('hides the three ad-level kinds — found, but no drain surfaced yet', () => {
    for (const kind of ['pause_ad', 'variate_creative', 'seed_experiment']) {
      expect(actionRoute(kind)).toBe('hidden');
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
    expect(freezeLabel('no_own_budget')?.label).toBe('Held · no budget of its own');
    expect(freezeLabel('no_declared_objective')?.label).toBe('Held · no declared goal');
  });
  it('distinguishes no_own_budget from the campaign-level unsupported_budget', () => {
    // Both are zero-budget ad sets, and the operator's next action differs: one needs an
    // ad-set budget created, the other has a budget already — on the campaign.
    expect(freezeLabel('no_own_budget')?.hint).not.toBe(freezeLabel('unsupported_budget')?.hint);
    expect(freezeLabel('no_own_budget')?.hint).toContain('boosted');
  });
  it('falls back to a generic Held for an unknown loose reason', () => {
    expect(freezeLabel('some_future_reason')?.label).toBe('Held');
  });
  it('has a real label for EVERY reason in the contracts union — none degrade to bare "Held"', () => {
    // The drift fence. A reason added to the contracts enum without a case here renders as an
    // unexplained "Held", which tells an operator nothing about why their budget did not move.
    for (const reason of FreezeReasonSchema.options) {
      const rendered = freezeLabel(reason);
      expect(rendered).not.toBeNull();
      expect(rendered?.label).not.toBe('Held');
      expect(rendered?.hint.length).toBeGreaterThan(0);
    }
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
    expect(recommendationLabel('pause').label).toBe('Pause ad set');
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

describe('creative-level recommendations — shown, but honestly not actionable yet', () => {
  it('labels each creative kind as being about ONE AD, not the ad set', () => {
    expect(recommendationLabel('pause_ad').label).toBe('Pause this ad');
    expect(recommendationLabel('variate_creative').label).toBe('Make variations of the winner');
    expect(recommendationLabel('seed_experiment').label).toContain('add variants');
  });

  it('marks the creative kinds NOT executable — nothing drains them yet', () => {
    // The engine emits them and the DB stores them, but no drain and no autopilot path exist.
    // Approving one would set a status, do nothing, and leave a burning ad running while the
    // queue looked handled.
    expect(isExecutable('pause_ad')).toBe(false);
    expect(isExecutable('variate_creative')).toBe(false);
    expect(isExecutable('seed_experiment')).toBe(false);
  });

  it('keeps the kinds that DO work executable — this guard must not over-reach', () => {
    expect(isExecutable('creative_refresh')).toBe(true);
    expect(isExecutable('audience_expand')).toBe(true);
    expect(isExecutable('pause')).toBe(true); // the ad-set pause is a real, audited Meta write
  });

  it('says out loud that it cannot act, instead of implying it did', () => {
    for (const kind of ['pause_ad', 'variate_creative', 'seed_experiment']) {
      const { advisory } = recommendationActionCopy(kind);
      // ONE phrasing for this state. The row advisory and the click-time toast are
      // read seconds apart by the same person; "not wired up" in one and "not built
      // yet" in the other read as two different problems. "Wired up" also described
      // our backlog in words that sound like a setting the user failed to switch on.
      expect(advisory).toContain('Not built yet');
      expect(advisory).not.toMatch(/wired up/i);
      expect(notImplementedMessage(kind)).toMatch(/not built yet/i);
      expect(notImplementedMessage(kind)).not.toMatch(/wired up/i);
    }
    // And it still tells the operator what they CAN do about it right now.
    expect(notImplementedMessage('pause_ad')).toContain('pause it in Meta');
    expect(notImplementedMessage('variate_creative')).toContain('AI Studio');
    expect(recommendationActionCopy('pause_ad').advisory).toContain('Pause it in Meta');
  });
});
