// C4 — creative decay: one creative measured against its OWN past.
//
// The distinction this file exists to protect: every other creative trigger compares
// creatives to EACH OTHER, so an ad set running one creative is invisible to all of them.
// 37 of 53 live ad sets run exactly one creative. C4 is the only thing that can speak
// there, and it can only speak because the per-ad series exists — which it did not until
// paid_media.ad_breakdown_daily started filling.
//
// The `soloStanding` fixture below is the load-bearing one. A real single-creative standing
// comes back from paid_media_get_adset_creative_standing with winner NULL (withheld unless
// eligible_ads >= 2) and laggards EMPTY (only ranks below first are listed). A first draft
// of C4 read the series off the standing's ads and was therefore silent on every one of
// those 37 ad sets — the exact case it was written for. That is why the series is a roster
// on the snapshot, and why this fixture asserts against the empty shape rather than a
// convenient one.
//
// The other half of the job is refusing to speak. A single ad's 3-day conversion count is
// routinely 0-2; a decay rule without an evidence floor would manufacture a confident
// finding out of three conversions on every account we have.

import { expect, test } from 'bun:test';
import type {
  AdSetSnapshot,
  CreativeAdSeries,
  CreativeStanding,
  CreativeStandingAd,
  WindowMetrics,
} from '../src/index';
import { attachCreativeSeries, evaluateCreative, resolveConfig } from '../src/index';

const cfg = resolveConfig({ objective: 'conversations' });

/** impressions and clicks are explicit here: CTR is half of what C4 reads. */
const W = (spend: number, convos: number, impressions: number, clicks: number): WindowMetrics => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks,
  impressions,
  conversations: convos,
});

/** Decaying hard: $100 -> $300 per conversation, CTR 1.0% -> 0.2%, 40 conversations of
 *  evidence over 14 days. */
const DECAYING = {
  d3: W(1_500, 5, 100_000, 200),
  d7: W(2_800, 20, 180_000, 900),
  d14: W(4_000, 40, 200_000, 2_000),
};

const series = (adId: string, windows = DECAYING, adName?: string): CreativeAdSeries => ({
  adId,
  ...(adName ? { adName } : {}),
  windows,
});

/** A REAL single-creative standing. Both halves of the comparison are empty — see header. */
const soloStanding = (): CreativeStanding => ({
  winner: null,
  laggards: [],
  eligibleAds: 1,
  totalAds: 1,
  killSpendShare: 0,
  belowAvgSpendShare: 0,
  medianCostPerEvent: 100,
  flags: ['single_creative'],
});

const compared = (
  winner: CreativeStandingAd,
  laggards: CreativeStandingAd[],
  killSpendShare = 0,
): CreativeStanding => ({
  winner,
  laggards,
  eligibleAds: 1 + laggards.length,
  totalAds: 1 + laggards.length,
  killSpendShare,
  belowAvgSpendShare: 0,
  medianCostPerEvent: 100,
  flags: [],
});

const adSet = (creative: CreativeStanding, creativeSeries?: CreativeAdSeries[]): AdSetSnapshot => ({
  id: 'as_1',
  status: 'active',
  currentBudget: 200,
  ageDays: 60,
  kpiField: 'conversations',
  creative,
  ...(creativeSeries ? { creativeSeries } : {}),
  windows: {
    d3: W(900, 25, 50_000, 500),
    d7: W(2_000, 55, 110_000, 1_100),
    d14: W(4_000, 110, 220_000, 2_200),
  },
});

const c4 = (s: AdSetSnapshot) =>
  evaluateCreative([s], cfg).recommendations.filter((r) => r.trigger === 'C4_creative_decay');

// --- the case nothing else could see --------------------------------------------------

test('C4 fires on a SINGLE-creative ad set, whose standing has no winner and no laggards', () => {
  const standing = soloStanding();
  expect(standing.winner).toBeNull();
  expect(standing.laggards).toHaveLength(0);

  const recs = evaluateCreative(
    [adSet(standing, [series('ad_only', DECAYING, 'Solo Ad')])],
    cfg,
  ).recommendations;

  const decay = recs.find((r) => r.trigger === 'C4_creative_decay');
  expect(decay).toBeDefined();
  expect(decay?.adId).toBe('ad_only');
  expect(decay?.kind).toBe('variate_creative');
  expect(decay?.needsApproval).toBe(true);
  // C3 still says its piece — "add variants" and "this one is dying" are not alternatives.
  expect(recs.some((r) => r.trigger === 'C3_no_variance')).toBe(true);
});

test('the decay reason cites the creative against ITSELF, with both numbers', () => {
  const [rec] = c4(adSet(soloStanding(), [series('ad_only', DECAYING, 'Solo Ad')]));
  expect(rec?.reason).toContain('its own history');
  expect(rec?.reason).toContain('Solo Ad');
  expect(rec?.reason).toContain('200%'); // $100 -> $300 per conversation
  expect(rec?.reason).toContain('80%'); // 1.0% -> 0.2% CTR
});

// --- the refusals ---------------------------------------------------------------------

test('no series at all means SILENCE, not a flat reading', () => {
  expect(c4(adSet(soloStanding()))).toHaveLength(0);
});

test('an ad below the evidence floor produces nothing — not a hedged finding', () => {
  // Same collapse shape, three conversations behind it instead of forty.
  const thin = {
    d3: W(150, 1, 10_000, 20),
    d7: W(280, 2, 18_000, 90),
    d14: W(400, 3, 20_000, 200),
  };
  expect(cfg.creativeDecayMinEvents).toBeGreaterThan(3);
  expect(c4(adSet(soloStanding(), [series('ad_thin', thin)]))).toHaveLength(0);
});

test('rising cost with HEALTHY engagement is not decay', () => {
  // CPA up, CTR steady — an auction getting more expensive, not a worn-out creative.
  const pricey = {
    d3: W(1_500, 5, 100_000, 1_000), // CTR 1.0%
    d7: W(2_800, 20, 180_000, 1_800),
    d14: W(4_000, 40, 200_000, 2_000), // CTR 1.0%
  };
  expect(c4(adSet(soloStanding(), [series('ad_pricey', pricey)]))).toHaveLength(0);
});

test('a creative that stopped DELIVERING is not called decayed', () => {
  // Zero impressions in d3 is missing data. The mirror of F1's boundary: CTR 0 on real
  // delivery IS the worst reading; CTR 0 on no delivery is no reading at all.
  const dark = {
    d3: W(0, 0, 0, 0),
    d7: W(2_800, 20, 180_000, 900),
    d14: W(4_000, 40, 200_000, 2_000),
  };
  expect(c4(adSet(soloStanding(), [series('ad_dark', dark)]))).toHaveLength(0);
});

// --- one ad, one card -----------------------------------------------------------------

test('C4 stays quiet on an ad C1 already put a pause card on', () => {
  const winner: CreativeStandingAd = {
    adId: 'ad_winner',
    adName: 'winner',
    spend: 2_000,
    events: 100,
    costPerEvent: 20,
  };
  const laggard: CreativeStandingAd = {
    adId: 'ad_laggard',
    adName: 'laggard',
    spend: 3_000,
    events: 40,
    costPerEvent: 60,
    vsWinner: 3.0,
  };
  const s = adSet(compared(winner, [laggard], 0.8), [series('ad_winner'), series('ad_laggard')]);

  const recs = evaluateCreative([s], cfg).recommendations;
  // C1 claims the laggard; C4 must not add a second card for the same ad.
  expect(recs.filter((r) => r.adId === 'ad_laggard').map((r) => r.trigger)).toEqual([
    'C1_creative_drag',
  ]);
  // The winner is claimed by C2, so it does not get a duplicate either.
  expect(
    recs.filter((r) => r.adId === 'ad_winner' && r.trigger === 'C4_creative_decay'),
  ).toHaveLength(0);
});

test('a decaying WINNER is graded high — that is where the money is', () => {
  const winner: CreativeStandingAd = {
    adId: 'ad_winner',
    adName: 'winner',
    spend: 2_000,
    events: 100,
    costPerEvent: 20,
  };
  // No laggard past the noise floor, so neither C1 nor C2 fires and C4 owns the winner.
  const s = adSet(compared(winner, []), [series('ad_winner')]);
  const [rec] = c4(s);
  expect(rec?.severity).toBe('high');
});

// --- the whole chain, in one assertion ------------------------------------------------

test('raw attribution rows -> fold -> C4, on a single-creative ad set', () => {
  // Everything above tests one half. This is the join: the shape paid-media-metrics actually
  // returns, through the real fold, into the real detector. If the deployed edge function
  // starts answering ad_attribution_daily and NOTHING appears, the break is upstream of here.
  const day = (
    date: string,
    spend: number,
    convos: number,
    impressions: number,
    clicks: number,
  ) => ({
    ad_id: 'ad_solo',
    adset_id: 'as_1',
    ad_name: 'Solo Ad',
    date,
    spend,
    impressions,
    clicks,
    link_clicks: Math.round(clicks / 2),
    actions: { 'onsite_conversion.messaging_conversation_started_7d': convos },
    video_thruplays: null,
  });

  // 11 healthy days then 3 bad ones: cheap conversations and 1% CTR collapsing to
  // expensive conversations and 0.2% CTR.
  const rows = [
    ...Array.from({ length: 11 }, (_, i) =>
      day(`2026-08-${String(19 + i).padStart(2, '0')}`, 100, 5, 10_000, 100),
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      day(`2026-08-${String(30 + i).padStart(2, '0')}`, 300, 1, 30_000, 60),
    ),
  ];

  const [folded] = attachCreativeSeries([adSet(soloStanding())], rows);
  expect(folded?.creativeSeries).toHaveLength(1);

  const recs = evaluateCreative([folded as AdSetSnapshot], cfg).recommendations;
  const decay = recs.find((r) => r.trigger === 'C4_creative_decay');
  expect(decay?.adId).toBe('ad_solo');
  expect(decay?.reason).toContain('Solo Ad');
});
