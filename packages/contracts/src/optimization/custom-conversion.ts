// A conversion the business names itself.
//
// A qualified lead, a booked demo, an approved application. The objective enum is a closed set
// of eleven, and none of them is "MQL" — so these were being forced into `purchase` or `lead`
// and mislabelled everywhere the result is rendered. `custom` is the twelfth member, and it
// carries a descriptor instead of pretending to be one of the others.
//
// IT INHERITS, IT DOES NOT INVENT. There is no calibration for a conversion nobody has
// backtested, so a custom objective borrows a measured objective's profile whole and is marked
// `calibrated: false` — the same thing `conversations` already does. Its cards then rank more
// cautiously through the confidence prior, automatically, with no special case.
//
// AND THE ANALOG IS INFERRED, NOT ASKED. That was a product decision: one more question at
// setup is one more place to abandon setup. Two signals the system can already see decide it —
// how long the event takes to arrive, and how many of them there are — and the card SHOWS
// which analog it inherited, so a wrong guess is visible and correctable rather than silent.

import { z } from 'zod';
import { OptimizationObjectiveSchema } from './engine-contracts';

/** The measured objectives a custom conversion may inherit from. Never another custom. */
export const analogObjectiveSchema = OptimizationObjectiveSchema.extract([
  'purchase',
  'signup',
  'lead',
]);
export type AnalogObjective = z.infer<typeof analogObjectiveSchema>;

export const conversionDescriptorSchema = z.object({
  /** What the platform calls it — the pixel or CRM event id, never a display label. */
  event_id: z.string().min(1),
  /** What a person calls it. Renders everywhere `resultLabel` renders. */
  result_label: z.string().min(1),
  /** "Cost per qualified lead". Rendered wherever a cost label is. */
  cost_label: z.string().min(1),
  /**
   * The measured objective whose profile this borrows, and HOW it was decided. Inferred keeps
   * setup to zero questions; declared means a person corrected it, and a correction must
   * survive the next inference or it is not a correction.
   */
  analog: analogObjectiveSchema,
  analog_source: z.enum(['inferred', 'declared']).default('inferred'),
  /** Median days from click to the event landing. Drives the decision window and the lookback. */
  typical_lag_days: z.number().min(0).max(30),
  /** Events a week, over the account's own window. Sparse signals need the noisy profile. */
  events_per_week: z.number().min(0),
  /** True when the event carries a monetary value — then it IS the money, not a step toward it. */
  carries_revenue: z.boolean().default(false),
});
export type ConversionDescriptor = z.infer<typeof conversionDescriptorSchema>;

/**
 * Days beyond which an event is "slow": it arrives after the window a daily read looks at, so
 * the noisy profile's de-weighting of recent data is the right behaviour rather than a
 * handicap. Two days is the first cutoff where a three-day read stops containing the event.
 */
export const SLOW_EVENT_DAYS = 2;

/**
 * Weekly events below which a signal is "sparse". Fifty a week is the learning threshold this
 * catalogue reasons in; half of it is where a weekly read stops being able to tell a change
 * from noise, which is exactly the condition `lead`'s significance gate exists for.
 */
export const SPARSE_EVENTS_PER_WEEK = 25;

/**
 * Which measured objective this conversion behaves like.
 *
 * Three cases, in order, and the order matters:
 *
 *   revenue on the event      → `purchase`. It is not a step toward the money, it IS the money,
 *                               and purchase is the only profile measured on that.
 *   slow OR sparse            → `lead`. The hardest profile in the catalogue: a gate, EWMA
 *                               smoothing, three-day data de-weighted to nearly nothing, and
 *                               the tightest caps. A CRM-fired qualified lead is exactly this.
 *   otherwise                 → `signup`. Dense, same-day, flat saturation, scales freely.
 *
 * Wrong about a fifth of the time, by construction — which is why the card shows what it
 * inferred and a person can correct it.
 */
export function inferAnalog(signal: {
  typicalLagDays: number;
  eventsPerWeek: number;
  carriesRevenue: boolean;
}): AnalogObjective {
  if (signal.carriesRevenue) return 'purchase';
  if (signal.typicalLagDays >= SLOW_EVENT_DAYS || signal.eventsPerWeek < SPARSE_EVENTS_PER_WEEK) {
    return 'lead';
  }
  return 'signup';
}

/** One line telling a reader what was inferred and letting them disagree with it. */
export function analogNote(descriptor: ConversionDescriptor): string {
  if (descriptor.analog_source === 'declared') {
    return `Measured like ${descriptor.analog}, because you said so.`;
  }
  const why = descriptor.carries_revenue
    ? 'it carries a value'
    : descriptor.typical_lag_days >= SLOW_EVENT_DAYS
      ? `it takes about ${descriptor.typical_lag_days} days to arrive`
      : descriptor.events_per_week < SPARSE_EVENTS_PER_WEEK
        ? 'there are few of them a week'
        : 'it is fast and frequent';
  return `Measured like ${descriptor.analog}, because ${why}. Change it if that is wrong.`;
}

/**
 * A stored descriptor, made usable — or null when the row does not carry one.
 *
 * Null is the ONLY failure mode, and it is the one the rest of the code already handles:
 * the column is absent until the migration lands, and a malformed blob must degrade to
 * today's behaviour rather than take an account's whole read down.
 *
 * An `inferred` analog is re-inferred here rather than trusted. The stored value was
 * inferred from a lag and a volume that both move; re-deriving it means a descriptor
 * corrected by newer figures stops being stale the moment they are written. A `declared`
 * analog is left exactly as a person set it — a correction that does not survive the next
 * inference is not a correction.
 */
export function resolveConversionDescriptor(raw: unknown): ConversionDescriptor | null {
  if (raw == null) return null;
  const parsed = conversionDescriptorSchema.safeParse(raw);
  if (!parsed.success) return null;
  const descriptor = parsed.data;
  if (descriptor.analog_source === 'declared') return descriptor;
  return {
    ...descriptor,
    analog: inferAnalog({
      typicalLagDays: descriptor.typical_lag_days,
      eventsPerWeek: descriptor.events_per_week,
      carriesRevenue: descriptor.carries_revenue,
    }),
  };
}

/**
 * The objective an account is actually MEASURED against.
 *
 * `custom` has no calibration of its own, so every read of it — the confidence prior, the
 * detector deck, the ceilings a family ships with — has to be taken against the analog.
 * Without this the twelfth objective falls through `getObjectiveProfile('custom')` to
 * `lead`'s numbers whatever the event does, which is right for a slow CRM event and wrong
 * for a same-day one carrying revenue.
 *
 * Every other objective answers for itself, and a `custom` portfolio with no descriptor
 * stays `custom` — the uncalibrated profile is the honest default when nobody has told us
 * what the event is.
 */
export function measuredObjective(
  objective: z.infer<typeof OptimizationObjectiveSchema> | null,
  descriptor: ConversionDescriptor | null,
): z.infer<typeof OptimizationObjectiveSchema> | null {
  if (objective !== 'custom') return objective;
  return descriptor ? descriptor.analog : objective;
}
