// Pause-trigger boundary tests (bun test). Each trigger is exercised just OVER its
// firing threshold and just UNDER it, and every firing recommendation is checked for the
// exact trigger id, severity, kind, approval flag, starve membership, and a GROUNDED reason
// (real numbers, never a 'null' / 'undefined' / 'NaN' placeholder standing in for one).
//
// Thresholds are read from DEFAULT_CONFIG, not restated here:
//   floor (P1 spend gate)  = (cpaTarget * floorMinSignals) / floorWindowDays = (50 * 2) / 14
//   upperFunnelOverrideMult = 4    (P1 arm b)
//   sustainedPoorMultiplier = 2.5  (P2)
//   cpaTarget               = 50   (P3 spend gate)
//   newItemProtectDays      = 7    (grace blocks P1/P2/P3)
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { DEFAULT_CONFIG, evaluateTriggers } from '../src/index';

const FLOOR =
  (DEFAULT_CONFIG.cpaTarget * DEFAULT_CONFIG.floorMinSignals) / DEFAULT_CONFIG.floorWindowDays; // 100/14

const w = (spend: number, purchases: number, addToCarts = 0): WindowMetrics => ({
  spend,
  purchases,
  addToCarts,
  clicks: 0,
  impressions: 0,
});

const flat = (m: WindowMetrics): AdSetSnapshot['windows'] => ({ d3: m, d7: m, d14: m });

const mk = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'x',
  status: 'active',
  currentBudget: 100,
  ageDays: 30,
  windows: flat(w(100, 5)),
  ...over,
});

const forbidGrounded = (reason: string | undefined): void => {
  expect(reason).toBeDefined();
  expect(reason).not.toContain('null');
  expect(reason).not.toContain('undefined');
  expect(reason).not.toContain('NaN');
  expect(reason).not.toContain('Infinity');
};

// --- P1: zero upper funnel (severity high) --------------------------------------------

test('P1 arm (a): addToCarts===0 fires just over the spend floor, not under it', () => {
  // Just OVER the floor (spend 8 > 100/14 ≈ 7.14): 0 conversions, 0 add-to-carts => P1.
  const over = evaluateTriggers([mk({ id: 'dead', windows: flat(w(8, 0, 0)) })], DEFAULT_CONFIG);
  const rec = over.recommendations.find((r) => r.adSetId === 'dead');
  expect(rec?.trigger).toBe('P1_zero_upper_funnel');
  expect(rec?.severity).toBe('high');
  expect(rec?.kind).toBe('pause');
  expect(rec?.needsApproval).toBe(true);
  expect(over.starveIds.has('dead')).toBe(true);
  expect(rec?.reason).toBe('Spent 8 over 3d with 0 conversions and 0 add-to-carts.');
  forbidGrounded(rec?.reason);

  // Just UNDER the floor (spend 7 ≤ 7.14): the d3.spend > floor gate fails => no P1.
  const under = evaluateTriggers([mk({ id: 'dead', windows: flat(w(7, 0, 0)) })], DEFAULT_CONFIG);
  expect(under.recommendations.length).toBe(0);
  expect(under.starveIds.size).toBe(0);
});

test('P1 spend floor gate: exactly at the floor does not fire, just above does', () => {
  expect(FLOOR).toBeCloseTo(100 / 14, 9);
  // spend === floor is not strictly greater than floor => no fire.
  const at = evaluateTriggers([mk({ id: 'a', windows: flat(w(FLOOR, 0, 0)) })], DEFAULT_CONFIG);
  expect(at.recommendations.length).toBe(0);
  // A hair above => fires.
  const above = evaluateTriggers(
    [mk({ id: 'a', windows: flat(w(FLOOR + 0.5, 0, 0)) })],
    DEFAULT_CONFIG,
  );
  expect(above.recommendations[0]?.trigger).toBe('P1_zero_upper_funnel');
});

test('P1 arm (b): ATC cost over 4x the portfolio average fires; just under does not', () => {
  // 4 cheap peers each at an add-to-cart cost of $1 (spend 10 / 10 ATC). They carry purchases,
  // so they are never P1 candidates — they exist only to set the portfolio-average ATC cost.
  const peers = Array.from({ length: 4 }, (_, i) =>
    mk({
      id: `peer-${i}`,
      windows: { d3: w(10, 2, 10), d7: w(20, 4, 20), d14: w(40, 8, 40) },
    }),
  );

  // avg = (1+1+1+1 + X)/5 where X is pricey's own ATC cost; threshold to fire is X > 4·avg.
  // Solving X > 4(4+X)/5 gives X > 16 — so 17 fires, 15 does not.
  const pricey = (atcCostSpend: number): AdSetSnapshot =>
    mk({ id: 'pricey', windows: flat(w(atcCostSpend, 0, 1)) });

  const over = evaluateTriggers([...peers, pricey(17)], DEFAULT_CONFIG);
  const rec = over.recommendations.find((r) => r.adSetId === 'pricey');
  expect(rec?.trigger).toBe('P1_zero_upper_funnel');
  expect(rec?.severity).toBe('high');
  expect(rec?.kind).toBe('pause');
  expect(over.starveIds.has('pricey')).toBe(true);
  // avgAtcCost = 4.2 → "4"; atcCost3d = 17.
  expect(rec?.reason).toContain('add-to-cart cost of 17');
  expect(rec?.reason).toContain('over 4× the portfolio average of 4');
  forbidGrounded(rec?.reason);

  const under = evaluateTriggers([...peers, pricey(15)], DEFAULT_CONFIG);
  expect(under.recommendations.some((r) => r.adSetId === 'pricey')).toBe(false);
  expect(under.starveIds.has('pricey')).toBe(false);
});

test('P1 is blocked while an ad set is still in its grace window', () => {
  const dead = (ageDays: number): AdSetSnapshot =>
    mk({ id: 'g', ageDays, windows: flat(w(30, 0, 0)) });
  // ageDays <= newItemProtectDays (7) => grace blocks P1.
  expect(
    evaluateTriggers([dead(DEFAULT_CONFIG.newItemProtectDays)], DEFAULT_CONFIG).recommendations
      .length,
  ).toBe(0);
  // One day past protection => P1 fires.
  const out = evaluateTriggers([dead(DEFAULT_CONFIG.newItemProtectDays + 1)], DEFAULT_CONFIG);
  expect(out.recommendations[0]?.trigger).toBe('P1_zero_upper_funnel');
});

// --- P2: sustained poor vs the robust (P25) reference (severity medium) ----------------

// A cohort whose 14d cost-per-purchase values are 10 / 20 / 30. P25 of the cohort (with the
// target included) lands on $20, so the P2 threshold is 2.5 × 20 = $50.
const cohort = (): AdSetSnapshot[] => [
  mk({ id: 'c10', windows: { d3: w(50, 5), d7: w(100, 10), d14: w(200, 20) } }), // CPP 10
  mk({ id: 'c20', windows: { d3: w(100, 5), d7: w(200, 10), d14: w(400, 20) } }), // CPP 20
  mk({ id: 'c30', windows: { d3: w(150, 5), d7: w(300, 10), d14: w(600, 20) } }), // CPP 30
];

test('P2 fires when 14d CPP exceeds 2.5x the robust reference, and not just under it', () => {
  // Flat CPP 51 (> 50): trajectory neutral (3d==7d), so P2 is evaluated and fires.
  const dog = mk({ id: 'dog', windows: { d3: w(153, 3), d7: w(357, 7), d14: w(510, 10) } });
  const out = evaluateTriggers([...cohort(), dog], DEFAULT_CONFIG);
  const rec = out.recommendations.find((r) => r.adSetId === 'dog');
  expect(rec?.trigger).toBe('P2_sustained_poor');
  expect(rec?.severity).toBe('medium');
  expect(rec?.kind).toBe('pause');
  expect(rec?.needsApproval).toBe(true);
  expect(out.starveIds.has('dog')).toBe(true);
  expect(rec?.reason).toContain('$51');
  expect(rec?.reason).toContain('2.5×');
  expect(rec?.reason).toContain('$20');
  forbidGrounded(rec?.reason);

  // Flat CPP 49 (< 50): same robust reference, below threshold => no P2.
  const ok = mk({ id: 'dog', windows: { d3: w(147, 3), d7: w(343, 7), d14: w(490, 10) } });
  const under = evaluateTriggers([...cohort(), ok], DEFAULT_CONFIG);
  expect(under.recommendations.some((r) => r.adSetId === 'dog')).toBe(false);
});

test('P2 is skipped when the trajectory is positive (recovering)', () => {
  // 14d CPP 51 (would fire), but recent 3d is far cheaper than the prior week — trajectory
  // positive — so P2 stands down and lets the recovery play out.
  const recovering = mk({ id: 'rec', windows: { d3: w(60, 3), d7: w(300, 5), d14: w(510, 10) } });
  const out = evaluateTriggers([...cohort(), recovering], DEFAULT_CONFIG);
  expect(out.recommendations.some((r) => r.adSetId === 'rec')).toBe(false);
  expect(out.starveIds.has('rec')).toBe(false);
});

// --- P3: low significance / dead weight (severity low) --------------------------------

test('P3 fires with 0 KPI events in d14 AND d7 and 14d spend over one target CPA', () => {
  // add-to-carts present (so P1 arm a is off) at a cost that never clears 4x its own average
  // (so P1 arm b is off) — leaving P3 as the only trigger. 14d spend 51 > cpaTarget 50.
  const dead = mk({ id: 'dw', windows: { d3: w(20, 0, 1), d7: w(35, 0, 1), d14: w(51, 0, 1) } });
  const out = evaluateTriggers([dead], DEFAULT_CONFIG);
  const rec = out.recommendations.find((r) => r.adSetId === 'dw');
  expect(rec?.trigger).toBe('P3_low_significance');
  expect(rec?.severity).toBe('low');
  expect(rec?.kind).toBe('pause');
  expect(rec?.needsApproval).toBe(true);
  expect(out.starveIds.has('dw')).toBe(true);
  expect(rec?.reason).toContain('$51');
  forbidGrounded(rec?.reason);

  // 14d spend exactly at the target CPA (50) is not strictly greater => no P3.
  const under = evaluateTriggers(
    [mk({ id: 'dw', windows: { d3: w(20, 0, 1), d7: w(35, 0, 1), d14: w(50, 0, 1) } })],
    DEFAULT_CONFIG,
  );
  expect(under.recommendations.some((r) => r.adSetId === 'dw')).toBe(false);
});

test('P3 needs BOTH d14 and d7 empty: a single d7 event blocks it', () => {
  const oneEvent = mk({
    id: 'dw',
    windows: { d3: w(20, 0, 1), d7: w(35, 1, 1), d14: w(60, 1, 1) },
  });
  const out = evaluateTriggers([oneEvent], DEFAULT_CONFIG);
  expect(out.recommendations.some((r) => r.trigger === 'P3_low_significance')).toBe(false);
});

// --- Not evaluable: frozen / flagged never produce a recommendation -------------------

test('frozen and flagged ad sets are never evaluated, however dead their funnel', () => {
  const deadFunnel = flat(w(120, 0, 0)); // would be a screaming P1 if evaluable
  const frozen = evaluateTriggers(
    [mk({ id: 'f', status: 'frozen', windows: deadFunnel })],
    DEFAULT_CONFIG,
  );
  expect(frozen.recommendations.length).toBe(0);
  expect(frozen.starveIds.size).toBe(0);

  const flagged = evaluateTriggers(
    [mk({ id: 'g', status: 'flagged', windows: deadFunnel })],
    DEFAULT_CONFIG,
  );
  expect(flagged.recommendations.length).toBe(0);
  expect(flagged.starveIds.size).toBe(0);
});
