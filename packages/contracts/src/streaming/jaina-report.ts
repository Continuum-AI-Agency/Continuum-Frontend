/**
 * Jaina V2 report-block contract — the SINGLE canonical shape for the blocks
 * Jaina streams and the Frontend renders (Recharts v3 / shadcn block renderer).
 *
 * Before this file, the V2 block schema existed as two hand-maintained copies:
 *   - Backend: Continuum-Backend/App/agents-ts/Jaina/src/core/models.ts
 *   - Frontend: Continuum-Frontend/src/lib/jaina/schemas.ts
 * They drifted; when they did, the Backend emitted blocks the Frontend silently
 * dropped. This is the canonical source both sides now import (root AGENTS.md §4).
 *
 * Scope: the RUNTIME block shape that crosses the wire, plus the shared runtime
 * tolerance (lenient block schema + `degradeToNarrativeBlockV2`) both sides use
 * when a block arrives malformed. The Backend's Gemini-specific *synthesis*
 * schemas (`{k,v}` cell arrays, narrowed number unions, merged anyOf variants)
 * and the `coerceV2Block` reconstruction stay Backend-local — they are
 * generation implementation detail, not a contract.
 *
 * Import via the root entry only: `import { checkpointBlockV2Schema } from
 * '@continuum/contracts'` — Backend `moduleResolution: node` does not resolve
 * subpaths.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared item schemas referenced by multiple block variants
// ---------------------------------------------------------------------------

export const insightItemSchema = z.object({
  category: z.string(),
  title: z.string().optional(),
  text: z.string(),
  impact: z.string().nullable().default(null),
  severity: z.enum(["positive", "neutral", "watch", "risk"]).default("neutral"),
  confidence: z.string().nullable().default(null),
  evidence: z.array(z.string()).default([]),
});
export type InsightItem = z.infer<typeof insightItemSchema>;

// Evidence citation (analytical blocks only).
export const citationSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  cache_key: z.string().nullable().default(null),
  label: z.string().default(""),
});
export type Citation = z.infer<typeof citationSchema>;

// ---------------------------------------------------------------------------
// Block base + enums
// ---------------------------------------------------------------------------

export const blockCategorySchema = z.enum([
  "narrative",
  "metric_grid",
  "chart",
  "data_table",
  "insight_list",
  "comparison",
]);
export type BlockCategory = z.infer<typeof blockCategorySchema>;

export const blockPrioritySchema = z.enum(["primary", "secondary", "supplementary"]);
export type BlockPriority = z.infer<typeof blockPrioritySchema>;

// Exported so the Backend's local Gemini-synthesis schemas can extend the same
// base (they stay Backend-local but must share this shape).
export const blockBaseSchema = z.object({
  block_id: z.string(),
  category: blockCategorySchema,
  scope: z.string().min(1),
  title: z.string().min(1),
  priority: blockPrioritySchema.default("secondary"),
});

// ---------------------------------------------------------------------------
// Narrative block
// ---------------------------------------------------------------------------

export const narrativeBlockSchema = blockBaseSchema.extend({
  category: z.literal("narrative"),
  body: z.string().min(1),
  highlights: z.array(insightItemSchema).default([]),
  citations: z.array(citationSchema).default([]),
});
export type NarrativeBlock = z.infer<typeof narrativeBlockSchema>;

// ---------------------------------------------------------------------------
// Metric grid block
// ---------------------------------------------------------------------------

export const metricItemSchema = z.object({
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string().nullable().default(null),
  format: z.enum(["number", "currency", "percent", "multiplier"]).default("number"),
  change: z.number().nullable().default(null),
  change_direction: z.enum(["up", "down", "flat"]).nullable().default(null),
  severity: z.enum(["positive", "neutral", "watch", "risk"]).default("neutral"),
});
export type MetricItem = z.infer<typeof metricItemSchema>;

export const metricGridBlockSchema = blockBaseSchema.extend({
  category: z.literal("metric_grid"),
  metrics: z.array(metricItemSchema).min(1),
});
export type MetricGridBlock = z.infer<typeof metricGridBlockSchema>;

// ---------------------------------------------------------------------------
// Chart block (Recharts v3 / shadcn native)
// ---------------------------------------------------------------------------

export const chartTypeSchema = z.enum([
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "stacked_bar",
  "radar",
]);
export type ChartType = z.infer<typeof chartTypeSchema>;

export const chartSeriesConfigSchema = z.object({
  label: z.string(),
  color: z.string(),
});
export type ChartSeriesConfig = z.infer<typeof chartSeriesConfigSchema>;

// Exported (like `blockBaseSchema`) so consumers can compose render-specific
// fields on top — e.g. the Frontend widens `priority`/`value_format` and rebuilds
// the discriminated union. The chart-renderability invariants live on the refined
// `chartBlockSchema` below; composing on this base then re-parsing against
// `chartBlockSchema` re-applies them.
export const chartBlockBaseSchema = blockBaseSchema.extend({
  category: z.literal("chart"),
  chart_type: chartTypeSchema,
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).min(1),
  chart_config: z.record(z.string(), chartSeriesConfigSchema),
  category_key: z.string(),
  value_key: z.string().nullable().default(null),
  x_axis_label: z.string().nullable().default(null),
  y_axis_label: z.string().nullable().default(null),
  value_format: z.enum(["number", "currency", "percent", "multiplier"]).default("number"),
  annotation: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  // Data-harness provenance: when set, `data` was deterministically materialized
  // from the referenced dataset (see `@continuum/contracts` dataset.ts) rather
  // than authored by the model. Null on legacy/model-authored charts.
  dataset_id: z.string().nullable().default(null),
  // Per-point metadata aligned to `data` (entity ids, source, exact timestamp).
  // The Frontend looks these up by the row's `category_key` value to render
  // datapoint tooltips. Null when no dataset backs the chart.
  data_meta: z.array(z.record(z.string(), z.unknown())).nullable().default(null),
});

/**
 * Chart-renderability invariants — net-new validation the parallel copies never
 * enforced. A chart that violates these renders blank/garbled in Recharts, so we
 * reject it at the contract boundary (fail at emit, not at render):
 *   1. `category_key` must be present on every data row (the x-axis) — all types.
 *   2. For cartesian multi-series charts (bar/line/area/stacked_bar/radar), every
 *      series key declared in `chart_config` must appear on a data row (otherwise
 *      the series draws nothing and the legend lies). This does NOT apply to
 *      pie/doughnut, where `chart_config` is keyed by slice-label *values*
 *      (matching `fill: var(--color-{slice})`), not by data-row column keys.
 *
 * Shared by `chartBlockSchema` and the union's chart branch so both enforce the
 * same rules without re-parsing.
 */
const SLICE_KEYED_CHART_TYPES = new Set(["pie", "doughnut"]);

const addChartInvariantIssues = (
  block: z.infer<typeof chartBlockBaseSchema>,
  ctx: z.RefinementCtx,
): void => {
  const rows = block.data;
  const missingCategory = rows.some(
    (row) => !Object.prototype.hasOwnProperty.call(row, block.category_key),
  );
  if (missingCategory) {
    ctx.addIssue({
      code: "custom",
      path: ["data"],
      message: `category_key "${block.category_key}" is missing from one or more data rows`,
    });
  }

  // Pie/doughnut config is keyed by slice value, not data-row column key.
  if (SLICE_KEYED_CHART_TYPES.has(block.chart_type)) return;

  for (const key of Object.keys(block.chart_config)) {
    const presentInAnyRow = rows.some((row) =>
      Object.prototype.hasOwnProperty.call(row, key),
    );
    if (!presentInAnyRow) {
      ctx.addIssue({
        code: "custom",
        path: ["chart_config", key],
        message: `chart_config series key "${key}" never appears in data rows`,
      });
    }
  }
};

export const chartBlockSchema = chartBlockBaseSchema.superRefine(addChartInvariantIssues);
export type ChartBlock = z.infer<typeof chartBlockBaseSchema>;

// ---------------------------------------------------------------------------
// Data table block
// ---------------------------------------------------------------------------

export const tableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  // "creative" renders a lazy-loaded creative preview cell (hover) using the
  // matching `row_meta[i].creative` ref; all other formats render as values.
  format: z.enum(["text", "number", "currency", "percent", "multiplier", "creative"]).default("text"),
  align: z.enum(["left", "center", "right"]).default("left"),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;

export const dataTableBlockSchema = blockBaseSchema.extend({
  category: z.literal("data_table"),
  columns: z.array(tableColumnSchema).min(1),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1),
  notes: z.string().nullable().default(null),
  // Data-harness provenance: when set, `rows` were materialized from the dataset.
  dataset_id: z.string().nullable().default(null),
  // Per-row metadata aligned by index to `rows` (entity id, `creative` ref).
  row_meta: z.array(z.record(z.string(), z.unknown())).nullable().default(null),
});
export type DataTableBlock = z.infer<typeof dataTableBlockSchema>;

// ---------------------------------------------------------------------------
// Insight list block
// ---------------------------------------------------------------------------

export const insightListItemSchema = z.object({
  item_type: z.enum(["insight", "action", "recommendation", "question"]),
  title: z.string(),
  summary: z.string(),
  rationale: z.string().min(1),
  impact: z.string().min(1),
  severity: z.enum(["positive", "neutral", "watch", "risk"]).default("neutral"),
  priority: z.string().default("now"),
  cite_ids: z.array(z.string()).default([]),
});
export type InsightListItem = z.infer<typeof insightListItemSchema>;

export const insightListBlockSchema = blockBaseSchema.extend({
  category: z.literal("insight_list"),
  items: z.array(insightListItemSchema).min(1),
  citations: z.array(citationSchema).default([]),
});
export type InsightListBlock = z.infer<typeof insightListBlockSchema>;

// ---------------------------------------------------------------------------
// Comparison block
// ---------------------------------------------------------------------------

export const comparisonPairSchema = z.object({
  label: z.string(),
  before: z.union([z.number(), z.string()]),
  after: z.union([z.number(), z.string()]),
  unit: z.string().nullable().default(null),
  format: z.enum(["number", "currency", "percent", "multiplier"]).default("number"),
  change: z.number().nullable().default(null),
  change_direction: z.enum(["up", "down", "flat"]).nullable().default(null),
  severity: z.enum(["positive", "neutral", "watch", "risk"]).default("neutral"),
  cite_ids: z.array(z.string()).default([]),
});
export type ComparisonPair = z.infer<typeof comparisonPairSchema>;

export const comparisonBlockSchema = blockBaseSchema.extend({
  category: z.literal("comparison"),
  before_label: z.string(),
  after_label: z.string(),
  pairs: z.array(comparisonPairSchema).min(1),
  citations: z.array(citationSchema).default([]),
});
export type ComparisonBlock = z.infer<typeof comparisonBlockSchema>;

// ---------------------------------------------------------------------------
// V2 discriminated union
//
// NOTE: chartBlockSchema is a ZodEffects (superRefine), which cannot be a member
// of z.discriminatedUnion. The union below uses the un-refined chart base so the
// discriminator stays intact; `checkpointBlockV2Schema` then applies the chart
// invariants via a wrapping refinement so callers get one schema that both
// discriminates AND enforces chart renderability.
// ---------------------------------------------------------------------------

const checkpointBlockV2UnionSchema = z.discriminatedUnion("category", [
  narrativeBlockSchema,
  metricGridBlockSchema,
  chartBlockBaseSchema,
  dataTableBlockSchema,
  insightListBlockSchema,
  comparisonBlockSchema,
]);

export const checkpointBlockV2Schema = checkpointBlockV2UnionSchema.superRefine((block, ctx) => {
  if (block.category === "chart") {
    addChartInvariantIssues(block, ctx);
  }
});
export type CheckpointBlockV2 = z.infer<typeof checkpointBlockV2UnionSchema>;

// ---------------------------------------------------------------------------
// Runtime tolerance (shared FE/BE): lenient block schema + visible degrade.
//
// Unlike the Gemini-specific *synthesis* schemas — which stay Backend-local
// (see the header note) — how a malformed block is *tolerated* on the wire is a
// cross-boundary concern, so it is canonical here. The strict
// `checkpointBlockV2Schema` above remains the emit/render contract; the lenient
// pair below is the shared fallback used by the Backend synthesis-salvage path
// and the Frontend tolerant parser.
// ---------------------------------------------------------------------------

// Accepts any object carrying a valid V2 `category`; all other fields pass
// through unchecked. Legacy/non-V2 categories are excluded so they still fall
// to the Frontend's legacy parse path.
export const checkpointBlockV2LenientSchema = z
  .object({ category: blockCategorySchema })
  .loose();
export type CheckpointBlockV2Lenient = z.infer<typeof checkpointBlockV2LenientSchema>;

const asBlockRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const blockStringOrFallback = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

// Fail-visible degradation: turn any block into a narrative placeholder so a
// section that was produced but cannot render is surfaced, not silently lost.
export const degradeToNarrativeBlockV2 = (block: unknown): NarrativeBlock => {
  const rec = asBlockRecord(block);
  const category = typeof rec.category === "string" ? rec.category : "content";
  return narrativeBlockSchema.parse({
    block_id: blockStringOrFallback(rec.block_id, "block_degraded"),
    category: "narrative",
    scope: blockStringOrFallback(rec.scope, "account"),
    title: blockStringOrFallback(rec.title, "Section unavailable"),
    priority: "supplementary",
    body: `This ${category} block could not be rendered.`,
    highlights: [],
  });
};

// ---------------------------------------------------------------------------
// Checkpoint report metadata (small, cross-boundary)
// ---------------------------------------------------------------------------

export const checkpointMetaSchema = z.object({
  schema_version: z.literal("2"),
  block_count: z.number(),
  has_charts: z.boolean(),
  has_media: z.boolean(),
  has_citations: z.boolean(),
  primary_scope: z.string(),
});
export type CheckpointMeta = z.infer<typeof checkpointMetaSchema>;
