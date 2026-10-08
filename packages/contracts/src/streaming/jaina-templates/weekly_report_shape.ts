/**
 * The body of a `weekly_report` answer template — the structure the Prism weekly report
 * carries beyond the shared template shape (docs/prism-reference.md, "The weekly report
 * examples — anatomy"): a header with two windows, KPI tiles against the week before, one
 * section per Optimizer objective and the recommendation cards.
 *
 * Every number is still a figure id. The header's dates are the windows the figures were read
 * over, not numbers of their own; a tile, a period row and a card only POINT at figures, so the
 * one list of numbers stays `figures` and `validateTemplateBlock` holds all of it to the same
 * source / window / ref rules as every other template.
 *
 * Kept free of `core.ts` on purpose: `core.ts` puts this shape on the shared payload, so this
 * file must not import it back. The weekly-only rules live in `weekly_report.ts`.
 */

import { z } from 'zod';
import { figureIdSchema, figureWindowSchema } from './figure';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One reporting window, as the figures read over it state it. */
export const weeklyReportPeriodSchema = z.object({
  since: z.string().regex(ISO_DATE),
  until: z.string().regex(ISO_DATE),
  /** The window in the reader's words: "semana del lunes 22 al domingo 28 de septiembre". */
  label: z.string().min(1),
});
export type WeeklyReportPeriod = z.infer<typeof weeklyReportPeriodSchema>;

export const weeklyReportHeaderSchema = z.object({
  brand_name: z.string().min(1),
  ad_account_id: z.string().min(1),
  /** IANA zone the windows are cut in — the ad account's, as Meta reports it. */
  timezone: z.string().min(1),
  /** ISO 4217. Null only when the account's currency could not be read; money then prints bare. */
  currency: z.string().nullable(),
  /** The last complete Monday–Sunday week. */
  period_a: weeklyReportPeriodSchema,
  /** Month to date: the first of Period A's closing month through the end of Period A. */
  period_b: weeklyReportPeriodSchema,
  /** The Monday–Sunday week before Period A — the tiles' prior. */
  prior_a: weeklyReportPeriodSchema,
});
export type WeeklyReportHeader = z.infer<typeof weeklyReportHeaderSchema>;

/** The one-word read of a tile against its prior; the same words as `metricReadOf`. */
export const WEEKLY_TILE_READS = ['mejor', 'peor', 'igual', 'sin_comparacion'] as const;
export const weeklyTileReadSchema = z.enum(WEEKLY_TILE_READS);
export type WeeklyTileRead = z.infer<typeof weeklyTileReadSchema>;

export const weeklyReportTileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** The value over Period A. */
  figure_id: figureIdSchema,
  /** The same metric over `header.prior_a`. Null when no prior could be read. */
  prior_figure_id: figureIdSchema.nullable(),
  /** Derived by the Backend from the two figures and the metric's polarity, never typed. */
  read: weeklyTileReadSchema,
  lower_is_better: z.boolean(),
});
export type WeeklyReportTile = z.infer<typeof weeklyReportTileSchema>;

/** Spend, results and their price over one period, against the portfolios' target. */
export const weeklyReportPeriodRowSchema = z.object({
  spend: figureIdSchema,
  results: figureIdSchema,
  /** Null when the period has no results — a price of nothing is not a price. */
  cost_per_result: figureIdSchema.nullable(),
  /** The portfolios' `cpa_target`. Null when no portfolio of the objective sets one. */
  target: figureIdSchema.nullable(),
  /** (cost_per_result − target) ÷ target, a FRACTION. Null when either side is null. */
  delta_vs_target: figureIdSchema.nullable(),
});
export type WeeklyReportPeriodRow = z.infer<typeof weeklyReportPeriodRowSchema>;

export const WEEKLY_SIGNAL_TONES = ['good', 'warn', 'bad', 'neutral'] as const;

export const weeklyReportObjectiveSchema = z.object({
  /** The Optimizer portfolio objective, verbatim (`leads`, `conversations`, `purchases`, …). */
  objective: z.string().min(1),
  /** The result in the reader's words: "Leads", "Conversaciones". */
  label: z.string().min(1),
  /** The portfolios this section speaks for. */
  portfolio_ids: z.array(z.string().min(1)).min(1),
  /** False when no campaign buying this objective spent in either period. */
  active: z.boolean(),
  /** Required when `active` is false: the explicit "No active campaigns" line. */
  no_active_note: z.string().min(1).nullable(),
  /** Null exactly when `active` is false. */
  period_a: weeklyReportPeriodRowSchema.nullable(),
  period_b: weeklyReportPeriodRowSchema.nullable(),
  /** The worded Señal. Carries refs. */
  signal: z.object({ text: z.string().min(1), tone: z.enum(WEEKLY_SIGNAL_TONES) }),
  /** What happened / why it matters / what to do. Each carries refs. */
  what: z.string().min(1),
  so_what: z.string().min(1),
  now_what: z.string().min(1),
});
export type WeeklyReportObjective = z.infer<typeof weeklyReportObjectiveSchema>;

export const WEEKLY_ENTITY_LEVELS = ['account', 'campaign', 'adset', 'ad'] as const;
export const WEEKLY_IMPACT_LEVELS = ['high', 'medium', 'low'] as const;
export const WEEKLY_PRIORITIES = ['this_week', 'next_2_weeks'] as const;

export const weeklyReportRecommendationSchema = z.object({
  id: z.string().min(1),
  /** The Optimizer recommendation row this card was built from. */
  recommendation_id: z.string().min(1),
  portfolio_id: z.string().min(1),
  /** Qué hacer. */
  what: z.string().min(1),
  /** Dónde. */
  where: z.object({
    entity_id: z.string().min(1),
    entity_name: z.string().min(1),
    level: z.enum(WEEKLY_ENTITY_LEVELS),
  }),
  /** Por qué: the figure(s) and the read they came from. `text` carries refs. */
  why: z.object({
    text: z.string().min(1),
    figure_ids: z.array(figureIdSchema).min(1),
    /** The tool and window of `figure_ids[0]` — restated for the card, checked against it. */
    source: z.object({ tool: z.string().min(1), window: figureWindowSchema }),
  }),
  /** Impacto esperado — Jaina's labelled estimate: the Optimizer stores no expected lift. */
  impact: z.object({
    level: z.enum(WEEKLY_IMPACT_LEVELS),
    note: z.string().min(1),
    basis: z.literal('estimate'),
  }),
  priority: z.enum(WEEKLY_PRIORITIES),
});
export type WeeklyReportRecommendation = z.infer<typeof weeklyReportRecommendationSchema>;

export const weeklyReportBodySchema = z.object({
  header: weeklyReportHeaderSchema,
  tiles: z.array(weeklyReportTileSchema).min(1),
  objectives: z.array(weeklyReportObjectiveSchema).min(1),
  /** Empty when no portfolio has a pending recommendation — the renderer says so. */
  recommendations: z.array(weeklyReportRecommendationSchema),
});
export type WeeklyReportBody = z.infer<typeof weeklyReportBodySchema>;

/** Every figure id the body points at. */
export function weeklyReportRefsOf(body: WeeklyReportBody): string[] {
  const rowRefs = (row: WeeklyReportPeriodRow | null): string[] =>
    row
      ? [row.spend, row.results, row.cost_per_result, row.target, row.delta_vs_target].filter(
          (ref): ref is string => ref !== null,
        )
      : [];
  return [
    ...body.tiles.flatMap((tile) => [
      tile.figure_id,
      ...(tile.prior_figure_id ? [tile.prior_figure_id] : []),
    ]),
    ...body.objectives.flatMap((section) => [
      ...rowRefs(section.period_a),
      ...rowRefs(section.period_b),
    ]),
    ...body.recommendations.flatMap((card) => card.why.figure_ids),
  ];
}

/** Every prose field of the body — each may carry refs, and none may type a number. */
export function weeklyReportProseOf(body: WeeklyReportBody): string[] {
  return [
    ...body.objectives.flatMap((section) => [
      section.signal.text,
      section.what,
      section.so_what,
      section.now_what,
      ...(section.no_active_note ? [section.no_active_note] : []),
    ]),
    ...body.recommendations.flatMap((card) => [card.what, card.why.text, card.impact.note]),
  ];
}
