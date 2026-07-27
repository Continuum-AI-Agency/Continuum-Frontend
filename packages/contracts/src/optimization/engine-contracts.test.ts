// The freeze-reason union is the one string that crosses every boundary in the optimizer:
// the engine writes it, the service persists it into optimizer.cycle_items.diagnostics, and
// the Frontend's freezeLabel map turns it into the sentence an operator reads when their
// budget did not move. A reason that parses on one side and not the other renders as a bare
// "Held" with no explanation, so the union is fenced here.

import { describe, expect, test } from 'bun:test';
import {
  AdSetSnapshotSchema,
  AdSetStatusSchema,
  ConfidenceSchema,
  CreativeStandingSchema,
  EngineConfigSchema,
  FreezeReasonSchema,
  ProposedActionSchema,
  WindowMetricsSchema,
} from './engine-contracts';

describe('FreezeReasonSchema', () => {
  test('carries every reason the engine can emit', () => {
    expect([...FreezeReasonSchema.options].sort()).toEqual([
      'kpi_mismatch',
      'lifetime_budget',
      'no_conversions',
      'no_declared_objective',
      'no_own_budget',
      'unsupported_budget',
    ]);
  });

  test('rejects a reason nobody defined — the union is closed on purpose', () => {
    expect(FreezeReasonSchema.safeParse('vibes').success).toBe(false);
  });

  test('no_own_budget and no_declared_objective are DISTINCT reasons, not aliases', () => {
    // They answer different operator questions: "give this ad set a budget" versus "tell Meta
    // what this ad set is buying". Collapsing them would lose the actionable half.
    expect(FreezeReasonSchema.parse('no_own_budget')).not.toBe(
      FreezeReasonSchema.parse('no_declared_objective'),
    );
  });
});

describe('AdSetSnapshotSchema round-trips the new reasons', () => {
  const base = {
    id: 'as1',
    status: 'frozen' as const,
    currentBudget: 0,
    ageDays: 12,
    windows: {
      d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      d7: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      d14: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
    },
  };

  test('a zero-budget boosted post parses with no_own_budget', () => {
    const parsed = AdSetSnapshotSchema.parse({
      ...base,
      name: 'Instagram Post',
      freeze: true,
      freezeReason: 'no_own_budget',
    });
    expect(parsed.freezeReason).toBe('no_own_budget');
    expect(parsed.currentBudget).toBe(0);
  });

  test('an ad set declaring nothing parses with no_declared_objective', () => {
    const parsed = AdSetSnapshotSchema.parse({
      ...base,
      currentBudget: 40,
      freeze: true,
      freezeReason: 'no_declared_objective',
    });
    expect(parsed.freezeReason).toBe('no_declared_objective');
    // The defining absence: it carries neither declaration.
    expect(parsed.optimization_goal).toBeUndefined();
    expect(parsed.kpiField).toBeUndefined();
  });
});

// ProposedActionSchema is what the engine emits and the applier consumes: a budget_change
// arm carries the current→proposed money delta the applier writes to Meta. A malformed type
// here means either a write the applier does not understand, or a budget move whose delta
// fields the FE cannot render — so the action union and its money fields are fenced.
describe('ProposedActionSchema', () => {
  const budgetChange = {
    adSetId: 'as1',
    type: 'budget_change' as const,
    currentBudget: 100,
    proposedBudget: 130,
    changeAbs: 30,
    changePct: 0.3,
    reason: 'strong 3d/7d efficiency',
  };

  test('a budget_change round-trips its current→proposed delta and defaults the flags off', () => {
    const parsed = ProposedActionSchema.parse(budgetChange);
    expect(parsed.type).toBe('budget_change');
    expect(parsed.currentBudget).toBe(100);
    expect(parsed.proposedBudget).toBe(130);
    expect(parsed.changeAbs).toBe(30);
    expect(parsed.changePct).toBe(0.3);
    // capBreached / floorRelaxed default to false when the engine omits them.
    expect(parsed.capBreached).toBe(false);
    expect(parsed.floorRelaxed).toBe(false);
  });

  test('carries the capBreached / floorRelaxed flags when set', () => {
    const parsed = ProposedActionSchema.parse({
      ...budgetChange,
      capBreached: true,
      floorRelaxed: true,
    });
    expect(parsed.capBreached).toBe(true);
    expect(parsed.floorRelaxed).toBe(true);
  });

  test.each([
    'pause',
    'reactivate',
    'flag_creative',
  ] as const)('round-trips a %s action', (type) => {
    const parsed = ProposedActionSchema.parse({ ...budgetChange, type });
    expect(parsed.type).toBe(type);
  });

  test('rejects an unknown action type — the union is closed', () => {
    expect(ProposedActionSchema.safeParse({ ...budgetChange, type: 'delete_adset' }).success).toBe(
      false,
    );
  });

  test('rejects a negative currentBudget (nonnegative money field)', () => {
    expect(ProposedActionSchema.safeParse({ ...budgetChange, currentBudget: -1 }).success).toBe(
      false,
    );
  });

  test('rejects a missing changeAbs — the money delta is required', () => {
    const { changeAbs: _changeAbs, ...withoutDelta } = budgetChange;
    expect(ProposedActionSchema.safeParse(withoutDelta).success).toBe(false);
  });
});

describe('AdSetStatusSchema', () => {
  test('carries every lifecycle status the engine can label', () => {
    expect([...AdSetStatusSchema.options].sort()).toEqual([
      'active',
      'flagged',
      'frozen',
      'grace',
      'learning',
      'starved',
    ]);
  });
  test('rejects an undefined status', () => {
    expect(AdSetStatusSchema.safeParse('paused').success).toBe(false);
  });
});

describe('ConfidenceSchema', () => {
  const confidence = {
    score: 0.72,
    predictiveness: 0.9,
    sampleSize: 0.6,
    consistency: 0.8,
    events: 41,
    band: 'high' as const,
  };

  test('parses a full confidence with a bounded 0..1 score and a band', () => {
    const parsed = ConfidenceSchema.parse(confidence);
    expect(parsed.score).toBe(0.72);
    expect(parsed.band).toBe('high');
  });
  test('rejects a score above 1 (bounded signal)', () => {
    expect(ConfidenceSchema.safeParse({ ...confidence, score: 1.4 }).success).toBe(false);
  });
  test('rejects an unknown band', () => {
    expect(ConfidenceSchema.safeParse({ ...confidence, band: 'insane' }).success).toBe(false);
  });
  test('rejects a negative event count', () => {
    expect(ConfidenceSchema.safeParse({ ...confidence, events: -3 }).success).toBe(false);
  });
});

describe('CreativeStandingSchema', () => {
  const winner = {
    adId: 'ad1',
    spend: 500,
    events: 20,
    costPerEvent: 25,
  };

  test('parses a standing with a winner and defaults the array fields', () => {
    const parsed = CreativeStandingSchema.parse({
      winner,
      eligibleAds: 3,
      totalAds: 5,
      killSpendShare: 0.1,
      belowAvgSpendShare: 0.2,
      medianCostPerEvent: 30,
    });
    expect(parsed.winner?.adId).toBe('ad1');
    expect(parsed.laggards).toEqual([]);
    expect(parsed.flags).toEqual([]);
  });

  test('a null winner means no winner is KNOWABLE (not that none exists)', () => {
    const parsed = CreativeStandingSchema.parse({
      winner: null,
      eligibleAds: 0,
      totalAds: 1,
      killSpendShare: null,
      belowAvgSpendShare: null,
      medianCostPerEvent: null,
      flags: ['single_creative'],
    });
    expect(parsed.winner).toBeNull();
    expect(parsed.flags).toContain('single_creative');
  });

  test('rejects an unknown standing flag', () => {
    expect(
      CreativeStandingSchema.safeParse({
        winner: null,
        eligibleAds: 0,
        totalAds: 0,
        killSpendShare: null,
        belowAvgSpendShare: null,
        medianCostPerEvent: null,
        flags: ['made_up_flag'],
      }).success,
    ).toBe(false);
  });
});

describe('WindowMetricsSchema', () => {
  test('parses the required core counts and omits optional KPI events', () => {
    const parsed = WindowMetricsSchema.parse({
      spend: 123.45,
      purchases: 4,
      addToCarts: 9,
      clicks: 50,
      impressions: 2000,
    });
    expect(parsed.spend).toBe(123.45);
    expect(parsed.conversations).toBeUndefined();
  });
  test('carries optional per-objective KPI events when present', () => {
    const parsed = WindowMetricsSchema.parse({
      spend: 100,
      purchases: 0,
      addToCarts: 0,
      clicks: 10,
      impressions: 500,
      conversations: 949,
      leads: 3,
    });
    expect(parsed.conversations).toBe(949);
    expect(parsed.leads).toBe(3);
  });
  test('rejects a non-integer purchase count', () => {
    expect(
      WindowMetricsSchema.safeParse({
        spend: 0,
        purchases: 1.5,
        addToCarts: 0,
        clicks: 0,
        impressions: 0,
      }).success,
    ).toBe(false);
  });
  test('rejects a negative spend', () => {
    expect(
      WindowMetricsSchema.safeParse({
        spend: -1,
        purchases: 0,
        addToCarts: 0,
        clicks: 0,
        impressions: 0,
      }).success,
    ).toBe(false);
  });
});

// EngineConfigSchema's refine is the guardrail against a mis-tuned config silently
// double-weighting a window: each trajectory weight set (neutral/positive/negative) must sum
// to 1.0, or the composite score is on a different scale than the engine assumes.
describe('EngineConfigSchema', () => {
  const config = {
    reallocCycleDays: 3,
    velocityCapPct: 0.5,
    learningReductionCapPct: 0.5,
    weightsNeutral: { d3: 0.2, d7: 0.3, d14: 0.5 },
    weightsPositive: { d3: 0.5, d7: 0.3, d14: 0.2 },
    weightsNegative: { d3: 0.1, d7: 0.3, d14: 0.6 },
    trajectoryPosThreshold: 0.1,
    trajectoryNegThreshold: 0.1,
    floorPortfolioPct: 0.1,
    floorMinSignals: 0,
    floorWindowDays: 7,
    cpaTarget: 40,
    upperFunnelOverrideMult: 2,
    upperFunnelOverrideWindow: 7,
    sustainedPoorWindow: 7,
    sustainedPoorMultiplier: 3,
    newItemProtectDays: 0,
    learningConvThreshold: 0,
    learningMinDays: 0,
    minPurchasesSignif: 0,
    toggles: {
      significanceGate: true,
      minEventsPerWindow: 0,
      nonOverlappingMomentum: true,
      saturationGamma: 1,
    },
    overflowMode: 'breach_best' as const,
  };

  test('parses a config whose every trajectory weight set sums to 1.0', () => {
    const parsed = EngineConfigSchema.parse(config);
    expect(parsed.weightsNeutral.d3 + parsed.weightsNeutral.d7 + parsed.weightsNeutral.d14).toBe(1);
    expect(parsed.overflowMode).toBe('breach_best');
  });

  test('rejects a config whose weights do not sum to 1.0 (the refine)', () => {
    const result = EngineConfigSchema.safeParse({
      ...config,
      weightsNeutral: { d3: 0.2, d7: 0.3, d14: 0.9 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Each trajectory weight set must sum to 1.0');
    }
  });

  test('rejects an unknown overflowMode', () => {
    expect(EngineConfigSchema.safeParse({ ...config, overflowMode: 'yolo' }).success).toBe(false);
  });
});
