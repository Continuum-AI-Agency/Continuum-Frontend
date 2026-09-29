// What each insight is allowed to DO, and who decided that.
//
// ONE RULE, AND EVERYTHING ELSE FOLLOWS: an insight's state can never exceed its family's.
// A detector set to `autopilot` inside a family set to `recommend` behaves as `recommend`,
// and the UI says so on the row rather than silently downgrading it. One rule, one place, and
// no second permission system — two permission systems is how a product ends up with a switch
// that is off and a thing that happens anyway.
//
// It also makes the kill switch trivial: set every family to `recommend` and nothing acts,
// whatever any per-insight setting says.
//
// WHY THIS EXTENDS THE SCOPES THAT EXIST rather than sitting beside them. A portfolio already
// carries five autopilot scopes. The account read introduces actions none of them cover, so
// the answer is the same scopes plus what is missing — not a parallel system that has to be
// kept in agreement with the first one forever.
//
// `structure` is new and needed: it PAUSES, MERGES and CONSOLIDATES. It turns things off,
// which is why it cannot ride inside `budget`.
//
// `measurement` is a family with NO SWITCH, deliberately. It approves nothing — the two guards
// and the detectors that only ever report. Giving it a boolean would put a control in the data
// for something that has no control, and someone would eventually turn it off.

import { z } from 'zod';
import type { AccountDetector, ResultRung } from './account-strategy';

export const actionFamilySchema = z.enum([
  'budget',
  'creative_swap',
  'audience_change',
  'new_audience',
  'new_creatives',
  'structure',
  'measurement',
]);
export type ActionFamily = z.infer<typeof actionFamilySchema>;

/** The families a person can actually approve. `measurement` is absent because it has no switch. */
export const APPROVABLE_FAMILIES = actionFamilySchema.options.filter(
  (family): family is Exclude<ActionFamily, 'measurement'> => family !== 'measurement',
);

export const ACTION_FAMILY_COPY: Record<ActionFamily, { label: string; body: string }> = {
  budget: { label: 'Budget moves', body: 'Moves money inside your guardrails.' },
  creative_swap: {
    label: 'Creative rotation',
    body: 'Approves the rotation and publishes the successor paused.',
  },
  audience_change: {
    label: 'Replace an audience',
    body: 'The new ad set is created paused; the current one keeps running.',
  },
  new_audience: { label: 'Add an audience', body: 'Created paused, beside the current one.' },
  new_creatives: {
    label: 'Flash creatives',
    body: 'Generates into the Library; nothing is published.',
  },
  structure: {
    label: 'Structure changes',
    body: 'Pauses, merges and consolidates. It turns things OFF, which is why it is its own family.',
  },
  measurement: {
    label: 'Measurement and economics',
    body: 'Reports only. Approves nothing, and cannot be switched off.',
  },
};

export const insightStateSchema = z.enum(['off', 'recommend', 'autopilot']);
export type InsightState = z.infer<typeof insightStateSchema>;

const STATE_RANK: Record<InsightState, number> = { off: 0, recommend: 1, autopilot: 2 };

/** Which family's permission each detector answers to. */
export const DETECTOR_ACTION_FAMILY: Record<AccountDetector, ActionFamily> = {
  portfolio_reallocation: 'budget',
  account_pacing: 'budget',
  scale_readiness: 'budget',
  guardrail_bottleneck: 'budget',
  bid_strategy: 'budget',

  creative_supply: 'creative_swap',
  angle_concentration: 'creative_swap',
  format_gap: 'creative_swap',

  audience_overlap: 'audience_change',
  account_saturation: 'audience_change',
  new_vs_returning: 'audience_change',

  funnel_coverage: 'new_audience',
  market_allocation: 'new_audience',

  testing_discipline: 'new_creatives',

  dead_tail: 'structure',
  structure_consolidation: 'structure',
  placement_mix: 'structure',
  optimization_event: 'structure',
  platform_diversification: 'structure',

  measurement_integrity: 'measurement',
  target_economics: 'measurement',
  // Nothing here can be applied — a budget that is not going out is restored by a person
  // finding out why — and a report that the money stopped must not have an off switch.
  delivery_collapse: 'measurement',
  decision_window: 'measurement',
  seasonality: 'measurement',
  auction_pressure: 'measurement',
  post_click: 'measurement',
};

/**
 * What actually happens when this insight fires.
 *
 * `lowered` is not a detail: a state that was asked for and did not take must be VISIBLE, or
 * someone sets a detector to autopilot, sees nothing happen, and stops trusting the switch.
 */
export function resolveInsightState(args: {
  detector: AccountDetector;
  /** The per-insight setting, when someone made one. */
  insight?: InsightState | null;
  /** The family's ceiling. Absent means the shipped default for that family. */
  familyCeiling?: InsightState | null;
}): { effective: InsightState; ceiling: InsightState; lowered: boolean } {
  const family = DETECTOR_ACTION_FAMILY[args.detector];

  // Measurement reports and cannot be silenced. A product that can switch off its own
  // instrument check has no instrument check.
  if (family === 'measurement') {
    return { effective: 'recommend', ceiling: 'recommend', lowered: false };
  }

  const ceiling = args.familyCeiling ?? 'recommend';
  const asked = args.insight ?? ceiling;
  const effective = STATE_RANK[asked] > STATE_RANK[ceiling] ? ceiling : asked;
  return { effective, ceiling, lowered: effective !== asked };
}

/**
 * The shipped template for an objective. Three independent conditions, three different reasons.
 *
 * MEASURED. An uncalibrated profile's numbers are borrowed from an analog and its
 * predictiveness is somebody else's Spearman. Acting unattended on it is acting on a prior
 * nobody measured.
 *
 * PREDICTIVE ENOUGH. `lead` is measured and still excluded: a Spearman ceiling near 0.45 means
 * unattended moves would act on noise about as often as on signal.
 *
 * AND BUYING SOMETHING REAL. This one is not obvious and it is why the rung is here. `traffic`
 * and `awareness` are both measured AND highly predictive — under the first two conditions
 * alone they would earn unattended budget. But their KPI is a PROXY, and a proxy objective's
 * whole risk is that you are buying the wrong thing. Automating money toward a cheaper landing
 * page view is automating "buy more of the thing that may not matter", precisely and at speed.
 * Unattended budget needs a result that is money or a person.
 *
 * Together these leave three of eleven objectives with anything unattended, and each of the
 * eight exclusions has its own distinct reason rather than one blanket rule.
 */
export function shippedCeilings(args: {
  calibrated: boolean;
  /** The profile's measured Spearman. Below the floor, nothing is unattended. */
  predictiveness: number;
  /** How far this objective's result sits from the money. */
  rung: ResultRung;
}): Record<Exclude<ActionFamily, 'measurement'>, InsightState> {
  const buysSomethingReal = args.rung === 'money' || args.rung === 'person';
  const trustworthy =
    args.calibrated && args.predictiveness >= AUTOPILOT_PREDICTIVENESS_FLOOR && buysSomethingReal;
  return {
    budget: trustworthy ? 'autopilot' : 'recommend',
    creative_swap: 'recommend',
    audience_change: 'recommend',
    new_audience: 'recommend',
    new_creatives: 'recommend',
    structure: 'recommend',
  };
}

/**
 * Below this, no objective gets an unattended anything.
 *
 * 0.6 sits above `lead` and `conversations` at 0.45 and below `signup` at 0.75 — chosen so the
 * noisiest measured objective in the catalogue is excluded by the number rather than by a
 * special case naming it.
 */
export const AUTOPILOT_PREDICTIVENESS_FLOOR = 0.6;

/**
 * Apply stored approvals to a whole run's candidates.
 *
 * Kept here rather than in the worker so the screen, the worker and any future caller get the
 * SAME answer to "what will this do" — the one rule about a family ceiling is only one rule if
 * it lives in one place.
 *
 * `families` and `insights` are what someone deliberately changed; anything absent falls back
 * to `defaults`, which the caller builds from the objective's own profile. An empty pair of
 * maps therefore means "nobody has changed anything", never "everything is off".
 */
export function applyApprovals<T extends { detector: AccountDetector }>(
  candidates: readonly T[],
  args: {
    families: Record<string, string>;
    insights: Record<string, string>;
    defaults: Record<Exclude<ActionFamily, 'measurement'>, InsightState>;
  },
): Array<T & { state: InsightState; state_lowered: boolean }> {
  const asState = (value: string | undefined): InsightState | null => {
    const parsed = insightStateSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };
  return candidates.map((candidate) => {
    const family = DETECTOR_ACTION_FAMILY[candidate.detector];
    const ceiling =
      family === 'measurement'
        ? null
        : (asState(args.families[family]) ??
          args.defaults[family as Exclude<ActionFamily, 'measurement'>]);
    const resolved = resolveInsightState({
      detector: candidate.detector,
      insight: asState(args.insights[candidate.detector]),
      familyCeiling: ceiling,
    });
    return { ...candidate, state: resolved.effective, state_lowered: resolved.lowered };
  });
}
