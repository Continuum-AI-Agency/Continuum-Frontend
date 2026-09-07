// ---------------------------------------------------------------------------
// readDelivery() — is this ad set being SERVED, and if not, what does Meta say?
//
// Every other trigger in this engine is a ratio of recent performance to past
// performance. A ratio presumes delivery. Where delivery stopped, the ratio is
// either undefined or — worse — well-formed and meaningless, and the engine has no
// way to tell the difference. That is how "Meta stopped serving this ad set" became
// indistinguishable from "this creative wore out": on live data, 17 of 85 active ad
// sets had zero impressions across a week at a mean frequency of 1.45, which no
// fatigue rule can explain and none of them fired on.
//
// This module answers the prior question. It is pure, and it is deliberately
// conservative: every derived number is nullable, and null means NOT KNOWABLE from
// what we hold. No caller may read a null as a zero.
// ---------------------------------------------------------------------------

import type { AdSetSnapshot, DeliveryRead, DeliveryState, Recommendation } from './types';

/** Consecutive zero-impression days at which an ACTIVE, funded ad set is called `dark`.
 *  Three, not one: Meta's most recent day is partial at any hour we run, and a single
 *  quiet day on a small budget is ordinary. */
export const DARK_DAYS_THRESHOLD = 3;

/** Below this share of the prior week's daily impressions, delivery is `throttled`.
 *  Not a performance judgement — an ad set can halve its delivery and improve its CPA. */
export const THROTTLED_IMPRESSION_RATIO = 0.5;

/** reach(d14)/reach(d7) at or under this means the extra week found essentially no new
 *  people. A healthy prospecting ad set sits well above it; 1.0 is the floor (reach is
 *  monotonic in the window), so this is a narrow band by construction. */
export const REACH_EXHAUSTED_EXPANSION = 1.15;

/** Days of daily history needed before an impressions trend is worth reading. */
const TREND_MIN_DAYS = 14;

const dayMs = 86_400_000;

/** ISO day arithmetic without a Date round-trip at the call site. */
function shiftDay(isoDay: string, delta: number): string {
  const at = Date.parse(`${isoDay}T00:00:00Z`);
  if (!Number.isFinite(at)) return isoDay;
  return new Date(at + delta * dayMs).toISOString().slice(0, 10);
}

/**
 * Impressions per calendar day, densified against a date spine.
 *
 * The daily series is SPARSE: Meta omits days with no delivery, and the edge maps only
 * the rows Meta returns — nothing anywhere fills a spine. So the absence of a date is
 * the ONLY way a zero-delivery day is ever represented, and a naive walk over the array
 * (`daily[daily.length - 1]`) reads a ten-day outage as "the series ends ten days ago",
 * finds no zeros, and reports the ad set as healthy.
 *
 * Densifying is therefore not tidying — it is the measurement.
 */
function impressionsByDay(snapshot: AdSetSnapshot): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const day of snapshot.daily ?? []) {
    if (typeof day.date !== 'string' || day.date.length === 0) continue;
    // Meta can return the same date twice across shard boundaries; take the larger,
    // never the sum, or a re-fetched day doubles.
    byDay.set(day.date, Math.max(byDay.get(day.date) ?? 0, day.impressions));
  }
  return byDay;
}

/**
 * Consecutive zero-impression days ending at the last COMPLETE day before `asOf`.
 *
 * `asOf` itself is excluded: the cycle runs at an arbitrary hour, so today's row is
 * always partial and a zero on it means nothing. Null when the ad set is too young, or
 * when there is no daily series at all — an ad set we failed to fetch delivery for is
 * unknown, not dark.
 */
export function countDarkDays(snapshot: AdSetSnapshot, asOf: string | undefined): number | null {
  if (!asOf || !snapshot.daily || snapshot.daily.length === 0) return null;
  const byDay = impressionsByDay(snapshot);
  if (byDay.size === 0) return null;
  // Never look further back than the ad set has existed, or a two-day-old ad set reads
  // as twenty-eight days dark.
  const horizon = Math.min(30, Math.max(0, Math.floor(snapshot.ageDays)));
  if (horizon < 1) return null;

  let dark = 0;
  for (let back = 1; back <= horizon; back += 1) {
    const day = shiftDay(asOf, -back);
    if ((byDay.get(day) ?? 0) > 0) break;
    dark += 1;
  }
  return dark;
}

/**
 * Recent daily impressions against the week before them.
 *
 * Uses the same densified spine as `countDarkDays`, and the same exclusion of `asOf`.
 * Returns null unless BOTH weeks are covered by the ad set's own age — comparing a
 * five-day-old ad set's second week against a week it did not exist for produces a
 * confident collapse out of nothing.
 */
export function impressionsWeekOverWeek(
  snapshot: AdSetSnapshot,
  asOf: string | undefined,
): number | null {
  if (!asOf || !snapshot.daily || snapshot.daily.length === 0) return null;
  if (snapshot.ageDays < TREND_MIN_DAYS) return null;
  const byDay = impressionsByDay(snapshot);
  if (byDay.size === 0) return null;

  let recent = 0;
  let prior = 0;
  for (let back = 1; back <= 7; back += 1) recent += byDay.get(shiftDay(asOf, -back)) ?? 0;
  for (let back = 8; back <= 14; back += 1) prior += byDay.get(shiftDay(asOf, -back)) ?? 0;
  if (prior <= 0) return null;
  return recent / prior;
}

/** reach(d14)/reach(d7). Null unless both reads landed and d7 reach is non-zero. */
export function reachExpansionOf(snapshot: AdSetSnapshot): number | null {
  const reach7d = snapshot.delivery?.reach7d;
  const reach14d = snapshot.delivery?.reach14d;
  if (typeof reach7d !== 'number' || typeof reach14d !== 'number') return null;
  if (reach7d <= 0) return null;
  return reach14d / reach7d;
}

/**
 * Where one ad set sits on the delivery ladder.
 *
 * `off_meta` is never produced here — an ad set absent from the ACTIVE roster has no
 * snapshot to classify, so that state arrives from roster presence in runCycle.
 *
 * Unknown resolves to `serving`, on purpose. This read GATES the performance triggers,
 * so an unknown that resolved to `dark` would silence every finding on every ad set the
 * moment the delivery fields stopped arriving — a fail-soft degradation dressed up as a
 * clean account. Unknown means the delivery triggers stay silent and the existing
 * triggers behave exactly as they did before this module existed.
 */
export function readDelivery(snapshot: AdSetSnapshot, asOf?: string): DeliveryRead {
  const darkDays = countDarkDays(snapshot, asOf);
  const impressionsWow = impressionsWeekOverWeek(snapshot, asOf);
  const reachExpansion = reachExpansionOf(snapshot);
  const blockers = snapshot.delivery?.blockers ?? [];
  const learningStage = snapshot.delivery?.learningStage ?? null;

  let state: DeliveryState = 'serving';
  if (darkDays !== null && darkDays >= DARK_DAYS_THRESHOLD) {
    state = 'dark';
  } else if (impressionsWow !== null && impressionsWow < THROTTLED_IMPRESSION_RATIO) {
    state = 'throttled';
  }

  return {
    state,
    darkDays,
    impressionsWow,
    reachExpansion,
    blockers,
    learningStage,
  };
}

// --- Stage D — the delivery triggers ---------------------------------------
// These say the thing no rule here could previously say: nothing is being served.
// They are not performance findings and must never be answered with a creative.

/** An enrolled ad set the cycle could not find in the account's live ACTIVE fleet. It has
 *  no snapshot at all — the ACTIVE filter on the roster fetch is what removed it — so it
 *  reaches the engine on its own channel rather than as an AdSetSnapshot. */
export type AbsentAdset = {
  adsetId: string;
  adsetName?: string | null;
  /** ISO timestamp of the FIRST cycle it went absent, so a long-gone ad set never looks
   *  freshly missing. */
  missingSince?: string | null;
};

/** How recently an ad set must have vanished for its disappearance to be news.
 *
 *  Without this bound every cycle would re-raise one finding per long-departed ad set —
 *  73 of them on the live account — and bury the ones a human can still act on. The
 *  standing list of departures is enrollment state, and the manage panel already shows
 *  it; a recommendation is for the ones that just happened. */
export const OFF_META_FRESH_DAYS = 7;

export type DeliveryEvaluation = {
  recommendations: Recommendation[];
  /** Per ad set, what this cycle could see about its delivery. */
  reads: Map<string, DeliveryRead>;
  /** Ad sets that are not being served, and whose performance ratios therefore mean
   *  nothing this cycle. The performance stages skip them. */
  suppressIds: Set<string>;
};

function daysBetween(fromIso: string, toIsoDay: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(`${toIsoDay}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.floor((to - from) / dayMs);
}

/** Quote Meta's blockers rather than paraphrase them: the provider naming
 *  AD_SET_AUDIENCE_TOO_SMALL is worth more than any inference we could publish. */
function blockerClause(blockers: string[]): string {
  if (blockers.length === 0) return 'Meta reports no delivery blockers on it';
  return `Meta reports: ${blockers.join('; ')}`;
}

export function evaluateDelivery(
  snapshots: AdSetSnapshot[],
  absent: AbsentAdset[],
  asOf?: string,
): DeliveryEvaluation {
  const recommendations: Recommendation[] = [];
  const reads = new Map<string, DeliveryRead>();
  const suppressIds = new Set<string>();

  // D1 — enrolled, and no longer in the account's ACTIVE fleet.
  for (const entry of absent) {
    const age = asOf && entry.missingSince ? daysBetween(entry.missingSince, asOf) : null;
    if (age !== null && age > OFF_META_FRESH_DAYS) continue;
    const name = entry.adsetName?.trim();
    const since = entry.missingSince ? ` since ${entry.missingSince.slice(0, 10)}` : '';
    recommendations.push({
      adSetId: entry.adsetId,
      kind: 'restore_delivery',
      trigger: 'D1_off_meta',
      severity: 'medium',
      reason: `${name ? `"${name}"` : 'This ad set'} is enrolled but is no longer ACTIVE on Meta${since} — paused, deleted, or moved to campaign budget in Ads Manager. It is spending nothing and can learn nothing. Resume it or drop it from the portfolio; a new creative would change neither.`,
      needsApproval: true,
    });
  }

  for (const s of snapshots) {
    const read = readDelivery(s, asOf);
    reads.set(s.id, read);
    if (read.state === 'dark') suppressIds.add(s.id);

    // D2 — Meta considers it live, it holds budget, and it served nothing for days.
    // This is the state an account manager means by "Meta stopped serving it", and the
    // one the fatigue rules are structurally incapable of reaching: readDecay requires
    // d3 impressions above zero, so a dark ad set produces silence, not a finding.
    if (read.state === 'dark' && s.currentBudget > 0 && read.darkDays !== null) {
      recommendations.push({
        adSetId: s.id,
        kind: 'restore_delivery',
        trigger: 'D2_dark_with_budget',
        severity: 'high',
        reason: `ACTIVE on Meta with $${s.currentBudget.toFixed(0)}/day of budget, and zero impressions for ${read.darkDays} days. ${blockerClause(read.blockers)}. Delivery is the problem here, not the creative — refreshing an ad that is not being shown changes nothing.`,
        needsApproval: true,
      });
      continue;
    }

    // D3 — Meta says it cannot leave the learning phase. Adding creatives usually makes
    // this worse: the same scarce weekly signal gets split further.
    if (read.learningStage === 'LEARNING_LIMITED') {
      recommendations.push({
        adSetId: s.id,
        kind: 'restore_delivery',
        trigger: 'D3_learning_limited',
        severity: 'medium',
        reason:
          'Meta reports LEARNING_LIMITED: too few weekly conversions to finish learning, so delivery stays unstable and every number on it is noisy. Consolidate audiences or raise the budget — adding more creatives splits the same scarce signal further.',
        needsApproval: true,
      });
    }
  }

  return { recommendations, reads, suppressIds };
}
