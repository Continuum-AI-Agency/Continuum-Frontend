// Creative Insights, the pure half: which communication angles this ad account runs, how
// they do inside their own ad sets, and what to run next.
//
// Three reads feed it, and none of them is new:
//   - paid_media_get_adset_creative_winrates (dimension 'angle_id'): per ad set × angle, the
//     eligible ads, how many beat THAT AD SET's median cost per result, and the spend. It is
//     the same read the portfolio's "Angle to run next" panel uses (angleStanding.ts).
//   - paid_media_get_ad_angles: every labelled ad's closed-vocabulary angle. It is what tells
//     "never tested" apart from "tested, too little delivery to judge", and what puts an angle
//     under each kill / scale / iterate ad.
//   - the creative report's verdicts: ad names, for the example under each angle.
//
// Neither RPC carries an ad account, so the account scope is an ad-set id set the caller
// resolves from the account's ad-set inventory. When that inventory is unavailable the rows
// are brand-wide and the caller says so, rather than quietly presenting one as the other.
//
// What is NOT here: a cost per result per angle. No existing read carries an angle's
// conversions — the win-rate rows carry spend, winners and the ad set's median cost, never the
// events behind them — so the figure cannot be computed, and it is not approximated.

import {
  type AdsetCreativeWinRateRow,
  GLOBAL_ANGLE_LABELS,
  type GlobalAngleId,
  globalAngleIdSchema,
  isDegenerateWinRate,
  MIN_TRUSTWORTHY_COHORT,
  type PaidCreativeVerdict,
} from '@continuum/contracts';
import {
  type AdsetAngleRow,
  buildAdsetAngleStanding,
  sortAngleRows,
} from '@/components/paid-media/optimizer/charts/angleStanding';

export type InsightsWindow = 'd7' | 'd30';

/** The per-ad angle facts this page reads off paid_media_get_ad_angles. */
export type AdAngleFact = {
  ad_id: string;
  adset_id: string;
  angle_id?: string | null;
};

/** The account-level call on one angle. The first four are angleStanding's verdicts, lifted
 *  to the account: an angle is "double down" when some ad set's own ads prove it, "rebuild
 *  the craft" when it carries an ad set's spend while losing there, "introduce" when an ad
 *  set should borrow it, "insufficient" when it has fewer than two compared ads. `behind` is
 *  the honest remainder: compared, and not what any ad set should run next. */
export type AccountAngleVerdict =
  | 'double_down'
  | 'rebuild_craft'
  | 'introduce'
  | 'insufficient'
  | 'behind';

export type AccountAngleRow = {
  angleId: GlobalAngleId;
  label: string;
  /** The highest-spend named ad carrying this angle, when the report names one. */
  exampleAdName: string | null;
  /** Eligible ads with this angle, summed over the account's ad sets. */
  ads: number;
  spend: number;
  /** This angle's share of the spend of every angle-labelled eligible ad in scope. */
  spendShare: number | null;
  /** Eligible ads in ad sets where another angle competed — the win rate's denominator. */
  comparedAds: number;
  winners: number;
  /** winners / comparedAds; null when the angle never competed against another one. */
  winRate: number | null;
  /** Ad sets where this angle competed against another one, and how many it lost in. */
  adsetsCompared: number;
  adsetsLosing: number;
  verdict: AccountAngleVerdict;
};

/** An angle "wins" in an ad set when at least half its ads there beat the ad set's median. */
const ADSET_WIN_THRESHOLD = 0.5;
/** Same floor angleStanding uses before a win rate counts as evidence. */
const MIN_COMPARED_ADS = 2;

const isGlobalAngleId = (value: string | null | undefined): value is GlobalAngleId =>
  typeof value === 'string' && Object.hasOwn(GLOBAL_ANGLE_LABELS, value);

export const angleLabel = (value: string | null | undefined): string | null =>
  isGlobalAngleId(value) ? GLOBAL_ANGLE_LABELS[value] : null;

const inScope = (adsetId: string | null | undefined, scope: ReadonlySet<string> | null): boolean =>
  scope === null || (typeof adsetId === 'string' && scope.has(adsetId));

/** Win-rate rows on the closed vocabulary, inside the account scope. */
export function scopeWinrateRows(
  rows: readonly AdsetCreativeWinRateRow[],
  scope: ReadonlySet<string> | null,
): AdsetCreativeWinRateRow[] {
  return rows.filter(
    (row) =>
      row.dimension === 'angle_id' && isGlobalAngleId(row.value) && inScope(row.adsetId, scope),
  );
}

/** ad id → confirmed closed-vocabulary angle id, inside the account scope. */
export function angleIdByAd(
  facts: readonly AdAngleFact[],
  scope: ReadonlySet<string> | null,
): Map<string, GlobalAngleId> {
  const out = new Map<string, GlobalAngleId>();
  for (const fact of facts) {
    if (isGlobalAngleId(fact.angle_id) && inScope(fact.adset_id, scope)) {
      out.set(fact.ad_id, fact.angle_id);
    }
  }
  return out;
}

/** One executable "what to run next" row per ad set in scope — angleStanding's own rows. */
export function buildNextAngleRows(
  scopedRows: readonly AdsetCreativeWinRateRow[],
  nameById?: ReadonlyMap<string, string>,
): AdsetAngleRow[] {
  const adsetIds = [...new Set(scopedRows.map((row) => row.adsetId))];
  return sortAngleRows(
    buildAdsetAngleStanding({ winrateRows: scopedRows, enrolledIds: adsetIds, nameById }),
  );
}

function accountVerdict(
  angleId: GlobalAngleId,
  comparedAds: number,
  standing: readonly AdsetAngleRow[],
): AccountAngleVerdict {
  // First: an angle that never competed against another one has no account-level call, even
  // when angleStanding crowned it inside a single-variant ad set (a thin, arithmetic win).
  if (comparedAds < MIN_COMPARED_ADS) return 'insufficient';
  const recommendedAs = (verdict: AdsetAngleRow['verdict']) =>
    standing.some((row) => row.verdict === verdict && row.recommendedAngle?.value === angleId);
  if (recommendedAs('double_down')) return 'double_down';
  if (recommendedAs('rebuild_craft')) return 'rebuild_craft';
  if (recommendedAs('introduce')) return 'introduce';
  return 'behind';
}

export type BuildAccountAnglesInput = {
  /** Already scoped with scopeWinrateRows. */
  scopedRows: readonly AdsetCreativeWinRateRow[];
  /** angleStanding rows for the same scope (buildNextAngleRows). */
  standing: readonly AdsetAngleRow[];
  /** From angleIdByAd, same scope. */
  angleByAd: ReadonlyMap<string, GlobalAngleId>;
  verdicts: readonly PaidCreativeVerdict[];
};

/**
 * One row per closed-vocabulary angle that had eligible ads in the window.
 *
 * HOW THE WIN RATE IS AGGREGATED. paid_media_get_adset_creative_winrates judges every ad
 * against its OWN ad set's median cost per result, so audience, budget and placement are held
 * roughly constant inside each comparison. Lifting that to the account POOLS the ads:
 * Σ winners / Σ eligible ads over the ad sets the angle ran in. Each ad counts once, already
 * judged inside its own ad set; averaging the per-ad-set rates instead would let a one-ad ad
 * set weigh as much as a ten-ad one. Ad sets flagged `single_variant` (every ad there carries
 * this angle) are left out of the win rate: there was no other angle to beat, so the rate is
 * arithmetic, not evidence. Their ads and spend still count in "Ads" and "Share of spend".
 */
export function buildAccountAngleRows(input: BuildAccountAnglesInput): AccountAngleRow[] {
  const { scopedRows, standing, angleByAd, verdicts } = input;

  type Bucket = {
    ads: number;
    spend: number;
    comparedAds: number;
    winners: number;
    adsetsCompared: number;
    adsetsLosing: number;
  };
  const buckets = new Map<GlobalAngleId, Bucket>();
  for (const row of scopedRows) {
    const angleId = row.value as GlobalAngleId;
    const bucket = buckets.get(angleId) ?? {
      ads: 0,
      spend: 0,
      comparedAds: 0,
      winners: 0,
      adsetsCompared: 0,
      adsetsLosing: 0,
    };
    bucket.ads += row.eligibleAds;
    bucket.spend += row.spend ?? 0;
    if (!isDegenerateWinRate(row.flags)) {
      bucket.comparedAds += row.eligibleAds;
      bucket.winners += row.winners;
      bucket.adsetsCompared += 1;
      if (row.winRate < ADSET_WIN_THRESHOLD) bucket.adsetsLosing += 1;
    }
    buckets.set(angleId, bucket);
  }

  const totalSpend = [...buckets.values()].reduce((sum, bucket) => sum + bucket.spend, 0);

  const exampleByAngle = new Map<GlobalAngleId, { name: string; spend: number }>();
  for (const verdict of verdicts) {
    const angleId = angleByAd.get(verdict.adId);
    if (!angleId || !verdict.adName) continue;
    const spend = verdict.spend ?? 0;
    const current = exampleByAngle.get(angleId);
    if (!current || spend > current.spend) {
      exampleByAngle.set(angleId, { name: verdict.adName, spend });
    }
  }

  return [...buckets.entries()]
    .map(([angleId, bucket]) => ({
      angleId,
      label: GLOBAL_ANGLE_LABELS[angleId],
      exampleAdName: exampleByAngle.get(angleId)?.name ?? null,
      ads: bucket.ads,
      spend: bucket.spend,
      spendShare: totalSpend > 0 ? bucket.spend / totalSpend : null,
      comparedAds: bucket.comparedAds,
      winners: bucket.winners,
      winRate: bucket.comparedAds > 0 ? bucket.winners / bucket.comparedAds : null,
      adsetsCompared: bucket.adsetsCompared,
      adsetsLosing: bucket.adsetsLosing,
      verdict: accountVerdict(angleId, bucket.comparedAds, standing),
    }))
    .sort(
      (a, b) =>
        Number(a.comparedAds < MIN_COMPARED_ADS) - Number(b.comparedAds < MIN_COMPARED_ADS) ||
        (b.winRate ?? -1) - (a.winRate ?? -1) ||
        b.spend - a.spend,
    );
}

/**
 * Closed-vocabulary angles with no labelled ad at all in scope, in vocabulary order.
 * `unknown` is the classifier's "could not assign", not an angle anyone could test.
 *
 * Empty when nothing in scope carries a confirmed angle: then the labeller has not reached the
 * account, and "never tested" would be a claim about the ads that nobody has read yet.
 */
export function neverTestedAngles(
  angleByAd: ReadonlyMap<string, GlobalAngleId>,
  scopedRows: readonly AdsetCreativeWinRateRow[],
): Array<{ angleId: GlobalAngleId; label: string }> {
  if (angleByAd.size === 0) return [];
  const seen = new Set<string>([...angleByAd.values(), ...scopedRows.map((row) => row.value)]);
  return globalAngleIdSchema.options
    .filter((angleId) => angleId !== 'unknown' && !seen.has(angleId))
    .map((angleId) => ({ angleId, label: GLOBAL_ANGLE_LABELS[angleId] }));
}

const pct = (value: number): string => `${Math.round(value * 100)}%`;
const adSetWord = (count: number): string => (count === 1 ? 'ad set' : 'ad sets');

/** One run of the read. An angle is set semibold, a figure in mono, and `tone` colours the
 *  comparison word that a figure sits behind (better / worse than its own ad sets). */
export type AngleReadPart =
  | { kind: 'text'; text: string; tone?: 'better' | 'worse' }
  | { kind: 'angle'; text: string }
  | { kind: 'figure'; text: string };

/** `finding`: what wins and where the spend sits, and how it does. `next`: what to do. */
export type AngleReadLine = { kind: 'finding' | 'next'; parts: AngleReadPart[] };

const text = (value: string, tone?: 'better' | 'worse'): AngleReadPart =>
  tone ? { kind: 'text', text: value, tone } : { kind: 'text', text: value };
const angle = (value: string): AngleReadPart => ({ kind: 'angle', text: value });
const figure = (value: number | string): AngleReadPart => ({ kind: 'figure', text: String(value) });

/** The plain sentence, for an aria label or a test. */
export const angleReadText = (line: AngleReadLine): string =>
  line.parts.map((part) => part.text).join('');

function findingParts(rows: readonly AccountAngleRow[]): AngleReadPart[] {
  const best =
    rows
      .filter(
        (row) =>
          row.winRate !== null &&
          row.comparedAds >= MIN_TRUSTWORTHY_COHORT &&
          row.winRate >= ADSET_WIN_THRESHOLD,
      )
      .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.comparedAds - a.comparedAds)[0] ??
    null;
  const topSpend =
    rows
      .filter((row) => row.spendShare !== null && row.spend > 0)
      .sort((a, b) => b.spend - a.spend)[0] ?? null;

  const parts: AngleReadPart[] = [];
  if (best) {
    parts.push(
      angle(best.label),
      text(' '),
      text('wins most often', 'better'),
      text(': '),
      figure(best.winners),
      text(' of '),
      figure(best.comparedAds),
      text(" ads beat their ad set's median cost, across "),
      figure(best.adsetsCompared),
      text(` ${adSetWord(best.adsetsCompared)}.`),
    );
  }
  if (topSpend?.spendShare != null) {
    const share = figure(pct(topSpend.spendShare));
    if (parts.length > 0) parts.push(text(' '));
    if (best && topSpend.angleId === best.angleId) {
      parts.push(text('It also carries '), share, text(' of the spend.'));
    } else if (topSpend.adsetsCompared > 0) {
      parts.push(angle(topSpend.label), text(' carries '), share, text(' of the spend and '));
      if (topSpend.adsetsLosing === 0) {
        parts.push(
          text('wins', 'better'),
          text(' in all '),
          figure(topSpend.adsetsCompared),
          text(` ${adSetWord(topSpend.adsetsCompared)} where it competes.`),
        );
      } else {
        parts.push(
          text('loses', 'worse'),
          text(' in '),
          figure(topSpend.adsetsLosing),
          text(' of the '),
          figure(topSpend.adsetsCompared),
          text(` ${adSetWord(topSpend.adsetsCompared)} where it competes.`),
        );
      }
    } else {
      parts.push(
        angle(topSpend.label),
        text(' carries '),
        share,
        text(' of the spend, across '),
        figure(topSpend.ads),
        text(topSpend.ads === 1 ? ' ad.' : ' ads.'),
      );
    }
  }
  return parts;
}

/** The angle most of these ad sets are told to run, and how many of them. */
function commonRecommendation(rows: readonly AdsetAngleRow[]): { label: string; count: number } {
  const byAngle = new Map<string, number>();
  for (const row of rows) {
    const label = angleLabel(row.recommendedAngle?.value);
    if (label) byAngle.set(label, (byAngle.get(label) ?? 0) + 1);
  }
  const [label, count] = [...byAngle.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return { label, count };
}

/** What to do next, from angleStanding's own per-ad-set verdicts: the strongest call that some
 *  ad set carries, said once for every ad set that carries it. */
function nextParts(standing: readonly AdsetAngleRow[]): AngleReadPart[] {
  const withVerdict = (verdict: AdsetAngleRow['verdict']) =>
    standing.filter((row) => row.verdict === verdict);

  const doubleDown = commonRecommendation(withVerdict('double_down'));
  if (doubleDown.count > 0) {
    return [
      text('Next: build the next ads around '),
      angle(doubleDown.label),
      text(' in the '),
      figure(doubleDown.count),
      text(` ${adSetWord(doubleDown.count)} where its own ads prove it.`),
    ];
  }
  const rebuild = commonRecommendation(withVerdict('rebuild_craft'));
  if (rebuild.count > 0) {
    return [
      text('Next: keep '),
      angle(rebuild.label),
      text(' but rebuild its execution in '),
      figure(rebuild.count),
      text(` ${adSetWord(rebuild.count)}, where it carries the spend without beating the median.`),
    ];
  }
  const introduce = commonRecommendation(withVerdict('introduce'));
  if (introduce.count > 0) {
    return [
      text('Next: try '),
      angle(introduce.label),
      text(' in '),
      figure(introduce.count),
      text(` ${adSetWord(introduce.count)} that have never run it.`),
    ];
  }
  const thin = withVerdict('insufficient').length;
  if (thin > 0) {
    return [
      text('Next: ship a second variant in '),
      figure(thin),
      text(` ${adSetWord(thin)}, so an angle can be called there.`),
    ];
  }
  return [];
}

/**
 * The two-line read, composed from the table's own figures and angleStanding's per-ad-set
 * verdicts — nothing a model wrote.
 *
 * The finding names the angle that wins most often inside its ad sets (a trustworthy sample
 * that wins at least half the time), then the angle carrying the most spend and how it does
 * where it competes. The next step is the strongest per-ad-set call, counted. Any part that
 * cannot be computed is left out; with nothing computable there is no read.
 */
export function composeAngleRead(
  rows: readonly AccountAngleRow[],
  standing: readonly AdsetAngleRow[] = [],
): AngleReadLine[] {
  const finding = findingParts(rows);
  if (finding.length === 0) return [];
  const next = nextParts(standing);
  return next.length > 0
    ? [
        { kind: 'finding', parts: finding },
        { kind: 'next', parts: next },
      ]
    : [{ kind: 'finding', parts: finding }];
}

/** Verdicts restricted to the account's ad sets (the report is brand-wide). */
export function scopeVerdicts(
  verdicts: readonly PaidCreativeVerdict[],
  scope: ReadonlySet<string> | null,
): PaidCreativeVerdict[] {
  return scope === null
    ? [...verdicts]
    : verdicts.filter((verdict) => inScope(verdict.adsetId, scope));
}
