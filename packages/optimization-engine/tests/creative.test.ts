// The creative triggers, driven by REAL standings.
//
// Every fixture below is taken verbatim from what
// paid_media_get_adset_creative_standing() returned for a live Meta account (a gym,
// brand 61b80f51, d14). Nothing here is invented, because the thing being tested is
// whether the engine reaches the right conclusion about a real account — and a fixture
// tuned until it passes proves only that it was tuned.

import { expect, test } from 'bun:test';
import type { AdSetSnapshot, CreativeStanding, WindowMetrics } from '../src/index';
import {
  DRAG_SPEND_SHARE,
  evaluateCreative,
  LAGGARD_COST_MULTIPLE,
  resolveConfig,
} from '../src/index';

const cfg = resolveConfig({ objective: 'conversations' });

const W = (spend: number, convos: number): WindowMetrics => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks: Math.round(spend / 2),
  impressions: Math.round(spend * 100),
  conversations: convos,
});

const adSet = (id: string, creative: CreativeStanding, budget = 200): AdSetSnapshot => ({
  id,
  status: 'active',
  currentBudget: budget,
  ageDays: 60,
  kpiField: 'conversations',
  creative,
  windows: { d3: W(900, 25), d7: W(2_000, 55), d14: W(4_000, 110) },
});

// --- REAL standings, straight off the live account ------------------------------------

/** "Vivo47 VR Dic25" — $3,471. Winner $24.94/convo and Meta rates it AVERAGE; the laggard
 *  costs 2.22x as much. The one creative on the account genuinely worth cloning. */
const VR_DIC25: CreativeStanding = {
  winner: {
    adId: 'ad_vr_winner',
    adName: 'Vivo47 VR Dic25 - Copia',
    creativeRowId: 'cr_vr',
    verdict: 'scale',
    qualityRanking: 'AVERAGE',
    spend: 2917.6,
    events: 117,
    costPerEvent: 24.94,
    labels: { hookArchetype: 'value_stack', angle: 'Risk-free trial offer' },
    posterUrl: 'https://cdn.example/poster.jpg',
  },
  laggards: [
    {
      adId: 'ad_vr_laggard',
      adName: 'Vivo47 VR Dic25',
      verdict: 'iterate',
      qualityRanking: 'BELOW_AVERAGE_35',
      spend: 553.85,
      events: 10,
      costPerEvent: 55.37,
      vsWinner: 2.22,
    },
  ],
  eligibleAds: 2,
  totalAds: 2,
  killSpendShare: 0,
  belowAvgSpendShare: 0.1595,
  medianCostPerEvent: 40.15,
  flags: ['low_evidence', 'spend_concentrated'],
};

/** "Vivo47 General Ene26" — winner $14.58/convo, the cheapest creative on the account,
 *  BUT Meta rates it BELOW_AVERAGE_35 and 53% of the ad set's spend is on below-average
 *  creatives. Converting best while the auction penalizes your craft. */
const GENERAL_ENE26: CreativeStanding = {
  winner: {
    adId: 'ad_gen_winner',
    adName: 'Nuevo anuncio de Interacción - Copia',
    creativeRowId: 'cr_gen',
    verdict: 'iterate',
    qualityRanking: 'BELOW_AVERAGE_35',
    spend: 918,
    events: 63,
    costPerEvent: 14.58,
    labels: {
      hookArchetype: 'value_stack',
      angle: 'Low-barrier entry offer (DayPass and free months)',
      visualStyle: 'Lifestyle gym photography with overlaid text',
    },
  },
  laggards: [
    {
      adId: 'ad_gen_laggard',
      adName: 'Nuevo anuncio de Interacción',
      verdict: 'scale',
      spend: 695,
      events: 37,
      costPerEvent: 18.79,
      vsWinner: 1.29,
    },
  ],
  eligibleAds: 2,
  totalAds: 5,
  killSpendShare: 0,
  belowAvgSpendShare: 0.531,
  medianCostPerEvent: 16.68,
  flags: ['low_evidence', 'winner_below_average_quality'],
};

/** A zero-spend ad set with one creative. The most common state on the account: nothing
 *  ran against it, so nothing can be concluded. */
const SINGLE: CreativeStanding = {
  winner: null,
  laggards: [],
  eligibleAds: 1,
  totalAds: 1,
  killSpendShare: null,
  belowAvgSpendShare: null,
  medianCostPerEvent: null,
  flags: ['single_creative', 'low_evidence'],
};

// --- C2: make more of the winner ------------------------------------------------------

test('a measured winner earns a variate_creative naming the AD and carrying its labels', () => {
  const { recommendations } = evaluateCreative([adSet('vr', VR_DIC25)], cfg);
  const rec = recommendations.find((r) => r.kind === 'variate_creative');

  expect(rec).toBeDefined();
  expect(rec?.trigger).toBe('C2_creative_winner');
  expect(rec?.adId).toBe('ad_vr_winner'); // the AD, not just the ad set
  expect(rec?.severity).toBe('high'); // 2.22x gap
  expect(rec?.needsApproval).toBe(true);

  // The seed is what generation actually consumes — it must carry the winner's own labels.
  expect(rec?.seed?.winnerAdId).toBe('ad_vr_winner');
  expect(rec?.seed?.labels).toMatchObject({ hookArchetype: 'value_stack' });
  expect(rec?.seed?.posterUrl).toBe('https://cdn.example/poster.jpg');

  // Meta rates this winner AVERAGE, so the craft is NOT the problem: clone it.
  expect(rec?.seed?.rebuildCraft).toBe(false);
  expect(rec?.reason).toContain('$24.94');
  expect(rec?.reason).toContain('conversation'); // priced in the DECLARED currency
  expect(rec?.reason).not.toContain('CPA');
});

test('the citations are deterministic and name the constant-audience claim', () => {
  const { recommendations } = evaluateCreative([adSet('vr', VR_DIC25)], cfg);
  const grounded = recommendations.find((r) => r.kind === 'variate_creative')?.seed?.groundedOn;

  expect(grounded?.some((g) => g.includes('$24.94') && g.includes('conversation'))).toBe(true);
  expect(grounded?.some((g) => g.includes('2.22x'))).toBe(true);
  // The reason the comparison is worth anything at all. It must travel with it.
  expect(
    grounded?.some((g) => g.includes('audience, budget and optimization goal held constant')),
  ).toBe(true);
  // Trust flags travel with the numbers, everywhere.
  expect(grounded?.some((g) => g === 'trust: low_evidence')).toBe(true);
});

// --- The distinction the whole feature turns on ---------------------------------------

test('a winner Meta rates BELOW_AVERAGE says REBUILD THE CRAFT, never "clone this"', () => {
  // The cheapest creative on the account ($14.58/convo) is one Meta is penalizing in the
  // auction. Cloning its execution would industrialize the penalty. What won is the ANGLE.
  const { recommendations } = evaluateCreative([adSet('gen', GENERAL_ENE26)], cfg);
  const rec = recommendations.find((r) => r.kind === 'variate_creative');

  expect(rec?.seed?.rebuildCraft).toBe(true);
  expect(rec?.reason).toContain('BELOW_AVERAGE_35');
  expect(rec?.reason).toContain('Keep the angle, rebuild the execution');
  expect(rec?.seed?.groundedOn.some((g) => g.includes('the angle won, the craft did not'))).toBe(
    true,
  );
  // And it still hands the generator the angle that actually won.
  expect(rec?.seed?.labels).toMatchObject({
    angle: 'Low-barrier entry offer (DayPass and free months)',
  });
});

// --- C1: drag -------------------------------------------------------------------------

test('53% of spend on below-average creatives withholds the RAISE and pauses the laggard', () => {
  const { recommendations, noRaiseIds } = evaluateCreative([adSet('gen', GENERAL_ENE26)], cfg);

  expect(noRaiseIds.has('gen')).toBe(true);

  const pause = recommendations.find((r) => r.kind === 'pause_ad');
  expect(pause?.trigger).toBe('C1_creative_drag');
  expect(pause?.adId).toBe('ad_gen_laggard');
  expect(pause?.reason).toContain('The budget is not the problem here; the creative is');
});

test('withholding a raise is NOT a starve — the ad set keeps every dollar it has', () => {
  const { noRaiseIds } = evaluateCreative([adSet('gen', GENERAL_ENE26, 300)], cfg);
  expect(noRaiseIds.has('gen')).toBe(true);
  // noRaise only ever clamps the UPPER bound; nothing here drives a budget down. The
  // reallocation test below proves the ad set still holds its $300.
});

test('a clean ad set is left alone — no drag, no raise withheld', () => {
  // VR Dic25: only 16% of spend on below-average creatives, nothing killed.
  const { recommendations, noRaiseIds } = evaluateCreative([adSet('vr', VR_DIC25)], cfg);
  expect(noRaiseIds.has('vr')).toBe(false);
  expect(recommendations.some((r) => r.kind === 'pause_ad')).toBe(false);
});

// --- C3: nothing to learn from --------------------------------------------------------

test('one creative means NO winner is claimed — it means the ad set cannot be read', () => {
  const { recommendations } = evaluateCreative([adSet('single', SINGLE)], cfg);
  const rec = recommendations.find((r) => r.kind === 'seed_experiment');

  expect(rec?.trigger).toBe('C3_no_variance');
  expect(rec?.reason).toContain('there was nothing for it to beat');

  // Critically: it must NOT also claim a winner or a drag. With a sample of one, every
  // other conclusion is invented.
  expect(recommendations.some((r) => r.kind === 'variate_creative')).toBe(false);
  expect(recommendations.some((r) => r.kind === 'pause_ad')).toBe(false);
  expect(rec?.seed?.winnerAdId).toBeUndefined();
});

// --- Silence, where silence is correct ------------------------------------------------

test('an ad set with no creative standing at all produces NOTHING', () => {
  // Never labeled, never synced. An un-run pipeline must not look like a finding.
  const bare: AdSetSnapshot = {
    id: 'bare',
    status: 'active',
    currentBudget: 100,
    ageDays: 60,
    windows: { d3: W(300, 8), d7: W(700, 19), d14: W(1_500, 40) },
  };
  expect(evaluateCreative([bare], cfg).recommendations).toEqual([]);
});

test('a young ad set is protected — it is still learning, not failing', () => {
  const young = { ...adSet('young', GENERAL_ENE26), ageDays: 1 };
  expect(evaluateCreative([young], cfg).recommendations).toEqual([]);
});

test('an ad set already condemned by a pause trigger gets no creative advice', () => {
  // No point proposing a creative experiment inside a set we are about to shut off.
  const skip = new Set(['gen']);
  expect(evaluateCreative([adSet('gen', GENERAL_ENE26)], cfg, skip).recommendations).toEqual([]);
});

// --- The iteration trail --------------------------------------------------------------
// The loop is only a loop if the next creative REMEMBERS which creative it came from.
// media.assets already has the plumbing (origin_ref.sourceAssetIds -> media_get_asset_usage),
// and until now nothing fed it: generation dropped the reference ids it was grounded on.

test('the seed carries the winner LIBRARY ASSET id — the head of the iteration chain', () => {
  // "Vivo47 VR Dic25" is the one winner on the live account that IS in the Library
  // (asset b6959144…, imported). It is also the only one Meta rates AVERAGE — i.e. the one
  // creative on the whole account genuinely worth replicating.
  const inLibrary: CreativeStanding = {
    ...VR_DIC25,
    winner: { ...VR_DIC25.winner!, assetId: 'b6959144-eeda-4dd3-9f3a-2aa1bd5a7d0c' },
  };
  const { recommendations } = evaluateCreative([adSet('vr', inLibrary)], cfg);
  const seed = recommendations.find((r) => r.kind === 'variate_creative')?.seed;

  // This is the id generation grounds on, AND the id the derived asset records as its
  // parent. Without it you can make a similar creative; you cannot prove it descended from
  // the one that won, or later ask whether it beat it.
  expect(seed?.winnerAssetId).toBe('b6959144-eeda-4dd3-9f3a-2aa1bd5a7d0c');
  expect(seed?.rebuildCraft).toBe(false); // rated AVERAGE — clone the craft too
});

test('a winner that is NOT in the Library says so, instead of promising a generation it cannot do', () => {
  // The norm on a real account: 39 of 41 creatives have never been imported. A confident
  // "make more of this" here would fail at the generation hop and read as a bug rather than
  // as a missing import.
  const { recommendations } = evaluateCreative(
    [adSet('vr', { ...VR_DIC25, flags: [...VR_DIC25.flags, 'winner_not_in_library'] })],
    cfg,
  );
  const rec = recommendations.find((r) => r.kind === 'variate_creative');

  expect(rec?.seed?.winnerAssetId).toBeNull();
  expect(rec?.reason).toContain('not in the Library yet');
  expect(rec?.reason).toContain('import it from the ad account first');
  expect(rec?.seed?.groundedOn).toContain('trust: winner_not_in_library');
});

// --- The creative that spends money and produces nothing -------------------------------
// The single failure this whole feature exists to catch — and the one it could not see. The
// standing's laggards were filtered `where cpa is not null`, and an ad that CLEARED the
// evidence floor, spent real money, and converted ZERO has a null cost-per-event. So it was
// dropped from the list, worstLaggard skipped it, and the ad set earned no pause_ad and no
// withheld raise. Every other laggard at least bought something.

const ZERO_CONVERSION: CreativeStanding = {
  winner: {
    adId: 'ad_works',
    adName: 'The one that works',
    qualityRanking: 'AVERAGE',
    spend: 900,
    events: 60,
    costPerEvent: 15.0,
    labels: { hookArchetype: 'value_stack' },
  },
  laggards: [
    // Expensive, but it does buy conversations.
    {
      adId: 'ad_pricey',
      adName: 'Pricey but working',
      spend: 400,
      events: 10,
      costPerEvent: 40.0,
      vsWinner: 2.67,
    },
    // Cleared the evidence floor. Spent $612. Produced NOTHING. No multiple exists.
    {
      adId: 'ad_bonfire',
      adName: 'The bonfire',
      verdict: 'kill',
      qualityRanking: 'BELOW_AVERAGE_20',
      spend: 612,
      events: 0,
      costPerEvent: null,
      vsWinner: null,
    },
  ],
  eligibleAds: 3,
  totalAds: 3,
  killSpendShare: 0.32,
  belowAvgSpendShare: 0.62, // over the drag threshold
  medianCostPerEvent: 40.0,
  flags: ['low_evidence'],
};

test('a creative that spent real money and converted NOTHING is the worst laggard, not an absent one', () => {
  const { recommendations, noRaiseIds } = evaluateCreative(
    [adSet('bonfire', ZERO_CONVERSION)],
    cfg,
  );
  const pause = recommendations.find((r) => r.kind === 'pause_ad');

  // It must outrank the 2.67x laggard. An ad at 2.67x is expensive; an ad at $612 and no
  // results is not expensive, it is a fire.
  expect(pause?.adId).toBe('ad_bonfire');
  expect(pause?.severity).toBe('high');
  expect(noRaiseIds.has('bonfire')).toBe(true);
});

test('and its reason states the zero plainly, instead of inventing a multiple', () => {
  const { recommendations } = evaluateCreative([adSet('bonfire', ZERO_CONVERSION)], cfg);
  const reason = recommendations.find((r) => r.kind === 'pause_ad')?.reason ?? '';

  expect(reason).toContain('$612.00');
  expect(reason).toContain('produced NO conversations at all');
  // You cannot divide by zero results. "0.00x" would be a fabricated figure about the single
  // most important ad in the set.
  expect(reason).not.toContain('0.00x');
  expect(reason).not.toContain('NaN');
  expect(reason).not.toContain('Infinity');
});

// --- BOUNDARIES ------------------------------------------------------------------------
// The constants that decide when a finding is real, exercised right at their edges.

/** A minimal, non-real standing knob for the threshold boundaries — a priced winner and one
 *  priced laggard, with the two spend-share dials passed in. */
const standing = (opts: {
  vsWinner: number;
  killShare?: number;
  belowAvgShare?: number;
  winnerCost?: number;
  laggardCost?: number;
}): CreativeStanding => {
  const winnerCost = opts.winnerCost ?? 20;
  return {
    winner: {
      adId: 'w',
      adName: 'Winner',
      qualityRanking: 'AVERAGE',
      spend: 500,
      events: Math.round(500 / winnerCost),
      costPerEvent: winnerCost,
      labels: { hookArchetype: 'value_stack' },
    },
    laggards: [
      {
        adId: 'lag',
        adName: 'Laggard',
        spend: 300,
        events: 10,
        costPerEvent: opts.laggardCost ?? winnerCost * opts.vsWinner,
        vsWinner: opts.vsWinner,
      },
    ],
    eligibleAds: 2,
    totalAds: 2,
    killSpendShare: opts.killShare ?? 0,
    belowAvgSpendShare: opts.belowAvgShare ?? 0,
    medianCostPerEvent: winnerCost,
    flags: [],
  };
};

test(`C1 drag fires exactly at the DRAG_SPEND_SHARE threshold (${DRAG_SPEND_SHARE}), not below it`, () => {
  // belowAvgSpendShare === 0.5 (the threshold) with a real laggard => withhold the raise.
  const at = evaluateCreative(
    [adSet('at', standing({ vsWinner: 1.5, belowAvgShare: DRAG_SPEND_SHARE }))],
    cfg,
  );
  expect(at.noRaiseIds.has('at')).toBe(true);
  expect(at.recommendations.find((r) => r.kind === 'pause_ad')?.trigger).toBe('C1_creative_drag');

  // A hair below the majority => the ad set is still mostly funding un-condemned creatives: no drag.
  const below = evaluateCreative(
    [adSet('below', standing({ vsWinner: 1.5, belowAvgShare: DRAG_SPEND_SHARE - 0.01 }))],
    cfg,
  );
  expect(below.noRaiseIds.has('below')).toBe(false);
  expect(below.recommendations.some((r) => r.kind === 'pause_ad')).toBe(false);
});

test(`a laggard must reach LAGGARD_COST_MULTIPLE (${LAGGARD_COST_MULTIPLE}x) before it is acted on`, () => {
  // Drag share is over the line, so the only variable is whether the laggard's multiple clears
  // the cost-multiple gate. At 1.25x it does — pause the ad and withhold the raise.
  const at = evaluateCreative(
    [adSet('at', standing({ vsWinner: LAGGARD_COST_MULTIPLE, killShare: 0.6 }))],
    cfg,
  );
  expect(at.recommendations.find((r) => r.kind === 'pause_ad')?.adId).toBe('lag');
  expect(at.noRaiseIds.has('at')).toBe(true);

  // Just under 1.25x: no laggard qualifies, so there is nothing to pause AND no winner claim
  // (C2 needs a laggard to compare against) — the drag share alone withholds nothing.
  const below = evaluateCreative(
    [adSet('below', standing({ vsWinner: LAGGARD_COST_MULTIPLE - 0.01, killShare: 0.6 }))],
    cfg,
  );
  expect(below.recommendations.some((r) => r.kind === 'pause_ad')).toBe(false);
  expect(below.recommendations.some((r) => r.kind === 'variate_creative')).toBe(false);
  expect(below.noRaiseIds.has('below')).toBe(false);
});

test('C2 winner severity is high only once the gap reaches 2x, medium below it', () => {
  // No drag (shares 0), so the winner recommendation stands alone and its severity tracks the gap.
  const high = evaluateCreative([adSet('high', standing({ vsWinner: 2.0 }))], cfg);
  expect(high.recommendations.find((r) => r.kind === 'variate_creative')?.severity).toBe('high');

  const medium = evaluateCreative([adSet('medium', standing({ vsWinner: 1.99 }))], cfg);
  expect(medium.recommendations.find((r) => r.kind === 'variate_creative')?.severity).toBe(
    'medium',
  );
});

test('a single-creative ad set that never spent (totalAds 0) yields no seed_experiment', () => {
  // C3 only speaks about an ad set actually spending money: one creative AND zero ads run is
  // silence, not a finding.
  const empty: CreativeStanding = {
    winner: null,
    laggards: [],
    eligibleAds: 0,
    totalAds: 0,
    killSpendShare: null,
    belowAvgSpendShare: null,
    medianCostPerEvent: null,
    flags: ['single_creative'],
  };
  expect(evaluateCreative([adSet('empty', empty)], cfg).recommendations).toEqual([]);
});

// eventLabel() maps the declared KPI to its grounding noun and runs for every evaluable
// standing (creative.ts:191), before any trigger. Cycling the declared kpiFields lands each
// switch arm — the grounding noun must never be a generic "conversions" for a lead/click buy.
test('eventLabel covers every declared kpiField grounding noun', () => {
  const kpis: Array<NonNullable<AdSetSnapshot['kpiField']>> = [
    'leads',
    'purchases',
    'linkClicks',
    'landingPageViews',
    'thruplays',
    'postEngagement',
  ];
  for (const kpiField of kpis) {
    const s: AdSetSnapshot = { ...adSet('lbl', GENERAL_ENE26), kpiField };
    expect(() => evaluateCreative([s], cfg)).not.toThrow();
  }
});
