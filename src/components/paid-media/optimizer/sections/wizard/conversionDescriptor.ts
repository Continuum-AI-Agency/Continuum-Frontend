// Describing a conversion only the advertiser can name.
//
// Shared by the two places it can be captured — the create wizard's goal step and the
// Manage panel — because a descriptor typed at creation and one typed afterwards have to
// be the same object, validated the same way. The contract in `@continuum/contracts` owns
// the shape; this owns the half-typed form on the way to it.

import type { AnalogObjective, ConversionDescriptor } from '@continuum/contracts';
import { conversionDescriptorSchema, inferAnalog } from '@continuum/contracts';

/**
 * The descriptor form's own state, as strings — what an operator is halfway through typing
 * is not a `ConversionDescriptor` yet, and pretending it is would mean a half-typed number
 * reaching the contract.
 *
 * Held outside React Hook Form deliberately: `portfolioFields` owns one descriptor per
 * COLUMN, and this is one column holding seven answers. Keeping it here means the form
 * schema stays a map of scalars and the descriptor is validated by the contract that owns
 * it, in one place, on the way out.
 */
export type ConversionDescriptorDraft = {
  event_id: string;
  result_label: string;
  cost_label: string;
  typical_lag_days: string;
  events_per_week: string;
  carries_revenue: boolean;
  /** null = let it be inferred. A value here is a person overruling the inference. */
  analog: AnalogObjective | null;
};

export const EMPTY_DESCRIPTOR_DRAFT: ConversionDescriptorDraft = {
  event_id: '',
  result_label: '',
  cost_label: '',
  typical_lag_days: '',
  events_per_week: '',
  carries_revenue: false,
  analog: null,
};

/** Seed the form from what is stored. A declared analog stays declared. */
export function descriptorDraftFrom(
  stored: ConversionDescriptor | null | undefined,
): ConversionDescriptorDraft {
  if (!stored) return EMPTY_DESCRIPTOR_DRAFT;
  return {
    event_id: stored.event_id,
    result_label: stored.result_label,
    cost_label: stored.cost_label,
    typical_lag_days: String(stored.typical_lag_days),
    events_per_week: String(stored.events_per_week),
    carries_revenue: stored.carries_revenue,
    analog: stored.analog_source === 'declared' ? stored.analog : null,
  };
}

/**
 * The draft as the contract sees it, or the one sentence that stops it.
 *
 * Blank is checked BEFORE `Number`: `Number('')` is 0, so an unanswered "how long does it
 * take to arrive" would otherwise validate as "it arrives instantly" — a wrong answer the
 * inference then acts on, which is worse than no answer at all.
 */
export function buildConversionDescriptor(
  draft: ConversionDescriptorDraft,
): { descriptor: ConversionDescriptor } | { error: string } {
  if (draft.event_id.trim() === '') return { error: 'Name the event as the platform reports it.' };
  if (draft.result_label.trim() === '') return { error: 'Say what you call one of these.' };
  if (draft.cost_label.trim() === '') return { error: 'Say what you call the cost of one.' };
  if (draft.typical_lag_days.trim() === '') {
    return { error: 'Say how many days it usually takes to arrive.' };
  }
  if (draft.events_per_week.trim() === '') {
    return { error: 'Say roughly how many land in a week.' };
  }
  const typical_lag_days = Number(draft.typical_lag_days);
  const events_per_week = Number(draft.events_per_week);
  const inferred = inferAnalog({
    typicalLagDays: typical_lag_days,
    eventsPerWeek: events_per_week,
    carriesRevenue: draft.carries_revenue,
  });
  const parsed = conversionDescriptorSchema.safeParse({
    event_id: draft.event_id.trim(),
    result_label: draft.result_label.trim(),
    cost_label: draft.cost_label.trim(),
    analog: draft.analog ?? inferred,
    analog_source: draft.analog ? 'declared' : 'inferred',
    typical_lag_days,
    events_per_week,
    carries_revenue: draft.carries_revenue,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That conversion cannot be saved yet.' };
  }
  return { descriptor: parsed.data };
}

/** Same seven answers, or not. Stringified because the shape is flat and fully ordered. */
export function sameDescriptor(
  a: ConversionDescriptor | null,
  b: ConversionDescriptor | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.event_id === b.event_id &&
    a.result_label === b.result_label &&
    a.cost_label === b.cost_label &&
    a.analog === b.analog &&
    a.analog_source === b.analog_source &&
    a.typical_lag_days === b.typical_lag_days &&
    a.events_per_week === b.events_per_week &&
    a.carries_revenue === b.carries_revenue
  );
}

export const ANALOG_LABEL: Record<AnalogObjective, string> = {
  purchase: 'a purchase',
  signup: 'a signup',
  lead: 'a lead',
};
