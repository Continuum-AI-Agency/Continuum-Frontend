import { describe, expect, it } from 'bun:test';
import {
  ACCOUNT_DETECTOR_META,
  type AccountCandidate,
  accountCandidateSchema,
  accountDetectorSchema,
  accountGuards,
  detectorsForCadence,
  IMPACT_CLASS_WEIGHT,
  isGuardDetector,
  rankAccountCandidates,
  rankedValue,
  reallocationSaving,
} from './account-strategy';

const candidate = (over: Partial<AccountCandidate>): AccountCandidate =>
  accountCandidateSchema.parse({
    id: over.detector ? `${over.detector}:x` : 'dead_tail:x',
    detector: 'dead_tail',
    impact_per_day: 100,
    impact_class: 'recoverable',
    impact_basis: 'spend/day on an ad set with 0 conversions in 7d',
    ...over,
  });

describe('the account detector catalogue', () => {
  it('describes all 26 detectors, each with a class, a cadence and an honest data verdict', () => {
    const detectors = accountDetectorSchema.options;
    expect(detectors).toHaveLength(26);
    for (const detector of detectors) {
      const meta = ACCOUNT_DETECTOR_META[detector];
      expect(meta).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.compares.length).toBeGreaterThan(0);
      // A detector that cannot run today must NAME what it lacks — an unexplained gap is
      // how a screen quietly shows nothing and nobody asks why.
      if (!meta.computable) expect(meta.missing?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('splits the cadences so a weekly question is not asked daily', () => {
    const daily = detectorsForCadence('daily');
    const weekly = detectorsForCadence('weekly');
    const monthly = detectorsForCadence('monthly');
    expect(daily.length + weekly.length + monthly.length).toBe(26);
    expect(daily).toContain('delivery_collapse');
    expect(daily).toContain('dead_tail');
    expect(weekly).toContain('angle_concentration');
    expect(monthly).toContain('target_economics');
  });
});

describe('ranking', () => {
  it('discounts deferred money and weights by confidence, without touching the figure shown', () => {
    const recoverable = candidate({ impact_per_day: 100, impact_class: 'recoverable' });
    const deferred = candidate({
      detector: 'testing_discipline',
      impact_per_day: 200,
      impact_class: 'deferred',
    });
    // 200 deferred (×0.4 = 80) ranks BELOW 100 recoverable, and both cards still say
    // what they really are worth per day.
    expect(rankedValue(recoverable)).toBe(100);
    expect(rankedValue(deferred)).toBeCloseTo(200 * IMPACT_CLASS_WEIGHT.deferred, 6);
    const ranked = rankAccountCandidates([deferred, recoverable]);
    expect(ranked.map((c) => c.detector)).toEqual(['dead_tail', 'testing_discipline']);
    expect(ranked[0]?.impact_per_day).toBe(100);
  });

  it('halves a candidate whose sample only half supports it', () => {
    const sure = candidate({ impact_per_day: 100, confidence: 1 });
    const unsure = candidate({
      detector: 'scale_readiness',
      impact_per_day: 180,
      impact_class: 'better_price',
      confidence: 0.5,
    });
    expect(rankAccountCandidates([unsure, sure]).map((c) => c.detector)).toEqual([
      'dead_tail',
      'scale_readiness',
    ]);
  });

  it('keeps the two guards out of the ranking and hands them back separately', () => {
    const guard = candidate({
      detector: 'measurement_integrity',
      impact_per_day: 9_000,
      impact_class: 'recoverable',
    });
    const ordinary = candidate({ impact_per_day: 10 });
    // A guard with a huge figure must not win the list: it invalidates the list.
    expect(rankAccountCandidates([guard, ordinary]).map((c) => c.detector)).toEqual(['dead_tail']);
    expect(accountGuards([ordinary, guard]).map((c) => c.detector)).toEqual([
      'measurement_integrity',
    ]);
    expect(isGuardDetector('target_economics')).toBe(true);
    expect(isGuardDetector('dead_tail')).toBe(false);
  });

  it('breaks a tie by catalogue order, so two runs on the same data agree', () => {
    const a = candidate({ detector: 'account_pacing', impact_per_day: 50 });
    const b = candidate({ detector: 'dead_tail', impact_per_day: 50 });
    expect(rankAccountCandidates([a, b]).map((c) => c.detector)).toEqual([
      'account_pacing',
      'dead_tail',
    ]);
  });
});

describe('reallocationSaving — the arithmetic four detectors share', () => {
  it('values the move as the part the cheaper side does not need', () => {
    // $400/day off a source at $80 buys 5 results; those 5 cost $300 at $60. Saving $100.
    expect(
      reallocationSaving({ moved: 400, sourceCostPerResult: 80, destinationCostPerResult: 60 }),
    ).toBe(100);
  });

  it('is worth nothing when the destination is not cheaper, or nothing can move', () => {
    expect(
      reallocationSaving({ moved: 400, sourceCostPerResult: 60, destinationCostPerResult: 60 }),
    ).toBe(0);
    expect(
      reallocationSaving({ moved: 400, sourceCostPerResult: 60, destinationCostPerResult: 90 }),
    ).toBe(0);
    expect(
      reallocationSaving({ moved: 0, sourceCostPerResult: 90, destinationCostPerResult: 60 }),
    ).toBe(0);
    // A cost per result of zero is missing data, not a free result.
    expect(
      reallocationSaving({ moved: 400, sourceCostPerResult: 0, destinationCostPerResult: 60 }),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The ladder, the deck, and the confidence prior.
// ---------------------------------------------------------------------------

import {
  BLOCKED_CATEGORY_COPY,
  blockedByCategory,
  blockedCategorySchema,
  DETECTOR_BLOCKED_ON,
  DETECTOR_MUTES,
  DETECTOR_RETERM,
  deckFor,
  RESULT_RUNG,
  RESULT_RUNG_READING,
  resultRungFor,
  resultRungSchema,
  seedConfidence,
  UNCALIBRATED_PRIOR_DISCOUNT,
  verdictFor,
} from './account-strategy';
import { OptimizationObjectiveSchema } from './engine-contracts';

const OBJECTIVES = OptimizationObjectiveSchema.options;
const DETECTORS = accountDetectorSchema.options;

describe('the result ladder', () => {
  it('places every objective, with no objective left unplaced', () => {
    for (const objective of OBJECTIVES) {
      expect(RESULT_RUNG[objective]).toBeDefined();
    }
    expect(Object.keys(RESULT_RUNG).sort()).toEqual([...OBJECTIVES].sort());
  });

  it('puts exactly one objective on the money rung — the reason target_economics starves', () => {
    const money = OBJECTIVES.filter((o) => RESULT_RUNG[o] === 'money');
    expect(money).toEqual(['purchase']);
  });

  it('gives every rung a line that says how to read a figure at it', () => {
    for (const rung of resultRungSchema.options) {
      expect(RESULT_RUNG_READING[rung].length).toBeGreaterThan(0);
    }
    // Only the money rung may invite a margin comparison. Saying it anywhere else is exactly
    // the misreading the ladder exists to stop.
    const mentionsMargin = resultRungSchema.options.filter((rung) =>
      RESULT_RUNG_READING[rung].includes('margin'),
    );
    expect(mentionsMargin).toEqual(['money']);
  });

  it('reads a custom conversion at its analog’s rung, never at the placeholder', () => {
    expect(RESULT_RUNG_READING[resultRungFor('custom', 'purchase')]).toBe(
      RESULT_RUNG_READING.money,
    );
  });
});

describe('deckFor', () => {
  // These numbers are the contract. A detector added later must not silently
  // appear on a rung where it means nothing, and a mute removed by accident
  // must fail here rather than on someone's screen.
  const EXPECTED: Record<string, number> = {
    purchase: 26,
    signup: 26,
    lead: 26,
    app_install: 25,
    conversations: 25,
    traffic: 24,
    link_clicks: 23,
    clicks: 23,
    thruplays: 23,
    post_engagement: 23,
    awareness: 21,
  };

  for (const [objective, size] of Object.entries(EXPECTED)) {
    it(`gives ${objective} a deck of ${size}`, () => {
      expect(deckFor(objective as (typeof OBJECTIVES)[number])).toHaveLength(size);
    });
  }

  it('never falls below the twenty-one that cannot be muted', () => {
    const floor = DETECTORS.filter((d) => !DETECTOR_MUTES[d] || isGuardDetector(d)).length;
    expect(floor).toBe(21);
    for (const objective of OBJECTIVES) {
      expect(deckFor(objective).length).toBeGreaterThanOrEqual(21);
    }
  });

  it('keeps post_click on traffic, where click → landing-page view IS the question', () => {
    expect(deckFor('traffic')).toContain('post_click');
    expect(deckFor('conversations')).not.toContain('post_click');
  });

  it('returns detectors in the catalogue order, so a run is reproducible', () => {
    const deck = deckFor('purchase');
    expect(deck).toEqual(DETECTORS.filter((d) => deck.includes(d)));
  });
});

describe('verdictFor', () => {
  it('never mutes a guard, whatever the objective', () => {
    for (const objective of OBJECTIVES) {
      for (const detector of DETECTORS) {
        if (!isGuardDetector(detector)) continue;
        expect(verdictFor(detector, objective).kind).not.toBe('mute');
      }
    }
  });

  it('re-terms without shrinking the deck', () => {
    for (const detector of Object.keys(DETECTOR_RETERM) as (typeof DETECTORS)[number][]) {
      expect(deckFor('purchase')).toContain(detector);
    }
  });

  it('names a reason on every mute — a gap nobody can name is a gap nobody closes', () => {
    for (const objective of OBJECTIVES) {
      for (const detector of DETECTORS) {
        const v = verdictFor(detector, objective);
        if (v.kind === 'mute') expect(v.because.length).toBeGreaterThan(0);
      }
    }
  });

  it('only names real detectors and real objectives in the override table', () => {
    for (const [detector, byObjective] of Object.entries(DETECTOR_MUTES)) {
      expect(DETECTORS).toContain(detector);
      for (const objective of Object.keys(byObjective ?? {})) {
        expect(OBJECTIVES).toContain(objective);
      }
    }
  });
});

describe('seedConfidence', () => {
  it('multiplies the detector’s own evidence by the objective’s prior', () => {
    expect(seedConfidence({ evidence: 1, predictiveness: 0.8, calibrated: true })).toBe(0.8);
    expect(seedConfidence({ evidence: 0.5, predictiveness: 0.8, calibrated: true })).toBe(0.4);
  });

  it('ranks the same raw impact lower on lead than on app_install', () => {
    const lead = seedConfidence({ evidence: 1, predictiveness: 0.45, calibrated: true });
    const app = seedConfidence({ evidence: 1, predictiveness: 0.88, calibrated: true });
    expect(lead).toBeLessThan(app);
    // close to half, which is the whole point: a leads account gets a shorter read
    expect(lead / app).toBeLessThan(0.6);
  });

  it('discounts a borrowed prior again, rather than trusting it', () => {
    const measured = seedConfidence({ evidence: 1, predictiveness: 0.45, calibrated: true });
    const borrowed = seedConfidence({ evidence: 1, predictiveness: 0.45, calibrated: false });
    expect(borrowed).toBeLessThan(measured);
    expect(borrowed).toBeCloseTo(measured * UNCALIBRATED_PRIOR_DISCOUNT, 5);
  });

  it('stays inside 0..1 however badly it is called', () => {
    expect(seedConfidence({ evidence: 5, predictiveness: 5, calibrated: true })).toBe(1);
    expect(seedConfidence({ evidence: -3, predictiveness: 0.8, calibrated: true })).toBe(0);
  });
});

describe('the candidate carries why its figure is small', () => {
  it('defaults capped_by to null and result_label to a neutral word', () => {
    const c = candidate({});
    expect(c.capped_by).toBeNull();
    expect(c.result_label).toBe('results');
  });

  it('admits only the two real reasons a figure gets bounded', () => {
    expect(candidate({ capped_by: 'velocity' }).capped_by).toBe('velocity');
    expect(candidate({ capped_by: 'guardrail' }).capped_by).toBe('guardrail');
    expect(() => candidate({ capped_by: 'vibes' as never })).toThrow();
  });
});

describe('what the blocked detectors are waiting for', () => {
  it('names a category for every detector the catalogue marks non-computable', () => {
    const blocked = DETECTORS.filter((d) => !ACCOUNT_DETECTOR_META[d].computable);
    for (const detector of blocked) {
      expect(DETECTOR_BLOCKED_ON[detector]).toBeDefined();
    }
    expect(blocked).toHaveLength(9);
  });

  it('lists nothing that already works — the two directions are pinned', () => {
    for (const detector of Object.keys(DETECTOR_BLOCKED_ON) as (typeof DETECTORS)[number][]) {
      expect(ACCOUNT_DETECTOR_META[detector].computable).toBe(false);
    }
  });

  it('turns nine symptoms into a handful of decisions', () => {
    const groups = blockedByCategory('purchase');
    expect(groups.length).toBeLessThan(9);
    expect(groups.flatMap((g) => g.detectors)).toHaveLength(9);
    // two detectors share one platform call; the reader should see that
    const platform = groups.find((g) => g.category === 'platform_call');
    expect(platform?.detectors).toEqual(['audience_overlap', 'account_saturation']);
  });

  it('only reports what is actually in this objective’s deck', () => {
    // awareness mutes new_vs_returning and post_click, so their blockers are not its problem
    const detectors = blockedByCategory('awareness').flatMap((g) => g.detectors);
    expect(detectors).not.toContain('new_vs_returning');
    expect(detectors).not.toContain('post_click');
  });

  it('groups an explicit list of detectors, which is what a screen actually holds', () => {
    // A read carries the detectors that starved, never the objective behind them. Handed that
    // list — in whatever order the worker emitted it — the grouping is the catalogue's, so the
    // screen cannot invent an order of its own.
    const groups = blockedByCategory([
      'account_saturation',
      'target_economics',
      'audience_overlap',
    ]);
    expect(groups).toEqual([
      { category: 'economics', detectors: ['target_economics'] },
      { category: 'platform_call', detectors: ['audience_overlap', 'account_saturation'] },
    ]);
  });

  it('ignores a detector that names no blocker rather than inventing a category for it', () => {
    expect(blockedByCategory(['dead_tail'])).toEqual([]);
  });

  it('every category carries copy a person can read', () => {
    for (const category of blockedCategorySchema.options) {
      expect(BLOCKED_CATEGORY_COPY[category].length).toBeGreaterThan(0);
    }
  });
});
