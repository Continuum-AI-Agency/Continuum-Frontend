// The one normalized metrics slice of a portfolio, across platforms. A single producer
// (optimizer_get_portfolio_metrics) and two readers (the Overview tiles, Jaina) — so the
// Frontend and the agent stop doing their own arithmetic over the CPA series.
// Design: docs/optimizer-multiplatform/portafolio-modelo.html §D.1, with the canonical
// PlatformId in place of the page's hyphenated literals.

import { z } from 'zod';
import { CurrencyCodeSchema, PlatformIdSchema } from '../paid/platform';
import { OptimizationObjectiveSchema } from './engine-contracts';

export const AttributionKindSchema = z.enum(['platform', 'ga4', 'spreadsheet']);
export type AttributionKind = z.infer<typeof AttributionKindSchema>;

/** A closed window. `label` is what the UI and Jaina print; never re-derived from the dates. */
export const MetricWindowSchema = z.object({
  since: z.string().date(),
  until: z.string().date(),
  label: z.enum(['d3', 'd7', 'd14', 'd30', 'period']),
  /** True when the source used (GA4, a spreadsheet) has no data for today. */
  ends_yesterday: z.boolean(),
});
export type MetricWindow = z.infer<typeof MetricWindowSchema>;

/** numerator / denominator, or null when the denominator is 0 or either side is unknown.
 *  The one way a ratio in this contract is produced: never 0 for "no data", never Infinity. */
export function metricRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

const metricTotalsShape = {
  /** Major units of the portfolio currency. */
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  /** The platform KPI of the portfolio objective (kpi_field). Fractional on Google. */
  results: z.number().nonnegative(),
  cost_per_result: z.number().positive().nullable(),
  /** What the configured attribution source counts. Equal to results under 'platform'. */
  conversions: z.number().nonnegative(),
  /** Null when the source reports no value (Meta today) — never 0. */
  conversion_value: z.number().nonnegative().nullable(),
  roas: z.number().nonnegative().nullable(),
  /** Entities with spend > 0 in the window, so "present" is never mistaken for "delivering". */
  delivering_entities: z.number().int().nonnegative(),
  entities: z.number().int().nonnegative(),
};

type MetricTotalsShape = z.infer<z.ZodObject<typeof metricTotalsShape>>;

function refineTotals(totals: MetricTotalsShape, ctx: z.RefinementCtx): void {
  if (totals.results === 0 && totals.cost_per_result !== null) {
    ctx.addIssue({
      code: 'custom',
      message: 'no results means no cost per result (null)',
      path: ['cost_per_result'],
    });
  }
  if ((totals.spend === 0 || totals.conversion_value === null) && totals.roas !== null) {
    ctx.addIssue({
      code: 'custom',
      message: 'roas is null without spend or a reported value',
      path: ['roas'],
    });
  }
  if (totals.delivering_entities > totals.entities) {
    ctx.addIssue({
      code: 'custom',
      message: 'more delivering entities than entities',
      path: ['delivering_entities'],
    });
  }
}

export const MetricTotalsSchema = z.object(metricTotalsShape).superRefine(refineTotals);
export type MetricTotals = z.infer<typeof MetricTotalsSchema>;

/** One platform's share of the slice. Rows sum exactly to `totals` on spend, results,
 *  impressions and clicks (the bench asserts it); a platform with no entities is absent. */
export const PlatformMetricTotalsSchema = z
  .object({ platform: PlatformIdSchema, ...metricTotalsShape })
  .superRefine(refineTotals);
export type PlatformMetricTotals = z.infer<typeof PlatformMetricTotalsSchema>;

export const ConversionsBySourceSchema = z.object({
  kind: AttributionKindSchema,
  /** Null for 'platform'. */
  source_id: z.string().uuid().nullable(),
  label: z.string(),
  conversions: z.number().nonnegative(),
  conversion_value: z.number().nonnegative().nullable(),
  /** Share of spending entities the source matched. */
  coverage_pct: z.number().min(0).max(1),
  refreshed_at: z.string().datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
});
export type ConversionsBySource = z.infer<typeof ConversionsBySourceSchema>;

export const PortfolioAttributionSchema = z
  .object({
    /** What the portfolio asks for. */
    configured: AttributionKindSchema,
    /** What this slice actually used. */
    used: AttributionKindSchema,
    fallback_reason: z.enum(['coverage', 'error', 'none']),
  })
  .refine((a) => (a.used === a.configured) === (a.fallback_reason === 'none'), {
    message: 'a fallback (used ≠ configured) must name its reason, and only a fallback may',
    path: ['fallback_reason'],
  });

export const PortfolioMetricsSchema = z.object({
  portfolio_id: z.string().uuid(),
  objective: OptimizationObjectiveSchema,
  /** kpi_field: 'leads', 'conversations', … */
  result_kind: z.string(),
  /** One currency per portfolio; null prints the figure without a symbol. */
  currency: CurrencyCodeSchema.nullable(),
  window: MetricWindowSchema,
  prior_window: MetricWindowSchema.nullable(),
  attribution: PortfolioAttributionSchema,
  totals: MetricTotalsSchema,
  prior_totals: MetricTotalsSchema.nullable(),
  target: z.object({ cpa: z.number().positive().nullable(), metric: z.string().nullable() }),
  by_platform: z.array(PlatformMetricTotalsSchema),
  conversions_by_source: z.array(ConversionsBySourceSchema),
  read_at: z.string().datetime({ offset: true }),
});
export type PortfolioMetrics = z.infer<typeof PortfolioMetricsSchema>;
