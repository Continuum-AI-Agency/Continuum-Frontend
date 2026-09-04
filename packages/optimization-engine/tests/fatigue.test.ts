// Fatigue (creative / audience) recommendation tests (bun test).
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { DEFAULT_CONFIG, evaluateFatigue, runCycle } from '../src/index';

const w = (spend: number, purchases: number, clicks = 0, impressions = 0): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks,
  impressions,
});

// Base: still converting, but recent (3d) CPA well above the 14d baseline.
// 14d CPA = 4000/100 = $40; 3d CPA = 600/10 = $60 (+50%, > +20% drift).
const decaying = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'x',
  status: 'active',
  currentBudget: 100,
  ageDays: 40,
  windows: { d3: w(600, 10), d7: w(1800, 35), d14: w(4000, 100) },
  ...over,
});

test('F2 — high frequency + rising CPA => audience_expand', () => {
  const recs = evaluateFatigue(
    [decaying({ audienceType: 'prospecting', frequency7d: 4.0 })],
    DEFAULT_CONFIG,
  );
  expect(recs.length).toBe(1);
  expect(recs[0].kind).toBe('audience_expand');
  expect(recs[0].trigger).toBe('F2_audience_saturation');
  expect(recs[0].needsApproval).toBe(true);
});

test('remarketing tolerates higher frequency before F2 fires', () => {
  // freq 4.0 is over the prospecting cap (3.0) but under the remarketing cap (5.0).
  const rmkt = evaluateFatigue(
    [decaying({ audienceType: 'remarketing', frequency7d: 4.0 })],
    DEFAULT_CONFIG,
  );
  expect(rmkt.some((r) => r.trigger === 'F2_audience_saturation')).toBe(false);
});

test('F1 — CTR decay + rising CPA (freq under cap) => creative_refresh', () => {
  // CTR: 14d 1000/40000 = 2.5%; 3d 80/8000 = 1.0% (-60%, > 25% drop). freq under cap.
  const s = decaying({
    audienceType: 'prospecting',
    frequency7d: 1.8,
    windows: {
      d3: w(600, 10, 80, 8000),
      d7: w(1800, 35, 400, 18000),
      d14: w(4000, 100, 1000, 40000),
    },
  });
  const recs = evaluateFatigue([s], DEFAULT_CONFIG);
  expect(recs.length).toBe(1);
  expect(recs[0].kind).toBe('creative_refresh');
  expect(recs[0].trigger).toBe('F1_creative_fatigue');
});

test('healthy ad set (stable CPA, low freq) => no fatigue', () => {
  const healthy: AdSetSnapshot = {
    id: 'ok',
    status: 'active',
    currentBudget: 100,
    ageDays: 40,
    audienceType: 'prospecting',
    frequency7d: 1.5,
    windows: { d3: w(400, 10, 200, 8000), d7: w(1400, 35), d14: w(4000, 100, 1000, 40000) }, // 3d CPA $40 == 14d $40
  };
  expect(evaluateFatigue([healthy], DEFAULT_CONFIG).length).toBe(0);
});

test('young ad set is never flagged', () => {
  const young = decaying({ ageDays: 4, frequency7d: 6.0, audienceType: 'prospecting' });
  expect(evaluateFatigue([young], DEFAULT_CONFIG).length).toBe(0);
});

test('already-starved ad sets are skipped (no double-noise)', () => {
  const s = decaying({ id: 'dup', audienceType: 'prospecting', frequency7d: 6.0 });
  expect(evaluateFatigue([s], DEFAULT_CONFIG, new Set(['dup'])).length).toBe(0);
});

test('runCycle surfaces fatigue recommendations alongside pauses', () => {
  const res = runCycle([decaying({ id: 'fat', audienceType: 'prospecting', frequency7d: 4.0 })], {
    total: 100,
  });
  expect(res.recommendations.some((r) => r.kind === 'audience_expand' && r.adSetId === 'fat')).toBe(
    true,
  );
});

// --- Boundary: prospecting frequency cap (fatigueFreqProspecting = 3.0) ----------------

test('F2 fires exactly AT the prospecting frequency cap, not a hair below it', () => {
  // The base fixture has no impression data, so with F2 off (freq under cap) there is no CTR
  // signal for F1 either — the ad set falls silent, isolating the cap boundary cleanly.
  const at = evaluateFatigue(
    [decaying({ audienceType: 'prospecting', frequency7d: DEFAULT_CONFIG.fatigueFreqProspecting })],
    DEFAULT_CONFIG,
  );
  expect(at.length).toBe(1);
  expect(at[0].trigger).toBe('F2_audience_saturation');

  const below = evaluateFatigue(
    [
      decaying({
        audienceType: 'prospecting',
        frequency7d: DEFAULT_CONFIG.fatigueFreqProspecting - 0.01,
      }),
    ],
    DEFAULT_CONFIG,
  );
  expect(below.length).toBe(0);
});

// --- Boundary: remarketing frequency cap (fatigueFreqRemarketing = 5.0) ----------------

test('remarketing F2 fires only at its higher cap (5.0), not just under it', () => {
  const at = evaluateFatigue(
    [decaying({ audienceType: 'remarketing', frequency7d: DEFAULT_CONFIG.fatigueFreqRemarketing })],
    DEFAULT_CONFIG,
  );
  expect(at.some((r) => r.trigger === 'F2_audience_saturation')).toBe(true);

  const below = evaluateFatigue(
    [
      decaying({
        audienceType: 'remarketing',
        frequency7d: DEFAULT_CONFIG.fatigueFreqRemarketing - 0.01,
      }),
    ],
    DEFAULT_CONFIG,
  );
  expect(below.some((r) => r.trigger === 'F2_audience_saturation')).toBe(false);
});

// --- Boundary: CPA drift (fatigueCpaDriftPct = 0.2 => recent must exceed 1.2x baseline) --

test('fatigue needs the 3d CPA over 1.2x the 14d baseline — exactly 1.2x does not count', () => {
  // 14d CPA = 4000/100 = $40; the drift gate is 1.2 x 40 = $48. Hold frequency over the cap
  // so F2 is the only variable and the sole discriminator is whether CPA is rising.
  const over = evaluateFatigue(
    [
      decaying({
        audienceType: 'prospecting',
        frequency7d: 4.0,
        windows: { d3: w(481, 10), d7: w(1800, 40), d14: w(4000, 100) },
      }),
    ],
    DEFAULT_CONFIG,
  ); // 3d CPA $48.1 > $48
  expect(over.some((r) => r.trigger === 'F2_audience_saturation')).toBe(true);

  const under = evaluateFatigue(
    [
      decaying({
        audienceType: 'prospecting',
        frequency7d: 4.0,
        windows: { d3: w(480, 10), d7: w(1800, 40), d14: w(4000, 100) },
      }),
    ],
    DEFAULT_CONFIG,
  ); // 3d CPA $48.0 == threshold, not strictly greater
  expect(under.length).toBe(0);
});

test('a high-frequency ad set with a STABLE CPA is not fatigued (rising CPA is required)', () => {
  // freq well over the cap, but 3d CPA ($40) == 14d CPA ($40): efficiency is not decaying.
  const stable: AdSetSnapshot = {
    id: 'stable',
    status: 'active',
    currentBudget: 100,
    ageDays: 40,
    audienceType: 'prospecting',
    frequency7d: 6.0,
    windows: { d3: w(400, 10), d7: w(1400, 35), d14: w(4000, 100) },
  };
  expect(evaluateFatigue([stable], DEFAULT_CONFIG).length).toBe(0);
});

// --- Boundary: CTR drop (fatigueCtrDropPct = 0.25 => recent must fall below 0.75x baseline) --

test('F1 needs the 3d CTR below 0.75x the 14d baseline — at the threshold it does not fire', () => {
  // 14d CTR = 1000/40000 = 2.5%; the drop gate is 0.75 x 2.5% = 1.875%. CPA is rising (3d $60
  // vs 14d $40) and frequency is under the cap, so only the CTR boundary decides F1.
  const dropped = decaying({
    audienceType: 'prospecting',
    frequency7d: 1.8,
    windows: {
      d3: w(600, 10, 144, 8000),
      d7: w(1800, 35, 400, 18000),
      d14: w(4000, 100, 1000, 40000),
    },
  }); // 3d CTR 1.8% < 1.875%
  const recs = evaluateFatigue([dropped], DEFAULT_CONFIG);
  expect(recs.length).toBe(1);
  expect(recs[0].trigger).toBe('F1_creative_fatigue');
  expect(recs[0].kind).toBe('creative_refresh');

  const held = decaying({
    audienceType: 'prospecting',
    frequency7d: 1.8,
    windows: {
      d3: w(600, 10, 152, 8000),
      d7: w(1800, 35, 400, 18000),
      d14: w(4000, 100, 1000, 40000),
    },
  }); // 3d CTR 1.9% > 1.875%
  expect(evaluateFatigue([held], DEFAULT_CONFIG).length).toBe(0);
});

test('F1 fires when CTR collapses to exactly zero on real delivery', () => {
  // The worst case there is: still serving 10k impressions in d3, still converting,
  // CPA rising — and not one click. `ctrRecent > 0` used to discard it.
  const collapsed = decaying({
    windows: {
      d3: w(600, 10, 0, 10_000),
      d7: w(1800, 35, 250, 25_000),
      d14: w(4000, 100, 500, 50_000),
    },
  });
  const recs = evaluateFatigue([collapsed], DEFAULT_CONFIG);
  expect(recs.map((r) => r.trigger)).toContain('F1_creative_fatigue');
});

test('an ad set that did not deliver at all in d3 is not called fatigued', () => {
  // Zero impressions is missing data, not worn-out creative — the distinction the
  // old `ctrRecent > 0` guard was reaching for and got wrong in both directions.
  const undelivered = decaying({
    windows: {
      d3: w(600, 10, 0, 0),
      d7: w(1800, 35, 250, 25_000),
      d14: w(4000, 100, 500, 50_000),
    },
  });
  expect(
    evaluateFatigue([undelivered], DEFAULT_CONFIG).some(
      (r) => r.trigger === 'F1_creative_fatigue',
    ),
  ).toBe(false);
});
