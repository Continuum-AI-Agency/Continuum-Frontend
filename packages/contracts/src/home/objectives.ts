// What the Home measures for a brand. A brand (or one of its ad accounts) leads its overview with
// an ordered list of objectives: each one names a paid result the account produces and the label
// the client recognises it by ("Tours booked" for a purchase event logged inside WhatsApp).
//
// Persisted in brand_profiles.home_profiles.objectives. When no row exists the Home infers the
// list from the account's own results, so it always has something to show.

import { z } from 'zod';

export const homeObjectiveMetricSchema = z.enum([
  'purchase_value',
  'purchases',
  'leads',
  'conversations',
  'clicks',
  'impressions',
  'spend',
]);
export type HomeObjectiveMetric = z.infer<typeof homeObjectiveMetricSchema>;

export const homeObjectiveRoleSchema = z.enum(['primary', 'secondary']);
export type HomeObjectiveRole = z.infer<typeof homeObjectiveRoleSchema>;

export const homeObjectiveSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(48),
  metric: homeObjectiveMetricSchema,
  role: homeObjectiveRoleSchema,
});
export type HomeObjective = z.infer<typeof homeObjectiveSchema>;

/** At most one primary, and it comes first. Three objectives is the most the strip shows. */
export const homeObjectiveListSchema = z
  .array(homeObjectiveSchema)
  .max(3)
  .refine((list) => list.filter((objective) => objective.role === 'primary').length <= 1, {
    message: 'Only one objective can be primary.',
  });

export const HOME_PROFILE_BRAND_SCOPE = 'brand';

export const homeProfileSourceSchema = z.enum(['inferred', 'user']);
export type HomeProfileSource = z.infer<typeof homeProfileSourceSchema>;

export const homeProfileRowSchema = z.object({
  brand_id: z.string(),
  scope: z.string(),
  objectives: homeObjectiveListSchema,
  source: homeProfileSourceSchema,
  updated_at: z.string().nullable().optional(),
});
export type HomeProfileRow = z.infer<typeof homeProfileRowSchema>;

type MetricMeta = {
  label: string;
  /** How one unit of spend is read against this result; null when cost per result means nothing. */
  costLabel: string | null;
  unit: 'count' | 'currency';
};

export const HOME_OBJECTIVE_METRICS: Record<HomeObjectiveMetric, MetricMeta> = {
  purchase_value: { label: 'Revenue', costLabel: 'ROAS', unit: 'currency' },
  purchases: { label: 'Purchases', costLabel: 'Cost per purchase', unit: 'count' },
  leads: { label: 'Leads', costLabel: 'Cost per lead', unit: 'count' },
  conversations: {
    label: 'Conversations started',
    costLabel: 'Cost per conversation',
    unit: 'count',
  },
  clicks: { label: 'Clicks', costLabel: 'Cost per click', unit: 'count' },
  impressions: { label: 'Impressions', costLabel: 'CPM', unit: 'count' },
  spend: { label: 'Spend', costLabel: null, unit: 'currency' },
};

/** Account totals the inference reads: one number per result kind over the same window. */
export type HomeResultTotals = Partial<Record<HomeObjectiveMetric, number>>;

const RESULT_KINDS: HomeObjectiveMetric[] = ['purchases', 'leads', 'conversations'];

function objectiveFor(metric: HomeObjectiveMetric, role: HomeObjectiveRole): HomeObjective {
  return { id: metric, label: HOME_OBJECTIVE_METRICS[metric].label, metric, role };
}

/**
 * The objectives an account's own results suggest, when nobody has said otherwise.
 *
 * Revenue leads when purchases carry a value (a store). Otherwise the primary is the first
 * result kind that happened, in the order a business usually pays for it: purchases, then
 * leads, then conversations. The secondary is the most frequent of the remaining kinds. An
 * account with no results at all still shows its spend.
 */
export function inferHomeObjectives(totals: HomeResultTotals): HomeObjective[] {
  const count = (metric: HomeObjectiveMetric) => {
    const value = totals[metric];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
  };

  if (count('purchase_value') > 0 && count('purchases') > 0) {
    return [objectiveFor('purchase_value', 'primary'), objectiveFor('purchases', 'secondary')];
  }

  const happened = RESULT_KINDS.filter((metric) => count(metric) > 0);
  const [primary] = happened;
  if (!primary) {
    return [objectiveFor(count('clicks') > 0 ? 'clicks' : 'spend', 'primary')];
  }

  const secondary = happened
    .filter((metric) => metric !== primary)
    .sort((a, b) => count(b) - count(a))[0];
  return secondary
    ? [objectiveFor(primary, 'primary'), objectiveFor(secondary, 'secondary')]
    : [objectiveFor(primary, 'primary')];
}

/** The saved row for this scope wins, then the brand-wide row, then inference. */
export function resolveHomeObjectives(input: {
  scope: string;
  rows: HomeProfileRow[];
  totals: HomeResultTotals;
}): { objectives: HomeObjective[]; source: HomeProfileSource; fromScope: string | null } {
  const exact = input.rows.find((row) => row.scope === input.scope);
  const brand = input.rows.find((row) => row.scope === HOME_PROFILE_BRAND_SCOPE);
  const saved = exact ?? brand;
  if (saved && saved.objectives.length > 0) {
    return { objectives: saved.objectives, source: saved.source, fromScope: saved.scope };
  }
  return { objectives: inferHomeObjectives(input.totals), source: 'inferred', fromScope: null };
}

/** Promote one objective to primary; every other one becomes secondary, order kept. */
export function makeHomeObjectivePrimary(list: HomeObjective[], id: string): HomeObjective[] {
  const target = list.find((objective) => objective.id === id);
  if (!target) return list;
  return [
    { ...target, role: 'primary' },
    ...list
      .filter((objective) => objective.id !== id)
      .map((objective) => ({ ...objective, role: 'secondary' as const })),
  ];
}
