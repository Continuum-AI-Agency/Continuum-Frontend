/**
 * The shape every Jaina answer template shares: an executive sentence with the chart of what
 * it claims, a justification in sections, and the figures both read from.
 *
 * Charts, tables and items reference FIGURE IDS, never raw numbers: a chart point is
 * `{ label, figure_id }`, a table cell is a figure id, an item's badge is a figure id. So
 * there is exactly one list of numbers per block (`figures`), each with its source and
 * window, and everything the reader sees is a view of that list.
 *
 * Kept free of `jaina-report.ts` on purpose: that file imports this one to put the
 * `answer_template` block in the report union, so this one must not import it back.
 */

import { z } from 'zod';
import { figureIdSchema, templateFigureSchema } from './figure';
import { weeklyReportBodySchema } from './weekly_report_shape';

/**
 * The templates the MVP registers. An id only enters this list together with its file
 * (`jaina-templates/<id>.ts`), its Backend composer and its Frontend renderer — an id with no
 * renderer is a block the Frontend would degrade.
 */
export const ANSWER_TEMPLATE_IDS = [
  'explained_ranking',
  'spend_results_balance',
  'weekly_bridge',
  'three_numbers',
  'weekly_report',
] as const;
export const answerTemplateIdSchema = z.enum(ANSWER_TEMPLATE_IDS);
export type AnswerTemplateId = z.infer<typeof answerTemplateIdSchema>;

/** How the justification is laid out. `steps` (Qué medimos / Qué encontramos / Por qué pasa) is the only one built. */
export const TEMPLATE_LAYOUTS = ['steps'] as const;
export const templateLayoutSchema = z.enum(TEMPLATE_LAYOUTS);
export type TemplateLayout = z.infer<typeof templateLayoutSchema>;

/** The section kinds the `steps` layout reads, in its order. */
export const STEP_SECTION_KINDS = ['measured', 'found', 'why'] as const;

export const TEMPLATE_CHART_KINDS = ['bar_horizontal', 'bar', 'line', 'bridge'] as const;
export const templateChartKindSchema = z.enum(TEMPLATE_CHART_KINDS);
export type TemplateChartKind = z.infer<typeof templateChartKindSchema>;

export const templateChartPointSchema = z.object({
  label: z.string().min(1),
  figure_id: figureIdSchema,
  entity_id: z.string().nullable().default(null),
  /** The point the sentence is about (the winner, the step that moved). */
  emphasis: z.boolean().default(false),
});
export type TemplateChartPoint = z.infer<typeof templateChartPointSchema>;

export const templateChartSchema = z.object({
  kind: templateChartKindSchema,
  title: z.string().min(1),
  /** Under the chart: what is plotted, in what unit, and which way is better. May carry refs. */
  caption: z.string().nullable().default(null),
  points: z.array(templateChartPointSchema).min(1),
  /** A reference line (the account average), itself a figure. */
  reference: z
    .object({ label: z.string().min(1), figure_id: figureIdSchema })
    .nullable()
    .default(null),
  lower_is_better: z.boolean().default(false),
});
export type TemplateChart = z.infer<typeof templateChartSchema>;

export const templateTableSchema = z.object({
  columns: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).min(1),
  rows: z
    .array(
      z.object({
        label: z.string().min(1),
        entity_id: z.string().nullable().default(null),
        /** Column key → figure id. A column a row has no figure for renders "—". */
        cells: z.record(z.string(), figureIdSchema),
      }),
    )
    .min(1),
});
export type TemplateTable = z.infer<typeof templateTableSchema>;

export const TEMPLATE_ITEM_TONES = ['good', 'warn', 'bad', 'neutral'] as const;

/** One explained entry: a ranked row, a hypothesis, an event. Expands to its own `text`. */
export const templateItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  entity_id: z.string().nullable().default(null),
  /** The one figure shown beside the title (the row's cost per result). */
  badge_figure_id: figureIdSchema.nullable().default(null),
  /** Small figures under the title ("58 compras · 14,426 MXN"). */
  detail_figure_ids: z.array(figureIdSchema).default([]),
  /** Why this entry is where it is. Carries refs. */
  text: z.string().min(1),
  tone: z.enum(TEMPLATE_ITEM_TONES).default('neutral'),
});
export type TemplateItem = z.infer<typeof templateItemSchema>;

export const templateSectionSchema = z.object({
  kind: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: z.string().min(1),
  /** Carries refs. */
  text: z.string().min(1),
  chart: templateChartSchema.nullable().default(null),
  table: templateTableSchema.nullable().default(null),
  items: z.array(templateItemSchema).default([]),
});
export type TemplateSection = z.infer<typeof templateSectionSchema>;

/**
 * The fields an `answer_template` block carries beyond the block base. `jaina-report.ts`
 * extends `blockBaseSchema` with exactly this shape.
 */
export const answerTemplatePayloadShape = {
  template_id: answerTemplateIdSchema,
  /** Null reads as `steps`, the default for every template. */
  layout: templateLayoutSchema.nullable().default('steps'),
  executive: z.object({
    /** ONE sentence, with refs. */
    sentence: z.string().min(1),
    hero_chart: templateChartSchema.nullable().default(null),
  }),
  justification: z.object({ sections: z.array(templateSectionSchema).min(1) }),
  figures: z.array(templateFigureSchema).min(1),
  /** The template that was selected first and was not eligible, when this one is its fallback. */
  fallback_from: answerTemplateIdSchema.nullable().default(null),
  /** The weekly report's own structure (`weekly_report_shape.ts`). Null on every other template. */
  weekly_report: weeklyReportBodySchema.nullable().default(null),
};

export const answerTemplatePayloadSchema = z.object(answerTemplatePayloadShape);
export type AnswerTemplatePayload = z.infer<typeof answerTemplatePayloadSchema>;

/**
 * What one template promises about its payload, beyond the shared shape. Each template file
 * exports one; `validateTemplateBlock` holds every block to its template's spec.
 */
export type TemplateSpec = {
  id: AnswerTemplateId;
  /** The approved design's name, for logs and the README. */
  title: string;
  /** Section kinds that must be present (any order; the layout orders them). */
  requiredSections: ReadonlyArray<string>;
  /** Null: the hero chart is optional. Otherwise it is required and must be one of these kinds. */
  heroChartKinds: ReadonlyArray<TemplateChartKind> | null;
  /** The template's own payload schema: the shared shape plus what this template needs. */
  payloadSchema: z.ZodType<AnswerTemplatePayload>;
};

/**
 * The payload schema a spec implies: the shared shape, this template's id, its hero chart
 * rule and its required sections. A template needing more (a table in `found`, a bridge
 * chart) refines the result in its own file.
 */
export function templatePayloadSchemaFor(spec: {
  id: AnswerTemplateId;
  requiredSections: ReadonlyArray<string>;
  heroChartKinds: ReadonlyArray<TemplateChartKind> | null;
}): z.ZodType<AnswerTemplatePayload> {
  return answerTemplatePayloadSchema.superRefine((payload, ctx) => {
    if (payload.template_id !== spec.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['template_id'],
        message: `expected template_id "${spec.id}", got "${payload.template_id}"`,
      });
    }
    const hero = payload.executive.hero_chart;
    if (spec.heroChartKinds !== null) {
      if (hero === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['executive', 'hero_chart'],
          message: `${spec.id} needs a hero chart`,
        });
      } else if (!spec.heroChartKinds.includes(hero.kind)) {
        ctx.addIssue({
          code: 'custom',
          path: ['executive', 'hero_chart', 'kind'],
          message: `${spec.id} hero chart must be one of ${spec.heroChartKinds.join(', ')}`,
        });
      }
    }
    const present = new Set(payload.justification.sections.map((section) => section.kind));
    for (const kind of spec.requiredSections) {
      if (!present.has(kind)) {
        ctx.addIssue({
          code: 'custom',
          path: ['justification', 'sections'],
          message: `section "${kind}" is required`,
        });
      }
    }
  });
}
