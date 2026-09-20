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
  it('describes all 25 detectors, each with a class, a cadence and an honest data verdict', () => {
    const detectors = accountDetectorSchema.options;
    expect(detectors).toHaveLength(25);
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
    expect(daily.length + weekly.length + monthly.length).toBe(25);
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
