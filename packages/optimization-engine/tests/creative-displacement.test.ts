// C5 — displaced vs. worn out (bun test).
//
// These two states produce the same symptoms on the ad's own numbers and call for
// opposite actions. Every test here is about keeping them apart.
import { expect, test } from 'bun:test';
import {
  DEFAULT_CONFIG,
  effectiveCreativeCount,
  evaluateCreative,
  type AdSetSnapshot,
  type CreativeStanding,
  type WindowMetrics,
} from '../src/index';

const w = (spend: number, purchases: number, clicks: number, impressions: number): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks,
  impressions,
});

/** Two eligible creatives, so C3's single_creative branch does not swallow the ad set. */
const standing = (): CreativeStanding => ({
  winner: { adId: 'winner', adName: 'Winner', spend: 900, events: 30, costPerEvent: 30 },
  laggards: [{ adId: 'loser', adName: 'Loser', spend: 300, events: 6, costPerEvent: 50, vsWinner: 1.66 }],
  eligibleAds: 2,
  totalAds: 2,
  killSpendShare: 0,
  belowAvgSpendShare: 0,
  medianCostPerEvent: 40,
  flags: [],
});

/**
 * An ad set whose own delivery held steady (d3 = 3/14 of d14, i.e. flat per day) while
 * one creative's SHARE collapsed from 40% to 4%.
 */
const displaced = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'as1',
  status: 'active',
  currentBudget: 100,
  ageDays: 40,
  windows: { d3: w(300, 10, 60, 3000), d7: w(700, 23, 140, 7000), d14: w(1400, 46, 280, 14000) },
  creative: standing(),
  creativeSeries: [
    {
      adId: 'winner',
      adName: 'Winner',
      windows: { d3: w(288, 10, 58, 2880), d7: w(600, 20, 120, 6000), d14: w(840, 28, 168, 8400) },
    },
    {
      adId: 'loser',
      adName: 'Loser',
      // Share 5600/14000 = 40% over d14, 120/3000 = 4% over d3. CTR steady at 2%.
      windows: { d3: w(12, 0, 2, 120), d7: w(100, 3, 20, 1000), d14: w(560, 18, 112, 5600) },
    },
  ],
  ...over,
});

test('a creative that lost its share while the ad set kept delivering is displaced', () => {
  const out = evaluateCreative([displaced()], DEFAULT_CONFIG);
  const c5 = out.recommendations.find((r) => r.trigger === 'C5_auction_displacement');
  expect(c5).toBeDefined();
  expect(c5?.adId).toBe('loser');
  expect(c5?.kind).toBe('pause_ad');
  // The point of the finding is that it does NOT ask for a new creative.
  expect(c5?.reason).toContain('lost the auction');
  expect(c5?.reason).toContain('Refreshing it changes nothing');
});

test('when the whole ad set stopped delivering, no creative was displaced', () => {
  // Same shares, but the ad set's own per-day delivery fell by 80%. Nothing lost an
  // auction here — everything stopped, which is stage D's finding, not this one.
  const s = displaced({
    windows: { d3: w(60, 2, 12, 600), d7: w(400, 13, 80, 4000), d14: w(1400, 46, 280, 14000) },
  });
  const out = evaluateCreative([s], DEFAULT_CONFIG);
  expect(out.recommendations.every((r) => r.trigger !== 'C5_auction_displacement')).toBe(true);
});

test('a creative whose engagement also fell is worn out, not displaced', () => {
  // Same share collapse, but CTR drops from 2% to 0.83% — C4's subject, not C5's.
  const s = displaced();
  s.creativeSeries = [
    s.creativeSeries![0],
    {
      adId: 'loser',
      adName: 'Loser',
      windows: { d3: w(12, 0, 1, 120), d7: w(100, 3, 12, 1000), d14: w(560, 18, 112, 5600) },
    },
  ];
  const out = evaluateCreative([s], DEFAULT_CONFIG);
  expect(out.recommendations.every((r) => r.trigger !== 'C5_auction_displacement')).toBe(true);
});

test('an ad that never had delivery to lose is not displaced', () => {
  const s = displaced();
  s.creativeSeries = [
    { adId: 'winner', adName: 'Winner', windows: { d3: w(300, 10, 60, 2990), d7: w(700, 23, 140, 6900), d14: w(1390, 46, 278, 13900) } },
    { adId: 'loser', adName: 'Loser', windows: { d3: w(1, 0, 0, 10), d7: w(5, 0, 1, 50), d14: w(10, 0, 2, 100) } },
  ];
  const out = evaluateCreative([s], DEFAULT_CONFIG);
  expect(out.recommendations.every((r) => r.trigger !== 'C5_auction_displacement')).toBe(true);
});

test('without a per-ad series there is no displacement finding — unknown is not a verdict', () => {
  const s = displaced({ creativeSeries: undefined });
  const out = evaluateCreative([s], DEFAULT_CONFIG);
  expect(out.recommendations.every((r) => r.trigger !== 'C5_auction_displacement')).toBe(true);
});

// --- the diversity number ---------------------------------------------------

test('effective creative count exposes concentration a raw count hides', () => {
  // Four live creatives, one taking 95% of delivery: behaves like ~1.3, not like 4.
  expect(effectiveCreativeCount([9500, 200, 200, 100])).toBeLessThan(1.5);
  // Four sharing evenly is genuinely four.
  expect(effectiveCreativeCount([2500, 2500, 2500, 2500])).toBeCloseTo(4, 5);
  // Nothing delivered is UNKNOWN, not zero.
  expect(effectiveCreativeCount([0, 0])).toBeNull();
});

test('C3 says which problem an ad set actually has', () => {
  // Three creatives live, delivery concentrated on one, only one judgeable. "Add
  // variants" is the wrong instruction: the variants exist and are not being served.
  const s = displaced({
    creative: { ...standing(), winner: null, eligibleAds: 1, totalAds: 3, flags: ['single_creative'] },
    creativeSeries: [
      { adId: 'a', windows: { d3: w(288, 10, 58, 2900), d7: w(600, 20, 120, 6800), d14: w(840, 28, 168, 13500) } },
      { adId: 'b', windows: { d3: w(6, 0, 1, 60), d7: w(30, 0, 5, 150), d14: w(30, 0, 6, 300) } },
      { adId: 'c', windows: { d3: w(6, 0, 1, 40), d7: w(30, 0, 5, 150), d14: w(30, 0, 6, 200) } },
    ],
  });
  const out = evaluateCreative([s], DEFAULT_CONFIG);
  const c3 = out.recommendations.find((r) => r.trigger === 'C3_no_variance');
  expect(c3).toBeDefined();
  expect(c3?.reason).toContain('concentrated');
  expect(c3?.reason).not.toContain('Add variants to create the comparison');
});
