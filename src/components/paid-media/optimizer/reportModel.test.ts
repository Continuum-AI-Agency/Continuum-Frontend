import { describe, expect, it } from 'bun:test';
import { FreezeReasonSchema } from '@continuum/contracts';

import {
  actionRoute,
  applyModePill,
  budgetMoveWhy,
  confidenceBand,
  creativeBriefForRec,
  explainConfidence,
  freezeLabel,
  hasPendingWork,
  isExecutable,
  notImplementedMessage,
  parseReport,
  partitionHeldItems,
  pendingWorkCount,
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

  it('routes the creative-request kinds to the creative path', () => {
    expect(actionRoute('variate_creative')).toBe('creative');
    expect(actionRoute('seed_experiment')).toBe('creative');
  });

  it('still hides pause_ad — found, but no single-ad pause drain yet', () => {
    expect(actionRoute('pause_ad')).toBe('hidden');
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

describe('creative-level recommendations', () => {
  it('labels each creative kind as being about ONE AD, not the ad set', () => {
    expect(recommendationLabel('pause_ad').label).toBe('Pause this ad');
    expect(recommendationLabel('variate_creative').label).toBe('Make variations of the winner');
    expect(recommendationLabel('seed_experiment').label).toContain('add variants');
  });

  it('makes the creative-request kinds executable — approving opens a request', () => {
    // variate_creative / seed_experiment now graduate: approving one opens a creative
    // request (a tracked task, or a generation job when autogen is on).
    expect(isExecutable('variate_creative')).toBe(true);
    expect(isExecutable('seed_experiment')).toBe(true);
    expect(actionRoute('variate_creative')).toBe('creative');
    expect(actionRoute('seed_experiment')).toBe('creative');
  });

  it('keeps pause_ad NOT executable — there is no single-ad pause drain yet', () => {
    // Pausing ONE ad (not the whole ad set) has no drain, so approving it would do nothing
    // and leave a burning ad running while the queue looked handled.
    expect(isExecutable('pause_ad')).toBe(false);
    expect(actionRoute('pause_ad')).toBe('hidden');
  });

  it('keeps the kinds that DO work executable — this guard must not over-reach', () => {
    expect(isExecutable('creative_refresh')).toBe(true);
    expect(isExecutable('audience_expand')).toBe(true);
    expect(isExecutable('pause')).toBe(true); // the ad-set pause is a real, audited Meta write
  });

  it('pause_ad still says out loud that it cannot act, instead of implying it did', () => {
    const { advisory } = recommendationActionCopy('pause_ad');
    expect(advisory).toContain('Not built yet');
    expect(advisory).not.toMatch(/wired up/i);
    expect(notImplementedMessage('pause_ad')).toMatch(/not built yet/i);
    expect(notImplementedMessage('pause_ad')).toContain('pause it in Meta');
    expect(advisory).toContain('Pause it in Meta');
  });

  it('the creative-request kinds describe what approving does — a request, not a dead end', () => {
    for (const kind of ['variate_creative', 'seed_experiment']) {
      const { approveLabel, advisory } = recommendationActionCopy(kind);
      expect(approveLabel).toBe('Request creative');
      expect(advisory).toContain('creative request');
      expect(advisory).not.toMatch(/not built yet/i);
    }
  });

  it('renders a brief from the recommendation seed, and falls back to null without one', () => {
    const seed = {
      adSetId: '2385',
      winnerAdId: 'ad_9',
      labels: { hookArchetype: 'social_proof' },
      rebuildCraft: true,
      groundedOn: ['hook_archetype=social_proof @ tof'],
    };
    const brief = creativeBriefForRec({ kind: 'variate_creative', reason: 'winner wins', seed });
    expect(brief).not.toBeNull();
    expect(brief?.title.length).toBeGreaterThan(0);
    expect(brief?.groundedOn).toEqual(seed.groundedOn);
    // An older rec with no seed has no brief to render — the caller shows the plain reason.
    expect(creativeBriefForRec({ kind: 'variate_creative', reason: 'x', seed: null })).toBeNull();
    expect(creativeBriefForRec({ kind: 'variate_creative', reason: 'x', seed: {} })).toBeNull();
  });
});

describe('explainConfidence names the term that is holding the score back', () => {
  it('sorts weakest first and reports it as the limiter', () => {
    // score is a PRODUCT, so the smallest factor is the honest answer to "why not higher".
    const explanation = explainConfidence({
      score: 0.26,
      predictiveness: 0.75,
      sampleSize: 0.38,
      consistency: 0.91,
      events: 12,
      band: 'low',
    });
    expect(explanation?.limiter?.key).toBe('sampleSize');
    expect(explanation?.terms.map((t) => t.key)).toEqual([
      'sampleSize',
      'predictiveness',
      'consistency',
    ]);
    expect(explanation?.scorePct).toBe(26);
  });

  it('quotes the real event count in the sample note', () => {
    const explanation = explainConfidence({ sampleSize: 0.38, events: 12 });
    expect(explanation?.terms[0].note).toBe('12 conversions in the last 14 days');
  });

  it('singularizes a lone conversion', () => {
    const explanation = explainConfidence({ sampleSize: 0.05, events: 1 });
    expect(explanation?.terms[0].note).toBe('1 conversion in the last 14 days');
  });

  it('never presents predictiveness as measured — it is a per-objective prior', () => {
    const explanation = explainConfidence({ predictiveness: 0.75 });
    const predictive = explanation?.terms.find((t) => t.key === 'predictiveness');
    expect(predictive?.note).toContain('prior');
    expect(predictive?.note).toContain('not measured on your account');
  });

  it('flips the consistency note when the windows disagree', () => {
    expect(explainConfidence({ consistency: 0.91 })?.terms[0].note).toContain('agree');
    expect(explainConfidence({ consistency: 0.2 })?.terms[0].note).toContain('disagree');
  });

  it('returns null when the row carries no confidence signal at all', () => {
    expect(explainConfidence(null)).toBeNull();
    expect(explainConfidence(undefined)).toBeNull();
    expect(explainConfidence({})).toBeNull();
    expect(explainConfidence({ band: 'medium' })).toBeNull();
  });
});

describe('budgetMoveWhy explains one move from what cycle_items already stores', () => {
  it('reads a cut as a smaller share of the pool', () => {
    const why = budgetMoveWhy({
      adset_id: 'a',
      current_budget: 50,
      final_budget: 35,
      change_abs: -15,
      change_pct: -0.3,
      diagnostics: { score3d: 0.41, score7d: 0.38, score14d: 0.44 },
    });
    expect(why?.lead).toContain('smaller share');
    expect(why?.windows).toEqual({ d3: 0.41, d7: 0.38, d14: 0.44 });
    expect(why?.windowsAgree).toBe(true);
  });

  it('reads a raise as a larger share of the pool', () => {
    const why = budgetMoveWhy({
      adset_id: 'b',
      current_budget: 50,
      final_budget: 65,
      change_abs: 15,
      change_pct: 0.3,
      diagnostics: null,
    });
    expect(why?.lead).toContain('larger share');
    expect(why?.windows).toBeNull();
    expect(why?.windowsAgree).toBeNull();
  });

  it('flags disagreeing windows', () => {
    const why = budgetMoveWhy({
      adset_id: 'c',
      current_budget: 50,
      final_budget: 65,
      change_abs: 15,
      change_pct: 0.3,
      diagnostics: { score3d: 0.1, score7d: 0.9 },
    });
    expect(why?.windowsAgree).toBe(false);
  });

  it('carries the cost interval and its event count', () => {
    const why = budgetMoveWhy({
      adset_id: 'd',
      current_budget: 50,
      final_budget: 35,
      change_abs: -15,
      change_pct: -0.3,
      diagnostics: { ci: { cpa: 61, lo: 44, hi: 92, events: 14 } },
    });
    expect(why?.cost).toEqual({ cpa: 61, lo: 44, hi: 92, events: 14 });
  });

  it('says nothing about a HELD row — freezeLabel already owns that explanation', () => {
    expect(
      budgetMoveWhy({
        adset_id: 'e',
        current_budget: 50,
        final_budget: 50,
        change_abs: 0,
        change_pct: 0,
        diagnostics: { freezeReason: 'no_conversions' },
      }),
    ).toBeNull();
  });

  it('says nothing about a row that did not move', () => {
    expect(
      budgetMoveWhy({
        adset_id: 'f',
        current_budget: 50,
        final_budget: 50,
        change_abs: 0,
        change_pct: 0,
      }),
    ).toBeNull();
  });

  it('reports the velocity cap when the guardrail truncated the move', () => {
    const why = budgetMoveWhy({
      adset_id: 'g',
      current_budget: 50,
      final_budget: 65,
      change_abs: 15,
      change_pct: 0.3,
      diagnostics: { velocityCapped: true },
    });
    expect(why?.capped).toBe(true);
  });
});

describe('pending work counts BUDGET MOVES, not just recommendations', () => {
  const portfolio = (recs: number, moves?: number) => ({
    pending_recommendations: recs,
    ...(moves === undefined ? {} : { pending_budget_moves: moves }),
  });

  it('counts a money-only cycle as work', () => {
    // The regression this exists for: a cycle that wants to move budget but fired no
    // trigger has zero recommendations, and the Actions tab filtered it out entirely.
    expect(hasPendingWork(portfolio(0, 2))).toBe(true);
    expect(pendingWorkCount(portfolio(0, 2))).toBe(2);
  });

  it('sums both kinds so the tab badge matches what the tab renders', () => {
    expect(pendingWorkCount(portfolio(2, 8))).toBe(10);
  });

  it('still counts a recommendation-only cycle', () => {
    expect(hasPendingWork(portfolio(1, 0))).toBe(true);
  });

  it('is false only when BOTH are zero', () => {
    expect(hasPendingWork(portfolio(0, 0))).toBe(false);
    expect(pendingWorkCount(portfolio(0, 0))).toBe(0);
  });

  it('treats a payload predating the RPC change as zero moves, never NaN', () => {
    expect(pendingWorkCount(portfolio(3))).toBe(3);
    expect(hasPendingWork(portfolio(0))).toBe(false);
  });
});
