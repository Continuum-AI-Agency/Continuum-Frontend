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

import type { EngineConfig } from './config';
import type {
  AdSetSnapshot,
  CreativeStanding,
  CreativeStandingAd,
  CreativeVariationSeed,
  Recommendation,
} from './types';

/** A laggard must cost at least this much MORE than the winner before we act on the gap.
 *  Below it, the difference is noise dressed as a finding — these are small ad sets and a
 *  10% spread between two creatives is not evidence that one of them is better. */
export const LAGGARD_COST_MULTIPLE = 1.25;

/** Share of an ad set's spend that must sit on already-judged creatives before we withhold
 *  a raise. Set at a majority: below half, the ad set is still mostly funding creatives we
 *  have not condemned, and freezing its budget would punish the innocent ones. */
export const DRAG_SPEND_SHARE = 0.5;

const isEvaluable = (s: AdSetSnapshot): boolean =>
  s.status !== 'frozen' && s.status !== 'flagged' && !s.freeze;

const money = (v: number): string => `$${v.toFixed(2)}`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;

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

/** Deterministic citations. Assembled BEFORE any model runs, and the only thing a model is
 *  ever allowed to rephrase. */
function buildGroundedOn(s: AdSetSnapshot, standing: CreativeStanding): string[] {
  const unit = eventLabel(s);
  const out: string[] = [];
  const w = standing.winner;

  if (w?.costPerEvent != null) {
    out.push(
      `winner: "${w.adName ?? w.adId}" at ${money(w.costPerEvent)} per ${unit} on ${money(w.spend)} of spend (${w.events} ${unit}s)`,
    );
  }
  for (const l of standing.laggards.slice(0, 2)) {
    if (l.costPerEvent == null) continue;
    out.push(
      `same ad set: "${l.adName ?? l.adId}" at ${money(l.costPerEvent)} per ${unit}${
        l.vsWinner ? ` (${l.vsWinner.toFixed(2)}x the winner)` : ''
      }`,
    );
  }
  if (standing.medianCostPerEvent != null) {
    out.push(`ad-set median: ${money(standing.medianCostPerEvent)} per ${unit}`);
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

function buildSeed(s: AdSetSnapshot, standing: CreativeStanding): CreativeVariationSeed {
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
    groundedOn: buildGroundedOn(s, standing),
  };
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
    if (!isEvaluable(s) || skipIds.has(s.id)) continue;
    const standing = s.creative;
    if (!standing) continue; // never labeled / never synced — silence, not a finding
    if (s.ageDays <= cfg.newItemProtectDays) continue; // still learning

    const unit = eventLabel(s);

    // --- C3: nothing to learn from -------------------------------------------------
    // Checked FIRST because it is a statement about what we can know, not about what is
    // true. An ad set with one creative cannot tell you that creative is good; it can only
    // tell you it is the only one that ran. Every other trigger below would be inventing
    // evidence out of a sample of one.
    if (standing.flags.includes('single_creative')) {
      // Only worth saying about an ad set actually spending money.
      if (standing.winner === null && standing.totalAds > 0) {
        recommendations.push({
          adSetId: s.id,
          kind: 'seed_experiment',
          trigger: 'C3_no_variance',
          severity: 'medium',
          reason:
            `Only ${standing.eligibleAds} creative has enough delivery to judge in this ad set, so nothing here can tell you which creative works — ` +
            `there was nothing for it to beat. Add variants to create the comparison.`,
          seed: buildSeed(s, standing),
          needsApproval: true,
        });
      }
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
            `${money(laggard.spend)} and produced NO ${unit}s at all, while "${standing.winner?.adName ?? 'the winner'}" ` +
            `next to it buys one for ${money(standing.winner?.costPerEvent ?? 0)}. ` +
            `The budget is not the problem here; the creative is. Held at its current budget until it is fixed.`
          : `${why}. Inside this ad set — same audience, same budget — "${laggard.adName ?? laggard.adId}" costs ` +
            `${money(laggard.costPerEvent ?? 0)} per ${unit} against the winner's ` +
            `${money(standing.winner?.costPerEvent ?? 0)} (${(laggard.vsWinner ?? 0).toFixed(2)}x) on ${money(laggard.spend)} of spend. ` +
            `The budget is not the problem here; the creative is. Held at its current budget until it is fixed.`,
        needsApproval: true,
      });
    }

    // --- C2: a winner worth replicating --------------------------------------------
    // Fires alongside C1 on purpose: "pause the loser" and "make more of the winner" are
    // two halves of the same move, and an operator handed only the first is left with a
    // smaller ad set rather than a better one.
    const winner = standing.winner;
    if (winner && laggard && winner.costPerEvent != null) {
      const gap = laggard.vsWinner ?? 0;
      const seed = buildSeed(s, standing);
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
            `"${winner.adName ?? winner.adId}" is the cheapest creative in this ad set at ${money(winner.costPerEvent)} per ${unit} ` +
            `(vs ${money(laggard.costPerEvent ?? 0)}, ${gap.toFixed(2)}x, on the same audience and budget) — but Meta rates it ` +
            `${winner.qualityRanking} against its auction peers. Keep the angle, rebuild the execution: make variants that ` +
            `sell the same idea with stronger craft.${importFirst}`
          : `"${winner.adName ?? winner.adId}" is the cheapest creative in this ad set at ${money(winner.costPerEvent)} per ${unit} ` +
            `(vs ${money(laggard.costPerEvent ?? 0)}, ${gap.toFixed(2)}x, on the same audience and budget). Make variants of it and ` +
            `let them compete.${importFirst}`,
        seed,
        needsApproval: true,
      });
    }
  }

  return { recommendations, noRaiseIds };
}
