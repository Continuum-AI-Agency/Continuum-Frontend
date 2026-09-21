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
import type { OptimizationObjective } from './engine-contracts';
// A VALUE import, and insight-approval imports AccountDetector back as a TYPE. The type-only
// side erases, so there is no runtime cycle — the same arrangement account-chart already uses.
// Keep the direction: a value import both ways would deadlock module init.
import { insightStateSchema } from './insight-approval';

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
  /**
   * Why this figure is smaller than the gap the chart draws.
   *
   * A transfer card ends in "move $X", and X cannot exceed the objective's
   * per-cycle velocity cap — which differs by a factor of two across the
   * catalogue (50% on signup, 25% on lead, conversations and clicks). The same
   * detector on the same gap therefore proposes twice as much money on one
   * account as on another, and that is CORRECT. What is not acceptable is the
   * card staying silent about it: an unexplained small number reads as a weak
   * recommendation rather than a bounded one.
   */
  capped_by: z.enum(['guardrail', 'velocity']).nullable().default(null),
  /**
   * The objective's own word for one result — "purchases", "leads",
   * "conversations", "impressions". Resolved from the metric definition, never
   * written by a model. A cost per conversation rendered as "CPA" is how a
   * $39.48 messaging thread gets read as a $255.98 failed lead.
   */
  result_label: z.string().default('results'),
  /**
   * What happens when this fires, after its family's ceiling is applied.
   *
   * Null when nobody has been asked — a read composed before approvals existed, or a caller
   * that does not resolve them. Null is not 'recommend': "we did not look" and "it recommends"
   * are different facts, and a card that claims a state nobody chose is worse than one that
   * says nothing.
   */
  state: insightStateSchema.nullable().default(null),
  /**
   * True when someone asked for MORE than the family allows and got less.
   *
   * The whole reason this rides on the candidate rather than being recomputed in the UI: a
   * state that was asked for and did not take must be visible, or someone sets a detector to
   * autopilot, sees nothing happen, and stops trusting the switch.
   */
  state_lowered: z.boolean().default(false),
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

// ---------------------------------------------------------------------------
// The ladder: how far this objective's result sits from the money.
//
// Eleven objectives do not need eleven card designs. They need four, and the
// thing that sorts them is what a "result" actually IS — revenue, a person, an
// intent, or attention. Each rung down takes cards away and makes the ones that
// stay say something smaller.
//
// Worth stating plainly because it explains a long-standing puzzle: exactly ONE
// objective has revenue attached to the event it buys. That is why
// `target_economics` has been starved since it was written — it wants a
// contribution margin, and ten of eleven objectives have nothing to compare one
// against. It was never a missing field. It was a missing rung.
// ---------------------------------------------------------------------------

export const resultRungSchema = z.enum(['money', 'person', 'intent', 'attention']);
export type ResultRung = z.infer<typeof resultRungSchema>;

export const RESULT_RUNG: Record<OptimizationObjective, ResultRung> = {
  purchase: 'money',

  signup: 'person',
  app_install: 'person',
  lead: 'person',
  conversations: 'person',

  traffic: 'intent',
  link_clicks: 'intent',
  clicks: 'intent',

  awareness: 'attention',
  thruplays: 'attention',
  post_engagement: 'attention',

  /**
   * A placeholder, and the only entry here that is not the truth.
   *
   * A custom conversion has no fixed rung — it sits wherever its ANALOG sits, and the analog
   * is per-account. `person` is the conservative default because it is the rung that asks for
   * a close rate before it trusts a margin. Resolve it properly with `resultRungFor()`, which
   * takes the descriptor; reading this entry directly for a custom objective is a bug.
   */
  custom: 'person',
};

/**
 * The rung this objective's results actually sit on.
 *
 * Use this, never `RESULT_RUNG[objective]`, wherever a custom conversion can appear: a custom
 * event carrying revenue belongs on `money` and one fired by a CRM belongs on `person`, and
 * the difference decides whether the economics guard asks for a margin or a close rate.
 */
export function resultRungFor(
  objective: OptimizationObjective,
  analog?: OptimizationObjective | null,
): ResultRung {
  if (objective === 'custom' && analog && analog !== 'custom') return RESULT_RUNG[analog];
  return RESULT_RUNG[objective];
}

/**
 * What a detector does under one objective.
 *
 * `reterm` is NOT a smaller `on`: the card still appears and still ranks, it
 * just takes a threshold or a window from the objective's profile instead of a
 * constant. Only `mute` changes what is in the deck.
 */
export type DetectorVerdict =
  | { kind: 'on' }
  | { kind: 'reterm'; from: string }
  | { kind: 'mute'; because: string };

/**
 * The six that keep their comparison and change their line, on EVERY objective.
 *
 * Kept separate from the per-objective table because the re-term is universal —
 * only its source differs — and folding it into a matrix would imply a choice
 * that does not exist.
 */
export const DETECTOR_RETERM: Partial<Record<AccountDetector, string>> = {
  structure_consolidation: 'profile.minEventsPerWindow',
  creative_supply: 'the objective’s own result unit',
  scale_readiness: 'profile.saturationGamma — the caveat, where β is not flat',
  dead_tail: 'profile.upperFunnelField — which KIND of dead',
  decision_window: 'the objective’s attribution lag',
  target_economics: 'margin, margin × close rate, or “are you buying the right thing”',
};

/**
 * The exceptions, and ONLY the exceptions.
 *
 * Twenty-five detectors across eleven objectives is three hundred cells. A table
 * that size is a table nobody maintains, and a stale cell is worse than no cell.
 * So: absent means `on`. Adding an objective costs nothing; adding a detector
 * costs only the exceptions someone can actually argue for.
 */
export const DETECTOR_MUTES: Partial<
  Record<AccountDetector, Partial<Record<OptimizationObjective, string>>>
> = {
  funnel_coverage: {
    awareness: 'no upper-funnel step to talk about — the KPI is the top of the funnel',
  },
  optimization_event: {
    awareness: 'the KPI is the goal; there is nothing downstream to mismatch against',
    traffic: 'the KPI is the goal; there is nothing downstream to mismatch against',
    clicks: 'the KPI is the goal; there is nothing downstream to mismatch against',
    link_clicks: 'the KPI is the goal; there is nothing downstream to mismatch against',
    thruplays: 'the KPI is the goal; there is nothing downstream to mismatch against',
    post_engagement: 'the KPI is the goal; there is nothing downstream to mismatch against',
  },
  post_click: {
    // traffic KEEPS this one: its KPI is the landing-page view and its
    // upper-funnel step is the click, so the gap between them IS the question.
    awareness: 'nothing happens after a click that this objective counts',
    thruplays: 'nothing happens after a click that this objective counts',
    post_engagement: 'nothing happens after a click that this objective counts',
    conversations: 'the conversation IS the conversion — there is no landing page',
    link_clicks: 'the click is the conversion',
    clicks: 'the click is the conversion',
  },
  new_vs_returning: {
    app_install: 'an install is new by definition',
    awareness: 'no customer concept',
    traffic: 'no customer concept',
    link_clicks: 'no customer concept',
    clicks: 'no customer concept',
    thruplays: 'no customer concept',
    post_engagement: 'no customer concept',
  },
  account_saturation: {
    awareness: 'frequency rising against flat reach is the GOAL of this buy, not its failure',
  },
};

/**
 * What this detector does for this objective.
 *
 * Guards are exempt from muting on purpose. If the figures cannot be trusted, or
 * the target is the wrong number, that is true under every objective — a product
 * that can silence its own instrument check has none.
 */
export function verdictFor(
  detector: AccountDetector,
  objective: OptimizationObjective,
): DetectorVerdict {
  const muted = DETECTOR_MUTES[detector]?.[objective];
  if (muted && !isGuardDetector(detector)) return { kind: 'mute', because: muted };
  const reterm = DETECTOR_RETERM[detector];
  if (reterm) return { kind: 'reterm', from: reterm };
  return { kind: 'on' };
}

/**
 * The deck: every detector that can mean something for this objective.
 *
 * Derived, never stored. Storing it is how it goes stale the first time a
 * detector is added.
 *
 * A muted detector is NOT starved. It did not fail to run and it is not a gap in
 * coverage — it does not apply here, and the screen must not list it as one.
 */
export function deckFor(objective: OptimizationObjective): AccountDetector[] {
  return DETECTOR_ORDER.filter((detector) => verdictFor(detector, objective).kind !== 'mute');
}

/**
 * The prior on confidence, from how well this objective's signal predicts at all.
 *
 * `confidence` on a candidate used to default to 1, which meant an uncalibrated
 * conversations account ranked exactly as confidently as a measured purchase
 * account. Two different things multiply here and both belong:
 *
 *   evidence       — the detector's own read of ITS sample (it already sets this)
 *   predictiveness — the objective profile's measured Spearman ceiling, which
 *                    ranges from 0.88 on app_install to 0.45 on lead
 *
 * An uncalibrated profile's prior is BORROWED from a measured analog, so it is
 * discounted again rather than trusted. The factor is `IMPACT_CLASS_WEIGHT`'s
 * own `better_price` weight, reused deliberately: one discount vocabulary in the
 * catalogue, not two.
 */
export const UNCALIBRATED_PRIOR_DISCOUNT = IMPACT_CLASS_WEIGHT.better_price;

export function seedConfidence(args: {
  /** 0..1, what the detector already decided about its own sample. */
  evidence: number;
  /** The objective profile's `predictiveness`. */
  predictiveness: number;
  /** The profile's `calibrated` flag. False = the prior is somebody else's. */
  calibrated: boolean;
}): number {
  const { evidence, predictiveness, calibrated } = args;
  const bounded = Math.min(1, Math.max(0, evidence)) * Math.min(1, Math.max(0, predictiveness));
  const discounted = calibrated ? bounded : bounded * UNCALIBRATED_PRIOR_DISCOUNT;
  return Math.round(discounted * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// What the nine that cannot ask their question are waiting for.
//
// `computable: false` says a detector is blocked. It does not say BY WHAT, and a
// gap nobody can name is a gap nobody closes — nine separate one-line notes in
// ACCOUNT_DETECTOR_META are nine things to rediscover every time someone asks
// "what would it take". Grouping them by the thing that unblocks them turns a
// list of defects into a short list of decisions, and several detectors share a
// decision: two are waiting on the same economics, two on the same platform
// call.
//
// The screen groups its folded "could not run" list by this, so a reader sees
// four reasons instead of nine symptoms.
// ---------------------------------------------------------------------------

export const blockedCategorySchema = z.enum([
  /** Unit economics the business owns: margin, lifetime value, close rate. */
  'economics',
  /** A call to the ad platform we do not currently make. */
  'platform_call',
  /** A breakdown the platform returns and we do not persist. */
  'breakdown',
  /** Simply time: not enough history yet. */
  'history',
  /** An outside reference point we have no source for. */
  'benchmark',
  /** What happens on the advertiser's own site, after the click. */
  'post_click',
  /** Whether a converting person is new to the business or returning. */
  'customer_state',
]);
export type BlockedCategory = z.infer<typeof blockedCategorySchema>;

export const BLOCKED_CATEGORY_COPY: Record<BlockedCategory, string> = {
  economics: 'Unit economics — margin, lifetime value, close rate',
  platform_call: 'A platform call we do not make yet',
  breakdown: 'A breakdown the platform returns and we do not store',
  history: 'More history than this account has',
  benchmark: 'An outside benchmark we have no source for',
  post_click: 'What happens on the site, after the click',
  customer_state: 'Telling a new customer from a returning one',
};

/**
 * Detector → the one thing that unblocks it.
 *
 * Only detectors whose META says `computable: false` belong here, and every one
 * of them must: the test pins both directions, so a detector cannot be marked
 * blocked without naming what it waits for, and cannot be listed here once it
 * starts working.
 */
export const DETECTOR_BLOCKED_ON: Partial<Record<AccountDetector, BlockedCategory>> = {
  target_economics: 'economics',
  audience_overlap: 'platform_call',
  account_saturation: 'platform_call',
  market_allocation: 'breakdown',
  measurement_integrity: 'breakdown',
  seasonality: 'history',
  auction_pressure: 'benchmark',
  post_click: 'post_click',
  new_vs_returning: 'customer_state',
};

/** The blocked detectors of this deck, grouped by what would unblock them. */
export function blockedByCategory(
  objective: OptimizationObjective,
): Array<{ category: BlockedCategory; detectors: AccountDetector[] }> {
  const deck = new Set(deckFor(objective));
  const grouped = new Map<BlockedCategory, AccountDetector[]>();
  for (const detector of DETECTOR_ORDER) {
    if (!deck.has(detector)) continue;
    const category = DETECTOR_BLOCKED_ON[detector];
    if (!category) continue;
    const list = grouped.get(category) ?? [];
    list.push(detector);
    grouped.set(category, list);
  }
  return blockedCategorySchema.options
    .filter((category) => grouped.has(category))
    .map((category) => ({ category, detectors: grouped.get(category) ?? [] }));
}
