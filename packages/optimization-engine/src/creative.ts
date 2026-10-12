// ---------------------------------------------------------------------------
// Stage C — the CREATIVE triggers. The budget engine's blind spot, and the point
// of the product.
//
// A budget engine can only move money between ad sets. But an ad set is a budget and an
// audience; the thing that actually works or doesn't is the CREATIVE inside it. On a real
// account, two creatives sitting in the SAME ad set — same audience, same budget, same
// optimization goal — differed by 2.22x in cost per result. No budget decision can
// recover that, because the money was already in the right ad set. It was on the wrong ad.
//
// Inside one ad set, audience/budget/goal are held constant, so the relative standing of
// its creatives is the only clean read on the creative anywhere in the account. Across ad
// sets, Meta's delivery optimization is the confound. NOTHING here compares two ad sets.
//
// Three states, three actions:
//
//   C1 drag        spend is concentrated on a creative we already judged   -> pause the AD,
//                  (verdict=kill, or Meta rates it below its auction peers)   and do NOT
//                                                                             raise the set
//   C2 winner      a creative measurably beats its peers                   -> make VARIATIONS
//                                                                             of it
//   C3 no variance fewer than two creatives ever competed                  -> CREATE the
//                                                                             comparison
//
// C3 is the most common state on a real account (and the one no budget maths can fix): an
// ad set running a single creative is not an experiment, it is an assertion. The product's
// job there is to manufacture the variance that makes a winner knowable in the first place.
//
// Every recommendation needs approval. The engine never auto-acts, and it never claims a
// winner it cannot see: with fewer than two eligible creatives the standing withholds the
// winner and C2 does not fire.
// ---------------------------------------------------------------------------

import { formatMoney, type RecommendationWinner } from '@continuum/contracts';
import { isCreativeEvaluable } from './classify';
import type { EngineConfig } from './config';
import { readDecay } from './decay';
import { kpiEvents } from './scoring';
import {
  action,
  currencyCode,
  entityOf,
  moneyPerResultUnit,
  resultNounPlural,
  title,
  titleMoney,
} from './title';
import type {
  AdSetSnapshot,
  CreativeStanding,
  CreativeStandingAd,
  CreativeVariationSeed,
  Recommendation,
} from './types';
import { perDayOver } from './windows';

/** The ad a creative title names first: by name, by id when it has none. */
const adEntity = (ad: Pick<CreativeStandingAd, 'adId' | 'adName'>): string =>
  ad.adName?.trim() || ad.adId;

/** A laggard must cost at least this much MORE than the winner before we act on the gap.
 *  Below it, the difference is noise dressed as a finding — these are small ad sets and a
 *  10% spread between two creatives is not evidence that one of them is better. */
export const LAGGARD_COST_MULTIPLE = 1.25;

/** Share of an ad set's spend that must sit on already-judged creatives before we withhold
 *  a raise. Set at a majority: below half, the ad set is still mostly funding creatives we
 *  have not condemned, and freezing its budget would punish the innocent ones. */
export const DRAG_SPEND_SHARE = 0.5;

// --- C5: displacement, and the diversity number it depends on ---------------
// Two creatives in one ad set are not two independent experiments — they are two
// competitors in the SAME auction, and Meta concentrates delivery on whichever it
// currently believes in. Measured on live data, the top creative takes ~95% of an ad
// set's impressions even where four or more creatives are live.
//
// That has a consequence the engine used to get wrong in both directions. A creative
// whose delivery collapses has not necessarily worn out — it may simply have lost, while
// the ad set beside it is perfectly healthy. And "add another creative so the load is
// shared" does not follow: if the auction will not spread delivery, a fifth creative
// changes the count and not the concentration.

/** A creative's recent impression share must fall below this fraction of its own
 *  baseline share to count as displaced. Not a small drift — a collapse. */
export const DISPLACEMENT_SHARE_COLLAPSE = 0.4;

/** ...and it must have HAD a real share to lose. An ad that never got delivery was not
 *  displaced; it was never in the running. */
export const DISPLACEMENT_MIN_BASELINE_SHARE = 0.15;

/** ...while the AD SET's own daily delivery held up. If the whole set fell away, the
 *  creative did not lose an auction — everything stopped, and that is stage D's finding. */
export const DISPLACEMENT_SET_DELIVERY_HELD = 0.7;

/**
 * Effective number of creatives actually sharing an ad set's delivery — the exponential
 * of the Shannon entropy of the impression shares.
 *
 * Reported instead of a raw count because the raw count is misleading in the exact case
 * people reach for it: an ad set running five creatives where one takes 95% of the
 * impressions has an effective count near 1.2, and behaves like an ad set running one.
 * Null when nothing delivered — never 0, which would read as a measurement.
 */
export function effectiveCreativeCount(impressions: number[]): number | null {
  const total = impressions.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (total <= 0) return null;
  let entropy = 0;
  for (const raw of impressions) {
    const share = Math.max(0, raw) / total;
    if (share > 0) entropy -= share * Math.log(share);
  }
  return Math.exp(entropy);
}

/** Money in the ad account's own currency — bare when the account records none. */
const money = (v: number, cfg: EngineConfig): string => formatMoney(v, cfg.currency);
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** The winner as a structured figure, or undefined when it is not priced. A winner that
 *  bought nothing has no cost per result: omitted, never written as 0 — a zero on the wire is
 *  a figure a card will draw (the zero-comparator lesson, from the winner's side). */
function winnerEvidence(winner: CreativeStandingAd): RecommendationWinner | undefined {
  const cost = winner.costPerEvent;
  if (cost == null || !(cost > 0) || !(winner.events > 0) || !(winner.spend > 0)) {
    return undefined;
  }
  return {
    ad_id: winner.adId,
    ad_name: winner.adName ?? null,
    cost_per_result: round2(cost),
    results: winner.events,
    spend: round2(winner.spend),
  };
}

const isBelowAverage = (ranking: string | null | undefined): boolean =>
  (ranking ?? '').toUpperCase().startsWith('BELOW_AVERAGE');

/** The event this ad set was buying, in words. Never "conversions" generically — the whole
 *  failure this system exists to prevent is a cost-per-conversation narrated as a CPA. */
function eventLabel(s: AdSetSnapshot): string {
  switch (s.kpiField) {
    case 'conversations':
      return 'conversation';
    case 'leads':
      return 'lead';
    case 'purchases':
      return 'purchase';
    case 'linkClicks':
      return 'link click';
    case 'landingPageViews':
      return 'landing-page view';
    case 'thruplays':
      return 'thruplay';
    case 'postEngagement':
      return 'engagement';
    default:
      return 'result';
  }
}

/** An eligible creative that spent real money and produced NOTHING.
 *
 *  `costPerEvent: null` here is not a missing measurement — the ad cleared the evidence floors,
 *  so we measured it properly and the answer was zero. There is no multiple to compute (you
 *  cannot divide by zero results), which is exactly why it must be handled separately instead
 *  of being filtered out for having a null. It is the worst laggard there is: every other
 *  laggard at least bought something. */
const isZeroConversion = (l: CreativeStandingAd): boolean =>
  l.costPerEvent === null && l.events === 0 && l.spend > 0;

/** The worst-value creative that is actually carrying money — the one to pause.
 *
 *  Zero-conversion creatives outrank every priced laggard, however bad the multiple. An ad at
 *  2.2x the winner is expensive; an ad at $500 and no results is not expensive, it is a fire. */
function worstLaggard(standing: CreativeStanding): CreativeStandingAd | null {
  const zeroConversion = standing.laggards.filter(isZeroConversion);
  if (zeroConversion.length > 0) {
    // Biggest fire first.
    return [...zeroConversion].sort((a, b) => b.spend - a.spend)[0];
  }

  const candidates = standing.laggards.filter(
    (l) => l.costPerEvent !== null && (l.vsWinner ?? 0) >= LAGGARD_COST_MULTIPLE,
  );
  if (candidates.length === 0) return null;
  // Most wasteful first; ties broken by spend, because the same multiple on more money is
  // a bigger fire.
  return [...candidates].sort(
    (a, b) => (b.vsWinner ?? 0) - (a.vsWinner ?? 0) || b.spend - a.spend,
  )[0];
}

/** The creative a winner is measured AGAINST — one that actually bought something.
 *
 *  A laggard with no results has no cost per result, so "vs $0.00, 0.00x" is not a
 *  comparison; it is a division by zero dressed as one, and it shipped on a live card. C1
 *  already says of that ad that it bought nothing. The comparator is the priciest laggard
 *  that cleared LAGGARD_COST_MULTIPLE; when no laggard is priced there is no comparison to
 *  make, and C2 does not fire (the refusal is named at the queue's gate, not here). */
function pricedComparator(standing: CreativeStanding): CreativeStandingAd | null {
  const priced = standing.laggards.filter(
    (l) => l.costPerEvent !== null && l.events > 0 && (l.vsWinner ?? 0) >= LAGGARD_COST_MULTIPLE,
  );
  if (priced.length === 0) return null;
  return [...priced].sort((a, b) => (b.vsWinner ?? 0) - (a.vsWinner ?? 0) || b.spend - a.spend)[0];
}

/** Deterministic citations. Assembled BEFORE any model runs, and the only thing a model is
 *  ever allowed to rephrase. */
function buildGroundedOn(
  s: AdSetSnapshot,
  standing: CreativeStanding,
  cfg: EngineConfig,
): string[] {
  const unit = eventLabel(s);
  const out: string[] = [];
  const w = standing.winner;

  if (w?.costPerEvent != null) {
    out.push(
      `winner: "${w.adName ?? w.adId}" at ${money(w.costPerEvent, cfg)} per ${unit} on ${money(w.spend, cfg)} of spend (${w.events} ${unit}s)`,
    );
  }
  for (const l of standing.laggards.slice(0, 2)) {
    if (l.costPerEvent == null) continue;
    out.push(
      `same ad set: "${l.adName ?? l.adId}" at ${money(l.costPerEvent, cfg)} per ${unit}${
        l.vsWinner ? ` (${l.vsWinner.toFixed(2)}x the winner)` : ''
      }`,
    );
  }
  if (standing.medianCostPerEvent != null) {
    out.push(`ad-set median: ${money(standing.medianCostPerEvent, cfg)} per ${unit}`);
  }
  // The comparison is only worth anything because of this. Say it.
  out.push('audience, budget and optimization goal held constant (same ad set)');

  if (w && isBelowAverage(w.qualityRanking)) {
    out.push(
      `Meta rates the winner ${w.qualityRanking} against its auction peers — the angle won, the craft did not`,
    );
  }
  for (const flag of standing.flags) out.push(`trust: ${flag}`);
  return out;
}

function buildSeed(
  s: AdSetSnapshot,
  standing: CreativeStanding,
  cfg: EngineConfig,
): CreativeVariationSeed {
  const w = standing.winner;
  return {
    adSetId: s.id,
    winnerAdId: w?.adId,
    winnerCreativeRowId: w?.creativeRowId ?? null,
    // The head of the iteration chain. Generation grounds on this asset, and the asset it
    // produces records this id as its parent — which is the whole difference between an
    // iteration you can measure and one you merely remember making.
    winnerAssetId: w?.assetId ?? null,
    labels: w?.labels ?? null,
    posterUrl: w?.posterUrl ?? null,
    rebuildCraft: isBelowAverage(w?.qualityRanking),
    groundedOn: buildGroundedOn(s, standing, cfg),
  };
}

/**
 * Per-ad decay findings for one ad set. Pure: no side effects, no ordering assumptions.
 *
 * The evidence floor is the point, not a nicety. A single ad's 3-day conversion count is
 * routinely 0-2, and 51 of 53 live ad sets already carry `low_evidence`. Below the floor
 * this returns NOTHING — it does not return a hedged finding, because a hedged finding is
 * how noise gets industrialized. `optimizer:creative:winrate:bench` makes the same refusal
 * when it reports 0 of 27 steerable buckets instead of a confident-looking win rate.
 */
function readCreativeDecay(
  s: AdSetSnapshot,
  standing: CreativeStanding,
  cfg: EngineConfig,
  unit: string,
): Recommendation[] {
  const series = s.creativeSeries;
  if (!series || series.length === 0) return []; // no series -> unknown, not flat

  const out: Recommendation[] = [];
  const thresholds = {
    cpaDriftPct: cfg.creativeDecayCpaDriftPct,
    ctrDropPct: cfg.creativeDecayCtrDropPct,
  };
  // The standing is enrichment only. It is EMPTY for a single-creative ad set (no winner,
  // no laggards), which is the case this trigger exists to serve — so nothing here may
  // depend on finding a match.
  const named = new Map<string, CreativeStandingAd>();
  for (const ad of [standing.winner, ...standing.laggards]) if (ad) named.set(ad.adId, ad);

  for (const entry of series) {
    const { d3, d14 } = entry.windows;
    if (kpiEvents(d14, cfg) < cfg.creativeDecayMinEvents) continue; // evidence floor

    const decay = readDecay(d3, d14, cfg, thresholds);
    // Both conditions, exactly as F1 requires them one level up: cost rising AND
    // engagement falling. Either alone is a bad week, not a worn-out creative.
    if (!decay.convertsInBothWindows || !decay.cpaRising || !decay.ctrDropped) continue;

    const label = entry.adName ?? named.get(entry.adId)?.adName ?? entry.adId;
    out.push({
      adSetId: s.id,
      adId: entry.adId,
      kind: 'variate_creative',
      trigger: 'C4_creative_decay',
      // A winner going bad is the more urgent fact: it is where the money is.
      severity: entry.adId === standing.winner?.adId ? 'high' : 'medium',
      reason:
        `"${label}" is wearing out against its own history, not against its neighbours: ` +
        `cost per ${unit} is up ${decay.cpaUpPct.toFixed(0)}% (3d ${money(decay.cppRecent, cfg)} vs 14d ${money(decay.cppBase, cfg)}) ` +
        `while CTR is down ${decay.ctrDownPct.toFixed(0)}% (3d ${(decay.ctrRecent * 100).toFixed(2)}% vs 14d ${(decay.ctrBase * 100).toFixed(2)}%), ` +
        `on ${d14.impressions} impressions over 14 days. The audience has seen it. Refresh it.`,
      seed: buildSeed(s, standing, cfg),
      // The ad's own recent cost per result is the figure; its 14-day self is the
      // comparison, with the CTR drop that makes this decay rather than a bad week.
      evidence: {
        metric: 'cpp',
        value: round2(decay.cppRecent),
        comparator: `up ${decay.cpaUpPct.toFixed(0)}% vs its own 14d (${money(decay.cppBase, cfg)}), CTR down ${decay.ctrDownPct.toFixed(0)}%`,
        threshold: round2(decay.cppBase),
        window: 'd3',
        estImpactPerDay: null,
        title: title({
          entity: label,
          figure: decay.cppRecent,
          unit: moneyPerResultUnit(cfg, s),
          comparator: `+${decay.cpaUpPct.toFixed(0)}% frente a sus 14 días (${titleMoney(decay.cppBase, cfg)}) con CTR ${decay.ctrDownPct.toFixed(0)}% menor, en ${d14.impressions} impresiones`,
          window: 'd3',
        }),
        action: action('variate_creative', cfg),
        source: 'engine',
      },
      needsApproval: true,
    });
  }

  return out;
}

/**
 * Per-ad displacement findings for one ad set: creatives that stopped being delivered
 * because a sibling took the auction, NOT because they wore out.
 *
 * The two look identical from the ad's own numbers — cost per result gets noisy, results
 * dry up — and they call for opposite actions. A worn-out creative needs replacing. A
 * displaced one needs nothing: the ad set is already spending its money on the creative
 * that beat it, which is the system working. Telling a human to refresh it is asking for
 * work that changes no outcome.
 *
 * The discriminator is share, not level. Every ad in a slowing ad set loses impressions;
 * only a displaced one loses SHARE while the ad set's own delivery holds.
 */
function readDisplacement(
  s: AdSetSnapshot,
  standing: CreativeStanding,
  cfg: EngineConfig,
): Recommendation[] {
  const series = s.creativeSeries;
  if (!series || series.length < 2) return []; // one creative cannot be out-competed

  // Did the AD SET keep delivering? Per-day, because d3 and d14 are different lengths — and
  // each divides by its OWN name, so the two sides of the ratio are on one scale. They were
  // not while the ingest gave d3 four dates and d14 fifteen: the recent rate came out ~33%
  // high against a base ~7% high, and the mismatch moved the ratio this rule fires on.
  const setRecentPerDay = perDayOver(s.windows.d3.impressions, 'd3');
  const setBasePerDay = perDayOver(s.windows.d14.impressions, 'd14');
  if (setBasePerDay <= 0) return [];
  if (setRecentPerDay / setBasePerDay < DISPLACEMENT_SET_DELIVERY_HELD) return [];

  const recentTotal = series.reduce((sum, e) => sum + e.windows.d3.impressions, 0);
  const baseTotal = series.reduce((sum, e) => sum + e.windows.d14.impressions, 0);
  if (recentTotal <= 0 || baseTotal <= 0) return [];

  const named = new Map<string, CreativeStandingAd>();
  for (const ad of [standing.winner, ...standing.laggards]) if (ad) named.set(ad.adId, ad);

  const effective = effectiveCreativeCount(series.map((e) => e.windows.d14.impressions));
  const out: Recommendation[] = [];

  for (const entry of series) {
    const baseShare = entry.windows.d14.impressions / baseTotal;
    if (baseShare < DISPLACEMENT_MIN_BASELINE_SHARE) continue; // never in the running
    const recentShare = entry.windows.d3.impressions / recentTotal;
    if (recentShare >= baseShare * DISPLACEMENT_SHARE_COLLAPSE) continue; // still competing

    // The separation from C4. If engagement fell too, the creative is worn out and C4
    // owns it — the auction only reflected what the audience already decided.
    const decay = readDecay(entry.windows.d3, entry.windows.d14, cfg, {
      cpaDriftPct: cfg.creativeDecayCpaDriftPct,
      ctrDropPct: cfg.creativeDecayCtrDropPct,
    });
    if (decay.ctrDropped) continue;

    const label = entry.adName ?? named.get(entry.adId)?.adName ?? entry.adId;
    const spread =
      effective === null
        ? ''
        : ` This ad set runs ${series.length} creatives but spreads delivery like ${effective.toFixed(1)} — adding another mostly feeds the same winner.`;
    out.push({
      adSetId: s.id,
      adId: entry.adId,
      kind: 'pause_ad',
      trigger: 'C5_auction_displacement',
      severity: 'low',
      reason:
        `"${label}" fell from ${(baseShare * 100).toFixed(0)}% to ${(recentShare * 100).toFixed(0)}% of this ad set's impressions while the ad set itself kept delivering, ` +
        `and its click-through never dropped. It did not wear out — it lost the auction to a creative beside it. ` +
        `Refreshing it changes nothing; retire it and put the slot behind the winner.${spread}`,
      // The recent impression share is the figure and its own baseline share is the
      // comparison; the ad set's steady delivery is what makes it a loss, not a slowdown.
      evidence: {
        metric: 'impression_share',
        value: Math.round(recentShare * 100),
        comparator: `down from ${(baseShare * 100).toFixed(0)}% of the ad set's impressions while the ad set kept delivering`,
        threshold: Math.round(baseShare * DISPLACEMENT_SHARE_COLLAPSE * 100),
        window: 'd3',
        estImpactPerDay: null,
        title: title({
          entity: label,
          figure: Math.round(recentShare * 100),
          unit: '% de las impresiones del conjunto en 3 días',
          comparator: `antes ${(baseShare * 100).toFixed(0)}% en 14 días, con la entrega del conjunto estable y el CTR igual`,
          window: 'd3',
        }),
        action: action('pause_ad', cfg),
        source: 'engine',
      },
      needsApproval: true,
    });
  }

  return out;
}

export type CreativeOutput = {
  recommendations: Recommendation[];
  /** Ad sets that must not GROW this cycle: their money is on a creative we have already
   *  judged, so a raise would fund the loser. They keep what they have — this is not a
   *  starve. */
  noRaiseIds: Set<string>;
};

export function evaluateCreative(
  snapshots: AdSetSnapshot[],
  cfg: EngineConfig,
  skipIds: Set<string> = new Set(),
): CreativeOutput {
  const recommendations: Recommendation[] = [];
  const noRaiseIds = new Set<string>();

  for (const s of snapshots) {
    // A CBO ad set is frozen for BUDGET, not because its creatives cannot be judged —
    // and it is the case where a creative swap is the only lever left. See
    // isCreativeEvaluable.
    if (!isCreativeEvaluable(s) || skipIds.has(s.id)) continue;
    const standing = s.creative;
    if (!standing) continue; // never labeled / never synced — silence, not a finding
    if (s.ageDays <= cfg.newItemProtectDays) continue; // still learning

    const unit = eventLabel(s);

    // --- C4: this creative is DECAYING ---------------------------------------------
    // Computed here, emitted below, because it answers a DIFFERENT question from C1/C2/C3.
    // Those three compare creatives to EACH OTHER, which is why one creative alone tells
    // them nothing. C4 compares a creative to its OWN past, so a lone creative is a
    // perfectly valid subject — and 37 of 53 live ad sets run exactly one creative, which
    // makes this the only question answerable there at all.
    //
    // Ranking says "this costs 2.2x the one beside it". Decay says "this is dying". They
    // are not the same finding and the second was not computable at all until the per-ad
    // series arrived.
    //
    // Needs `ad.windows`, present only when ad-level attribution landed this cycle AND the
    // portfolio opted in. Absent is UNKNOWN, not flat: no windows, no finding, no hedge.
    const decayFindings = readCreativeDecay(s, standing, cfg, unit);

    // --- C5: this creative was DISPLACED, not worn out -----------------------------
    // Same inputs as C4, opposite conclusion. See readDisplacement for why the two must
    // not arrive as the same card: one asks for a new creative, the other asks for none.
    const displacementFindings = readDisplacement(s, standing, cfg);

    // --- C3: nothing to learn from -------------------------------------------------
    // Checked FIRST because it is a statement about what we can know, not about what is
    // true. An ad set with one creative cannot tell you that creative is good; it can only
    // tell you it is the only one that ran. Every other trigger below would be inventing
    // evidence out of a sample of one.
    if (standing.flags.includes('single_creative')) {
      // Only worth saying about an ad set actually spending money.
      if (standing.winner === null && standing.totalAds > 0) {
        // Say WHY there is nothing to compare, when we can tell. An ad set with one ad
        // needs another ad. An ad set with four ads where delivery behaves like 1.2 does
        // not — it already has the variants, and the auction is refusing to spread across
        // them. Those two need different work, and "add variants" only fits the first.
        const effective =
          s.creativeSeries && s.creativeSeries.length > 1
            ? effectiveCreativeCount(s.creativeSeries.map((e) => e.windows.d14.impressions))
            : null;
        const concentrated = effective !== null && effective < 2;
        recommendations.push({
          adSetId: s.id,
          kind: 'seed_experiment',
          trigger: 'C3_no_variance',
          severity: 'medium',
          reason: concentrated
            ? `${standing.totalAds} creatives are live here, but delivery is concentrated enough to behave like ${(effective as number).toFixed(1)} — only ${standing.eligibleAds} got enough of it to judge. ` +
              `Adding another variant will most likely feed the same winner. The constraint is the auction's concentration, not your creative count: split the losing creatives into their own ad set if you need them measured.`
            : `Only ${standing.eligibleAds} creative has enough delivery to judge in this ad set, so nothing here can tell you which creative works — ` +
              `there was nothing for it to beat. Add variants to create the comparison.`,
          seed: buildSeed(s, standing, cfg),
          // The count of creatives that can be judged is the figure; the count that are
          // live is the comparison — and, when delivery is concentrated, the number the
          // ad set behaves like.
          evidence: {
            metric: 'eligible_ads',
            value: standing.eligibleAds,
            comparator: concentrated
              ? `of ${standing.totalAds} live, delivery behaves like ${(effective as number).toFixed(1)}`
              : `of ${standing.totalAds} live`,
            threshold: 2,
            window: 'd14',
            estImpactPerDay: null,
            title: title({
              entity: entityOf(s),
              figure: standing.eligibleAds,
              unit:
                standing.eligibleAds === 1
                  ? 'creativo con entrega suficiente para juzgar'
                  : 'creativos con entrega suficiente para juzgar',
              comparator: concentrated
                ? `de ${standing.totalAds} activos, con la entrega concentrada como en ${(effective as number).toFixed(1)}`
                : `de ${standing.totalAds} activos en 14 días`,
              window: 'd14',
            }),
            action: action('seed_experiment', cfg),
            source: 'engine',
          },
          needsApproval: true,
        });
      }
      // A single creative has no peer, but it does have a past. This is the one trigger
      // C3's "sample of one" objection does not apply to.
      recommendations.push(...decayFindings);
      continue;
    }

    // --- C1: drag ------------------------------------------------------------------
    const killShare = standing.killSpendShare ?? 0;
    const belowAvgShare = standing.belowAvgSpendShare ?? 0;
    const dragging = killShare >= DRAG_SPEND_SHARE || belowAvgShare >= DRAG_SPEND_SHARE;
    const laggard = worstLaggard(standing);

    if (dragging && laggard) {
      // Withhold the raise. Not a starve: the ad set may be fine, and its winner may be
      // excellent. We simply refuse to put MORE money into a set whose money is landing on
      // a creative we have already judged.
      noRaiseIds.add(s.id);

      const why =
        killShare >= DRAG_SPEND_SHARE
          ? `${pct(killShare)} of this ad set's spend is on creatives already judged kill`
          : `${pct(belowAvgShare)} of this ad set's spend is on creatives Meta rates below its auction peers`;

      recommendations.push({
        adSetId: s.id,
        adId: laggard.adId,
        kind: 'pause_ad',
        trigger: 'C1_creative_drag',
        severity: isZeroConversion(laggard) || killShare >= DRAG_SPEND_SHARE ? 'high' : 'medium',
        reason: isZeroConversion(laggard)
          ? // No multiple, because there is nothing to divide by. Saying "0.00x" here would be a
            // fabricated figure about the most important ad in the set.
            `${why}. Inside this ad set — same audience, same budget — "${laggard.adName ?? laggard.adId}" has spent ` +
            `${money(laggard.spend, cfg)} and produced NO ${unit}s at all, while "${standing.winner?.adName ?? 'the winner'}" ` +
            `next to it buys one for ${money(standing.winner?.costPerEvent ?? 0, cfg)}. ` +
            `The budget is not the problem here; the creative is. Held at its current budget until it is fixed.`
          : `${why}. Inside this ad set — same audience, same budget — "${laggard.adName ?? laggard.adId}" costs ` +
            `${money(laggard.costPerEvent ?? 0, cfg)} per ${unit} against the winner's ` +
            `${money(standing.winner?.costPerEvent ?? 0, cfg)} (${(laggard.vsWinner ?? 0).toFixed(2)}x) on ${money(laggard.spend, cfg)} of spend. ` +
            `The budget is not the problem here; the creative is. Held at its current budget until it is fixed.`,
        // A laggard that bought nothing leads with its spend and "0 results"; a priced one
        // leads with its cost per result against the winner's, inside the same ad set.
        evidence: isZeroConversion(laggard)
          ? {
              metric: 'spend',
              value: round2(laggard.spend),
              comparator: `with 0 ${unit}s, vs the winner at ${money(standing.winner?.costPerEvent ?? 0, cfg)} per ${unit}`,
              threshold: null,
              window: 'd14',
              estImpactPerDay: perDayOver(laggard.spend, 'd14'),
              title: title({
                entity: adEntity(laggard),
                figure: laggard.spend,
                unit: currencyCode(cfg),
                comparator: `en 14 días y 0 ${resultNounPlural(cfg, s)}, mientras "${standing.winner ? adEntity(standing.winner) : 'el ganador'}" compra uno a ${titleMoney(standing.winner?.costPerEvent ?? 0, cfg)} en el mismo conjunto`,
                window: 'd14',
              }),
              action: action('pause_ad', cfg, { perDay: perDayOver(laggard.spend, 'd14') }),
              source: 'engine',
            }
          : {
              metric: 'cpp',
              value: round2(laggard.costPerEvent ?? 0),
              comparator: `${(laggard.vsWinner ?? 0).toFixed(2)}x the winner's ${money(standing.winner?.costPerEvent ?? 0, cfg)} per ${unit}, same ad set`,
              threshold: round2((standing.winner?.costPerEvent ?? 0) * LAGGARD_COST_MULTIPLE),
              window: 'd14',
              estImpactPerDay: perDayOver(laggard.spend, 'd14'),
              title: title({
                entity: adEntity(laggard),
                figure: laggard.costPerEvent ?? 0,
                unit: moneyPerResultUnit(cfg, s),
                comparator: `${(laggard.vsWinner ?? 0).toFixed(1)}× el ganador "${standing.winner ? adEntity(standing.winner) : 'el ganador'}" a ${titleMoney(standing.winner?.costPerEvent ?? 0, cfg)}, en ${titleMoney(laggard.spend, cfg)} de gasto`,
                window: 'd14',
              }),
              action: action('pause_ad', cfg, { perDay: perDayOver(laggard.spend, 'd14') }),
              source: 'engine',
            },
        needsApproval: true,
      });
    }

    // --- C2: a winner worth replicating --------------------------------------------
    // Fires alongside C1 on purpose: "pause the loser" and "make more of the winner" are
    // two halves of the same move, and an operator handed only the first is left with a
    // smaller ad set rather than a better one. Measured against a PRICED sibling, never
    // the zero-conversion one C1 is pausing — see pricedComparator.
    const winner = standing.winner;
    const comparator = pricedComparator(standing);
    // pricedComparator only returns a priced sibling; the second null check narrows it here.
    const comparatorCost = comparator?.costPerEvent ?? null;
    if (winner && comparator && winner.costPerEvent != null && comparatorCost != null) {
      const gap = comparator.vsWinner ?? 0;
      const seed = buildSeed(s, standing, cfg);
      // We know which creative won and we do not HAVE it. Say so, rather than issuing a
      // confident "make more of this" against an asset that does not exist — the loop would
      // fail at the generation hop and look like a bug instead of a missing import.
      const notInLibrary = standing.flags.includes('winner_not_in_library');
      const importFirst = notInLibrary
        ? ' This creative is not in the Library yet, so there is nothing to generate from — import it from the ad account first.'
        : '';
      recommendations.push({
        adSetId: s.id,
        adId: winner.adId,
        kind: 'variate_creative',
        trigger: 'C2_creative_winner',
        severity: gap >= 2 ? 'high' : 'medium',
        reason: seed.rebuildCraft
          ? // The single most important distinction in this file. The winner converts best
            // AND Meta is penalizing its craft — so the ANGLE is what won, and cloning the
            // execution would industrialize a creative the auction already dislikes.
            `"${winner.adName ?? winner.adId}" is the cheapest creative in this ad set at ${money(winner.costPerEvent, cfg)} per ${unit} ` +
            `(vs ${money(comparatorCost, cfg)}, ${gap.toFixed(2)}x, on the same audience and budget) — but Meta rates it ` +
            `${winner.qualityRanking} against its auction peers. Keep the angle, rebuild the execution: make variants that ` +
            `sell the same idea with stronger craft.${importFirst}`
          : `"${winner.adName ?? winner.adId}" is the cheapest creative in this ad set at ${money(winner.costPerEvent, cfg)} per ${unit} ` +
            `(vs ${money(comparatorCost, cfg)}, ${gap.toFixed(2)}x, on the same audience and budget). Make variants of it and ` +
            `let them compete.${importFirst}`,
        seed,
        evidence: {
          metric: 'cpp',
          value: round2(winner.costPerEvent),
          comparator: `vs ${money(comparatorCost, cfg)} (${gap.toFixed(2)}x) for a sibling creative, same audience and budget`,
          // C2's line is a MULTIPLE (LAGGARD_COST_MULTIPLE), not a cost — no threshold in the
          // metric's own unit to report.
          threshold: null,
          // The standing is read over d14 (paid_media_get_adset_creative_standing p_window).
          window: 'd14',
          // Making variants puts no measured money on the table; saying so beats inventing it.
          estImpactPerDay: null,
          headline: {
            kind: 'efficiency',
            value: Math.round((1 - winner.costPerEvent / comparatorCost) * 100),
            unit: 'percent',
            label: 'cheaper per result than a peer',
            from: round2(winner.costPerEvent),
            to: round2(comparatorCost),
          },
          winner: winnerEvidence(winner),
          // The winner's cost per result is the figure; the priced sibling it beat, inside
          // the same ad set, is the comparison. Meta's craft rating rides along when it
          // argues against cloning the execution.
          title: title({
            entity: adEntity(winner),
            figure: winner.costPerEvent,
            unit: moneyPerResultUnit(cfg, s),
            comparator: `${Math.round((1 - winner.costPerEvent / comparatorCost) * 100)}% menos que "${adEntity(comparator)}" a ${titleMoney(comparatorCost, cfg)} en el mismo conjunto${
              seed.rebuildCraft ? `, con calidad ${winner.qualityRanking} según Meta` : ''
            }`,
            window: 'd14',
          }),
          action: action('variate_creative', cfg),
          source: 'engine',
        },
        needsApproval: true,
      });
    }

    // One ad, one recommendation per cycle. Where C1 already says "pause this" or C2
    // already says "make more of this", adding "and it is decaying" hands an operator two
    // cards for one decision — and C1's pause is the stronger instruction anyway.
    // C4 (worn out) and C5 (out-competed) are mutually exclusive by construction —
    // readDisplacement drops any ad whose CTR also fell — but both defer to a pause or a
    // variate already claimed for the same ad, for the same reason: one ad, one card.
    const claimed = new Set(
      recommendations.filter((r) => r.adSetId === s.id && r.adId).map((r) => r.adId),
    );
    const perAd = [...decayFindings, ...displacementFindings];
    recommendations.push(...perAd.filter((r) => !claimed.has(r.adId)));
  }

  return { recommendations, noRaiseIds };
}
