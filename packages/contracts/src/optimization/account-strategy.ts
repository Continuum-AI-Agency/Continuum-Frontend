// The account read: one strategic brief spanning every portfolio of one ad account.
//
// Twenty-five DETECTORS, each a metric comparison with a threshold, all computed in code
// over ONE data packet — no model decides whether something fired. The model receives only
// the candidates that did fire, with their numbers, and does what code cannot: rank them
// against a conceptual read of the business, name the conflicts, and write the words.
//
// Impact is money per day for every detector, or the ranking is not a ranking. But three
// kinds of money are not the same money, so `impact_class` rides with the figure and the
// deferred kind is discounted in the open (`rankAccountCandidates`), never summed silently.
//
// Two detectors never enter the ranking. If measurement is broken, or the target itself is
// wrong, a list ordered by money is an instrument pointing precisely at the wrong number —
// so they surface ABOVE the list as guards (`ACCOUNT_GUARD_DETECTORS`).

import { z } from 'zod';
import { accountChartSchema } from './account-chart';

export const accountDetectorSchema = z.enum([
  'portfolio_reallocation',
  'structure_consolidation',
  'funnel_coverage',
  'optimization_event',
  'creative_supply',
  'audience_overlap',
  'account_pacing',
  'scale_readiness',
  'dead_tail',
  'measurement_integrity',
  'bid_strategy',
  'decision_window',
  'placement_mix',
  'format_gap',
  'market_allocation',
  'seasonality',
  'post_click',
  'account_saturation',
  'new_vs_returning',
  'angle_concentration',
  'testing_discipline',
  'auction_pressure',
  'guardrail_bottleneck',
  'platform_diversification',
  'target_economics',
]);
export type AccountDetector = z.infer<typeof accountDetectorSchema>;

/**
 * Money recovered tomorrow, money that buys more, and money not yet lost.
 *
 * `recoverable` is spend that today buys nothing — acting returns it. `better_price` is the
 * same spend buying more results, which holds only while the observed cost holds. `deferred`
 * prevents a decay that has not happened yet, and is the one a ranking flatters if nobody
 * writes the discount down.
 */
export const impactClassSchema = z.enum(['recoverable', 'better_price', 'deferred']);
export type ImpactClass = z.infer<typeof impactClassSchema>;

/** What a class is worth against `recoverable`, which is the unit. */
export const IMPACT_CLASS_WEIGHT: Record<ImpactClass, number> = {
  recoverable: 1,
  better_price: 0.8,
  deferred: 0.4,
};

export const IMPACT_CLASS_COPY: Record<ImpactClass, string> = {
  recoverable: 'Recoverable now',
  better_price: 'Same spend, more results',
  deferred: 'Prevents a decay',
};

/**
 * The two that are read before the list, not inside it.
 *
 * Both invalidate the rest of the analysis rather than competing with it: one says the
 * figures cannot be trusted, the other says they are aimed at the wrong number.
 */
export const ACCOUNT_GUARD_DETECTORS: ReadonlySet<AccountDetector> = new Set([
  'measurement_integrity',
  'target_economics',
]);

export const isGuardDetector = (detector: AccountDetector): boolean =>
  ACCOUNT_GUARD_DETECTORS.has(detector);

/** How often a detector is worth recomputing. A weekly question asked daily is noise. */
export const detectorCadenceSchema = z.enum(['daily', 'weekly', 'monthly']);
export type DetectorCadence = z.infer<typeof detectorCadenceSchema>;

export type AccountDetectorMeta = {
  /** The label a person reads on the card. */
  readonly label: string;
  /** What it holds against what — the sentence under the title. */
  readonly compares: string;
  readonly cadence: DetectorCadence;
  readonly impactClass: ImpactClass;
  /** True when the detector can run on data already persisted today. */
  readonly computable: boolean;
  /** Present when `computable` is false or partial: the missing piece, named. */
  readonly missing?: string;
};

export const ACCOUNT_DETECTOR_META: Record<AccountDetector, AccountDetectorMeta> = {
  portfolio_reallocation: {
    label: 'Move budget between portfolios',
    compares: "each portfolio's marginal cost per result against the others",
    cadence: 'daily',
    impactClass: 'better_price',
    computable: true,
  },
  structure_consolidation: {
    label: 'Consolidate what is starving',
    compares: 'conversions per ad set per week against the learning threshold',
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: true,
  },
  funnel_coverage: {
    label: 'The funnel is not being refilled',
    compares: "spend share per funnel stage against the account's own better-performing band",
    cadence: 'weekly',
    impactClass: 'deferred',
    computable: true,
  },
  optimization_event: {
    label: 'Optimising for the wrong event',
    compares: "the ad set's optimisation goal against the portfolio's business event",
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: true,
  },
  creative_supply: {
    label: 'Creatives die faster than they arrive',
    compares: 'new creatives per week against the rate at which they fatigue',
    cadence: 'daily',
    impactClass: 'better_price',
    computable: true,
  },
  audience_overlap: {
    label: 'Two portfolios bidding on the same people',
    compares: 'targeting fingerprints across portfolios, and the cost per thousand of each',
    cadence: 'weekly',
    impactClass: 'recoverable',
    computable: false,
    missing: 'true overlap needs a Meta call; this approximates it by targeting fingerprint',
  },
  account_pacing: {
    label: 'The month will not land',
    compares: 'projected spend at close against the period budget',
    cadence: 'daily',
    impactClass: 'recoverable',
    computable: true,
  },
  scale_readiness: {
    label: 'Ready for a step up',
    compares: 'stable cost against target, and frequency against the audience ceiling',
    cadence: 'daily',
    impactClass: 'better_price',
    computable: true,
  },
  dead_tail: {
    label: 'Spending on nothing',
    compares: 'spend against conversions in the window, with the confidence interval',
    cadence: 'daily',
    impactClass: 'recoverable',
    computable: true,
  },
  measurement_integrity: {
    label: 'The figures cannot be trusted',
    compares: 'event presence across sibling campaigns, and attribution windows across portfolios',
    cadence: 'daily',
    impactClass: 'recoverable',
    computable: false,
    missing: 'partial: event presence and attribution settings only',
  },
  bid_strategy: {
    label: 'The cap is throttling delivery',
    compares: 'delivered spend against available budget under the current bid strategy',
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: true,
  },
  decision_window: {
    label: 'Deciding before the conversions land',
    compares: 'conversions counted the next day against the same day counted a week later',
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: true,
  },
  placement_mix: {
    label: 'A placement costs more than it returns',
    compares: "each placement's spend share against its results share",
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: true,
  },
  format_gap: {
    label: 'A cheaper format is barely funded',
    compares: 'cost per result by creative format against its spend share',
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: true,
  },
  market_allocation: {
    label: 'One market subsidises another',
    compares: 'spend share by region against results share by region',
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: false,
    missing: 'depends on the regional breakdown actually being populated',
  },
  seasonality: {
    label: 'A peak is coming unprepared',
    compares: 'the window ahead against the same window last year, and the cost-per-thousand trend',
    cadence: 'monthly',
    impactClass: 'deferred',
    computable: false,
    missing: 'enough history; a new account has nothing to compare against',
  },
  post_click: {
    label: 'The problem is after the click',
    compares: 'click-through rate against conversion rate',
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: false,
    missing: 'nothing stores what happens after the click — only the symptom is visible',
  },
  account_saturation: {
    label: 'The account has run out of people',
    compares: 'frequency and net reach across every portfolio against spend',
    cadence: 'weekly',
    impactClass: 'recoverable',
    computable: false,
    missing: 'net reach deduplicated across portfolios; impressions alone will not do',
  },
  new_vs_returning: {
    label: 'Buying people who were going to buy',
    compares: 'retargeting spend share against genuinely new acquisition',
    cadence: 'weekly',
    impactClass: 'recoverable',
    computable: false,
    missing: 'telling a new customer from a returning one',
  },
  angle_concentration: {
    label: 'One angle carries the account',
    compares: 'how spend is spread across communication angles, and whether the top one is tiring',
    cadence: 'weekly',
    impactClass: 'deferred',
    computable: true,
  },
  testing_discipline: {
    label: 'No winners are being built',
    compares: 'spend on structured tests against total spend',
    cadence: 'weekly',
    impactClass: 'deferred',
    computable: true,
  },
  auction_pressure: {
    label: 'The auction moved, not the ad',
    compares: 'cost per thousand against its own baseline, with ad quality held constant',
    cadence: 'daily',
    impactClass: 'deferred',
    computable: false,
    missing: 'a category benchmark; without one it compares only against itself',
  },
  guardrail_bottleneck: {
    label: 'Your own guardrails are the constraint',
    compares: 'how often the cap or the floor bound the solver, cycle after cycle',
    cadence: 'weekly',
    impactClass: 'better_price',
    computable: true,
  },
  platform_diversification: {
    label: 'One auction is one point of failure',
    compares: 'spend share by platform, and whether cost rises as spend does',
    cadence: 'monthly',
    impactClass: 'deferred',
    computable: true,
  },
  target_economics: {
    label: 'The target may be the wrong number',
    compares: 'the configured cost target against contribution margin',
    cadence: 'monthly',
    impactClass: 'recoverable',
    computable: false,
    missing: 'neither margin nor lifetime value is stored anywhere',
  },
};

export const accountCandidateSchema = z.object({
  /** '<detector>:<scope>' — stable across runs so a cooldown can recognise it. */
  id: z.string().min(1),
  detector: accountDetectorSchema,
  /** Portfolios this touches, most implicated first. Empty means the whole account. */
  portfolio_ids: z.array(z.string()).default([]),
  /** Money per day, always, before any class weighting. */
  impact_per_day: z.number().nonnegative(),
  impact_class: impactClassSchema,
  /** 0..1 from sample size and consistency — the same reading the engine already makes. */
  confidence: z.number().min(0).max(1).default(1),
  /** The formula, code-authored: "M × (1 − CPA_b / CPA_a) over $420/day movable". */
  impact_basis: z.string().max(240),
  /** The comparison that fired, as figures: what was held against what, and the threshold. */
  evidence: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).default({}),
  /**
   * The formula, drawn. Built from the same figures `impact_basis` names, so the picture
   * cannot say something the sentence does not. Null only while a detector's chart is
   * still being wired — the card then shows the sentence alone rather than an invention.
   */
  chart: accountChartSchema.nullable().default(null),
  /** Where the card sends a person. */
  cta: z
    .object({
      kind: z.enum(['portfolio', 'queue_row', 'manage', 'none']),
      target_id: z.string().nullable().default(null),
    })
    .default({ kind: 'none', target_id: null }),
});
export type AccountCandidate = z.infer<typeof accountCandidateSchema>;

/**
 * What a candidate is worth once its class and its confidence are taken into account.
 *
 * Kept separate from `impact_per_day` on purpose: the card shows the real money, the
 * ranking uses this, and the difference between the two is exactly what `impact_class`
 * and `confidence` mean. Collapsing them would hide the discount inside the figure.
 */
export function rankedValue(candidate: AccountCandidate): number {
  return (
    candidate.impact_per_day * IMPACT_CLASS_WEIGHT[candidate.impact_class] * candidate.confidence
  );
}

const DETECTOR_ORDER = Object.keys(ACCOUNT_DETECTOR_META) as AccountDetector[];

/**
 * The ranking: guards removed, then by discounted value, ties broken by the catalogue's
 * own order so a run is reproducible.
 */
export function rankAccountCandidates(candidates: readonly AccountCandidate[]): AccountCandidate[] {
  return [...candidates]
    .filter((candidate) => !isGuardDetector(candidate.detector))
    .sort(
      (a, b) =>
        rankedValue(b) - rankedValue(a) ||
        DETECTOR_ORDER.indexOf(a.detector) - DETECTOR_ORDER.indexOf(b.detector) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/** The guards that fired, in catalogue order. Read before the list, never inside it. */
export function accountGuards(candidates: readonly AccountCandidate[]): AccountCandidate[] {
  return [...candidates]
    .filter((candidate) => isGuardDetector(candidate.detector))
    .sort((a, b) => DETECTOR_ORDER.indexOf(a.detector) - DETECTOR_ORDER.indexOf(b.detector));
}

/** Detectors worth recomputing on this day's run. */
export function detectorsForCadence(cadence: DetectorCadence): AccountDetector[] {
  return DETECTOR_ORDER.filter((detector) => ACCOUNT_DETECTOR_META[detector].cadence === cadence);
}

/**
 * Moving money from an expensive source to a cheaper destination.
 *
 * FOUR detectors are this same arithmetic on different axes — portfolios, placements,
 * formats, regions — so they share one function rather than four rounding conventions.
 * Buying the destination's price for what the source was spending: the saving is the part
 * of `moved` the destination does not need.
 */
export function reallocationSaving(args: {
  moved: number;
  sourceCostPerResult: number;
  destinationCostPerResult: number;
}): number {
  const { moved, sourceCostPerResult: from, destinationCostPerResult: to } = args;
  if (!(moved > 0) || !(from > 0) || !(to > 0) || to >= from) return 0;
  return Math.round(moved * (1 - to / from) * 100) / 100;
}
