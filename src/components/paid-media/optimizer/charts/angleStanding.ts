// What angle should each ad set run next?
//
// This replaces the "Audience × angle" heat map, which could not work as designed. It
// pivoted optimizer.adset_snapshots on two axes: `audience_type`, which no production code
// path has ever written (only benches), so every row collapsed to "unknown"; and `angle`, a
// spend-weighted MODE that flattened every ad in an ad set to one label, so the axis it did
// have was lossy. The panel was asking "which audience likes which angle" using data that
// could not answer it.
//
// The framing was also wrong. An ad set's audience is not a free variable to be matched
// against angles — it is already fixed by the ad set's targeting. The decision an operator
// actually makes is per ad set: given what THIS ad set's own ads have proven, what should
// the next creative say? That is one executable row per ad set.
//
// The evidence comes from paid_media_get_adset_creative_winrates, whose cohort is a single
// ad set: audience, budget and placement are held roughly constant, so comparing labels
// inside it is the closest thing to a controlled creative test the account gives away.

import type { AdsetCreativeWinRateRow } from '@continuum/contracts';
import { isDegenerateWinRate } from '@continuum/contracts';

export type AngleVerdict =
  /** One angle is proven here and already carries the spend. Make more of it. */
  | 'double_down'
  /** An angle proven elsewhere in the portfolio has never run here. Try it. */
  | 'introduce'
  /** The winning angle is ALSO the incumbent, but its execution is losing ground —
   *  keep the idea, rebuild the craft. */
  | 'rebuild_craft'
  /** Not enough eligible ads to say anything. Rendered, never hidden. */
  | 'insufficient';

export type AngleCandidate = {
  value: string;
  winRate: number;
  eligibleAds: number;
  spendShare: number | null;
  spend: number | null;
};

export type AdsetAngleRow = {
  adsetId: string;
  adsetName: string;
  /** Where the ad set's spend actually sits today (highest spend share). */
  currentAngle: AngleCandidate | null;
  /** What it should run next. Null only when there is nothing to say. */
  recommendedAngle: AngleCandidate | null;
  verdict: AngleVerdict;
  /** The one-sentence executable instruction. */
  action: string;
  /** 'proven' once the recommendation rests on more than a single un-compared ad. */
  confidence: 'proven' | 'thin';
  /** The ad set's own median cost per KPI — what a new ad here has to beat. */
  adsetMedianCpa: number | null;
  kpi: string;
};

/** An angle needs at least this many eligible ads in the ad set before its win rate is
 *  treated as evidence rather than an accident. Below it the row still renders — it just
 *  says so, per the surface's rule that thin data must be visible, not hidden. */
const MIN_ELIGIBLE_ADS = 2;

function toCandidate(row: AdsetCreativeWinRateRow): AngleCandidate {
  return {
    value: row.value,
    winRate: row.winRate,
    eligibleAds: row.eligibleAds,
    spendShare: row.spendShare,
    spend: row.spend,
  };
}

/** Rank: proven win rate first, then the bigger sample, then the bigger spend. Win rate
 *  alone would crown a 1-for-1 ad over a 6-of-10 one. */
function betterCandidate(a: AdsetCreativeWinRateRow, b: AdsetCreativeWinRateRow): number {
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  if (b.eligibleAds !== a.eligibleAds) return b.eligibleAds - a.eligibleAds;
  return (b.spend ?? 0) - (a.spend ?? 0);
}

/** The angles proven across the whole portfolio, best first — the pool an ad set with no
 *  internal winner can borrow from. */
export function portfolioAngleRanking(rows: readonly AdsetCreativeWinRateRow[]): AngleCandidate[] {
  const byValue = new Map<string, { winners: number; eligible: number; spend: number }>();
  for (const row of rows) {
    if (row.eligibleAds < MIN_ELIGIBLE_ADS) continue;
    const bucket = byValue.get(row.value) ?? { winners: 0, eligible: 0, spend: 0 };
    bucket.winners += row.winners;
    bucket.eligible += row.eligibleAds;
    bucket.spend += row.spend ?? 0;
    byValue.set(row.value, bucket);
  }
  return [...byValue.entries()]
    .map(([value, bucket]) => ({
      value,
      winRate: bucket.eligible > 0 ? bucket.winners / bucket.eligible : 0,
      eligibleAds: bucket.eligible,
      spendShare: null,
      spend: bucket.spend,
    }))
    .filter((candidate) => candidate.winRate > 0)
    .sort((a, b) => b.winRate - a.winRate || b.eligibleAds - a.eligibleAds);
}

function buildAction(
  verdict: AngleVerdict,
  recommended: AngleCandidate | null,
  current: AngleCandidate | null,
  kpi: string,
): string {
  const kpiLabel = kpi || 'results';
  switch (verdict) {
    case 'double_down':
      return `Build the next ads around "${recommended?.value}" — it beats this ad set's median ${kpiLabel} in ${Math.round((recommended?.winRate ?? 0) * 100)}% of its ads.`;
    case 'introduce':
      return `Try "${recommended?.value}" here — it wins elsewhere in this portfolio and has never run in this ad set.`;
    case 'rebuild_craft':
      return `Keep the "${current?.value}" angle but rebuild the execution — it already carries most of the spend and is not beating the ad set's own median.`;
    default:
      return 'Not enough compared ads in this ad set yet — ship a second variant so there is something to measure against.';
  }
}

export type BuildAngleStandingInput = {
  /** Rows from paid_media_get_adset_creative_winrates with dimension='angle'. */
  winrateRows: readonly AdsetCreativeWinRateRow[];
  /** Only the ad sets enrolled in this portfolio. */
  enrolledIds: readonly string[];
  /** Fallback display names when the win-rate row carries none. */
  nameById?: ReadonlyMap<string, string>;
};

/**
 * One executable row per enrolled ad set.
 *
 * Ad sets with no creative-intel rows at all are still returned, as `insufficient` — an
 * un-analyzed ad set and an ad set with nothing working are different states, and silently
 * dropping the first makes the panel look like a shorter list of healthy ad sets.
 */
export function buildAdsetAngleStanding(input: BuildAngleStandingInput): AdsetAngleRow[] {
  const { winrateRows, enrolledIds, nameById } = input;
  const enrolled = new Set(enrolledIds);
  const byAdset = new Map<string, AdsetCreativeWinRateRow[]>();
  for (const row of winrateRows) {
    if (!enrolled.has(row.adsetId)) continue;
    const bucket = byAdset.get(row.adsetId) ?? [];
    bucket.push(row);
    byAdset.set(row.adsetId, bucket);
  }

  const portfolioBest = portfolioAngleRanking(
    winrateRows.filter((row) => enrolled.has(row.adsetId)),
  );

  return enrolledIds.map((adsetId) => {
    const rows = byAdset.get(adsetId) ?? [];
    const adsetName =
      rows.find((row) => row.adsetName)?.adsetName ?? nameById?.get(adsetId) ?? adsetId;
    const kpi = rows[0]?.kpi ?? 'results';
    const adsetMedianCpa = rows.find((row) => row.adsetMedianCpa != null)?.adsetMedianCpa ?? null;

    const current = [...rows].sort((a, b) => (b.spendShare ?? 0) - (a.spendShare ?? 0))[0] ?? null;
    const currentAngle = current ? toCandidate(current) : null;

    const provenHere = rows
      .filter((row) => row.eligibleAds >= MIN_ELIGIBLE_ADS && row.winRate > 0)
      .sort(betterCandidate);
    const winnerHere = provenHere[0] ?? null;

    if (winnerHere) {
      // The incumbent IS the winner: the idea is right, so the lever is execution.
      const incumbentIsWinner = current != null && current.value === winnerHere.value;
      const carriesMostSpend = (winnerHere.spendShare ?? 0) >= 0.5;
      const verdict: AngleVerdict =
        incumbentIsWinner && carriesMostSpend && winnerHere.winRate < 0.5
          ? 'rebuild_craft'
          : 'double_down';
      const recommendedAngle = toCandidate(winnerHere);
      return {
        adsetId,
        adsetName,
        currentAngle,
        recommendedAngle,
        verdict,
        action: buildAction(verdict, recommendedAngle, currentAngle, kpi),
        confidence: isDegenerateWinRate(winnerHere.flags) ? 'thin' : 'proven',
        adsetMedianCpa,
        kpi,
      };
    }

    // Nothing is proven inside this ad set. Borrow the portfolio's best angle, but only one
    // that is not already running here — recommending what it already runs is not advice.
    const running = new Set(rows.map((row) => row.value));
    const borrowed = portfolioBest.find((candidate) => !running.has(candidate.value)) ?? null;
    if (borrowed) {
      return {
        adsetId,
        adsetName,
        currentAngle,
        recommendedAngle: borrowed,
        verdict: 'introduce',
        action: buildAction('introduce', borrowed, currentAngle, kpi),
        confidence: borrowed.eligibleAds >= MIN_ELIGIBLE_ADS * 2 ? 'proven' : 'thin',
        adsetMedianCpa,
        kpi,
      };
    }

    return {
      adsetId,
      adsetName,
      currentAngle,
      recommendedAngle: null,
      verdict: 'insufficient',
      action: buildAction('insufficient', null, currentAngle, kpi),
      confidence: 'thin',
      adsetMedianCpa,
      kpi,
    };
  });
}

/** Actionable rows first (a panel that leads with "insufficient" buries the work), then by
 *  the strength of the recommendation. */
export function sortAngleRows(rows: readonly AdsetAngleRow[]): AdsetAngleRow[] {
  const rank: Record<AngleVerdict, number> = {
    double_down: 0,
    rebuild_craft: 1,
    introduce: 2,
    insufficient: 3,
  };
  return [...rows].sort(
    (a, b) =>
      rank[a.verdict] - rank[b.verdict] ||
      (b.recommendedAngle?.winRate ?? 0) - (a.recommendedAngle?.winRate ?? 0) ||
      a.adsetName.localeCompare(b.adsetName),
  );
}
