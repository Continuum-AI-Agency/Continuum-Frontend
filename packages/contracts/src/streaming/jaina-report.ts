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

import { z } from 'zod';
import { percentBasisSchema } from './dataset';

// ---------------------------------------------------------------------------
// Shared item schemas referenced by multiple block variants
// ---------------------------------------------------------------------------

export const insightItemSchema = z.object({
  category: z.string(),
  title: z.string().optional(),
  text: z.string(),
  impact: z.string().nullable().default(null),
  severity: z.enum(['positive', 'neutral', 'watch', 'risk']).default('neutral'),
  confidence: z.string().nullable().default(null),
  evidence: z.array(z.string()).default([]),
});
export type InsightItem = z.infer<typeof insightItemSchema>;

// Evidence citation (analytical blocks only).
export const citationSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  cache_key: z.string().nullable().default(null),
  label: z.string().default(''),
});
export type Citation = z.infer<typeof citationSchema>;

// ---------------------------------------------------------------------------
// Block base + enums
// ---------------------------------------------------------------------------

export const blockCategorySchema = z.enum([
  'narrative',
  'metric_grid',
  'chart',
  'data_table',
  'insight_list',
  'comparison',
  // The four the reference methodology requires and this contract lacked:
  'data_scope',
  'actions',
  'goal_pacing',
  'survey',
]);
export type BlockCategory = z.infer<typeof blockCategorySchema>;

export const blockPrioritySchema = z.enum(['primary', 'secondary', 'supplementary']);
export type BlockPriority = z.infer<typeof blockPrioritySchema>;

/**
 * Trust-but-verify provenance for a rendered block. `source: 'computed'` means
 * the backend materialized every value verbatim from a registered dataset
 * (real API responses captured during the run — never model-typed numbers);
 * `'model'` means the block was authored by the model from gathered evidence.
 * The FE surfaces this on a hover affordance so users can verify where the
 * numbers came from. Nullable/absent = legacy block (treat as 'model').
 */
export const blockProvenanceSchema = z.object({
  source: z.enum(['computed', 'model']),
  /** Tool that fetched the underlying data, e.g. "get_top_ads". */
  tool: z.string().nullable().default(null),
  period: z
    .object({
      since: z.string().nullable().default(null),
      until: z.string().nullable().default(null),
      requested_label: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
  /** Human label of the entity the data covers (campaign/account name). */
  entity_label: z.string().nullable().default(null),
  /** Number of underlying rows / points / metrics materialized. */
  record_count: z.number().nullable().default(null),
});
export type BlockProvenance = z.infer<typeof blockProvenanceSchema>;

// Exported so the Backend's local Gemini-synthesis schemas can extend the same
// base (they stay Backend-local but must share this shape).
export const blockBaseSchema = z.object({
  block_id: z.string(),
  category: blockCategorySchema,
  scope: z.string().min(1),
  title: z.string().min(1),
  priority: blockPrioritySchema.default('secondary'),
  provenance: blockProvenanceSchema.nullable().default(null),
  evidence_refs: z.array(z.string().min(1)).optional(),
});

// ---------------------------------------------------------------------------
// Narrative block
// ---------------------------------------------------------------------------

export const narrativeBlockSchema = blockBaseSchema.extend({
  category: z.literal('narrative'),
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
  format: z.enum(['number', 'currency', 'percent', 'multiplier']).default('number'),
  /** For `percent`: fraction or points (see dataset.ts). Null = renderer must guess. */
  percent_basis: percentBasisSchema.nullable().default(null),
  change: z.number().nullable().default(null),
  change_direction: z.enum(['up', 'down', 'flat']).nullable().default(null),
  severity: z.enum(['positive', 'neutral', 'watch', 'risk']).default('neutral'),
});
export type MetricItem = z.infer<typeof metricItemSchema>;

export const metricGridBlockSchema = blockBaseSchema.extend({
  category: z.literal('metric_grid'),
  metrics: z.array(metricItemSchema).min(1),
  /**
   * When set, the grid was materialized server-side from a registered
   * `scalar_group` dataset (values verbatim from tool output — never
   * model-authored). Null/absent = legacy hand-authored grid. Mirrors the
   * chart/data_table harness field; nullable for full FE backward compatibility.
   */
  dataset_id: z.string().nullable().default(null),
});
export type MetricGridBlock = z.infer<typeof metricGridBlockSchema>;

// ---------------------------------------------------------------------------
// Chart block (Recharts v3 / shadcn native)
// ---------------------------------------------------------------------------

export const chartTypeSchema = z.enum([
  'bar',
  'line',
  'area',
  'pie',
  'doughnut',
  'stacked_bar',
  'radar',
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
  category: z.literal('chart'),
  chart_type: chartTypeSchema,
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).min(1),
  chart_config: z.record(z.string(), chartSeriesConfigSchema),
  category_key: z.string(),
  value_key: z.string().nullable().default(null),
  x_axis_label: z.string().nullable().default(null),
  y_axis_label: z.string().nullable().default(null),
  value_format: z.enum(['number', 'currency', 'percent', 'multiplier']).default('number'),
  /** For `percent` values: fraction or points. Null = renderer must guess. */
  value_basis: percentBasisSchema.nullable().default(null),
  // ISO currency code supplied by the source data. Null/absent preserves legacy
  // charts without inventing a currency.
  currency_code: z.string().nullable().default(null),
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
const SLICE_KEYED_CHART_TYPES = new Set(['pie', 'doughnut']);

const addChartInvariantIssues = (
  block: z.infer<typeof chartBlockBaseSchema>,
  ctx: z.RefinementCtx,
): void => {
  const rows = block.data;
  const missingCategory = rows.some((row) => !Object.hasOwn(row, block.category_key));
  if (missingCategory) {
    ctx.addIssue({
      code: 'custom',
      path: ['data'],
      message: `category_key "${block.category_key}" is missing from one or more data rows`,
    });
  }

  // Pie/doughnut config is keyed by slice value, not data-row column key.
  if (SLICE_KEYED_CHART_TYPES.has(block.chart_type)) return;

  for (const key of Object.keys(block.chart_config)) {
    const presentInAnyRow = rows.some((row) => Object.hasOwn(row, key));
    if (!presentInAnyRow) {
      ctx.addIssue({
        code: 'custom',
        path: ['chart_config', key],
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
  format: z
    .enum(['text', 'number', 'currency', 'percent', 'multiplier', 'creative'])
    .default('text'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  /** For `percent` columns: fraction or points. Null = renderer must guess. */
  percent_basis: percentBasisSchema.nullable().default(null),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;

export const creativeCardFieldsSchema = z.object({
  creative: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  metrics: z.array(z.string().min(1)).default([]),
});
export type CreativeCardFields = z.infer<typeof creativeCardFieldsSchema>;

export const dataTableBlockBaseSchema = blockBaseSchema.extend({
  category: z.literal('data_table'),
  columns: z.array(tableColumnSchema).min(1),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1),
  notes: z.string().nullable().default(null),
  // Data-harness provenance: when set, `rows` were materialized from the dataset.
  dataset_id: z.string().nullable().default(null),
  // Per-row metadata aligned by index to `rows` (entity id, `creative` ref).
  row_meta: z.array(z.record(z.string(), z.unknown())).nullable().default(null),
  render_mode: z.enum(['table', 'creative_cards']).default('table'),
  card_fields: creativeCardFieldsSchema.nullable().default(null),
});

export const addDataTableInvariantIssues = (
  block: Pick<z.infer<typeof dataTableBlockBaseSchema>, 'render_mode' | 'card_fields'>,
  ctx: z.RefinementCtx,
): void => {
  if (block.render_mode === 'creative_cards' && block.card_fields === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['card_fields'],
      message: 'creative_cards render_mode requires explicit card_fields',
    });
  }
};

export const dataTableBlockSchema = dataTableBlockBaseSchema.superRefine(
  addDataTableInvariantIssues,
);
export type DataTableBlock = z.infer<typeof dataTableBlockBaseSchema>;

// ---------------------------------------------------------------------------
// Prose marks — the emphasis a sentence can carry INSIDE itself.
//
// Structured blocks carry `severity` and are coloured from it. Prose — the executive
// summary, a narrative body, an insight's own sentence — is a plain string, and it
// reached the screen as flat ink: the figure that carried the judgement looked like
// every other word. Markdown has bold and nothing that means "this number is a
// problem", so prose carries one small marker family, the severity vocabulary plus
// the window:
//
//     [risk: 0.90 ROAS]  [watch: 1.7% CTR]  [positive: 21.83 MXN per lead]
//     [neutral: 145 purchases]  [window: last 30 days]
//
// Same law as the renderer's `reading.ts`: colour carries judgement, so `neutral`
// renders in the ink colour (a judgement, not a fallback) and `window` in the muted
// one. A mark holds plain text only — no nested mark, no markdown inside it — and an
// unknown keyword is not a mark, so `[cite:id]` and ordinary brackets pass untouched.
//
// Defined ONCE, here, because three things read it: the Backend prompt asks for it,
// the Backend clips a summary around it, and the Frontend renders it or strips it.
// ---------------------------------------------------------------------------

export const PROSE_MARK_TONES = ['risk', 'watch', 'positive', 'neutral', 'window'] as const;
export type ProseMarkTone = (typeof PROSE_MARK_TONES)[number];

export type ProseSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mark'; tone: ProseMarkTone; value: string };

const PROSE_MARK_SOURCE = String.raw`\[(risk|watch|positive|neutral|window):\s*([^\[\]\n]+?)\s*\]`;

/** A fresh matcher per call: a shared `/g` regex carries `lastIndex` between callers. */
export const proseMarkPattern = (): RegExp => new RegExp(PROSE_MARK_SOURCE, 'g');

export const hasProseMarks = (text: string): boolean => new RegExp(PROSE_MARK_SOURCE).test(text);

/** The prose split into text runs and marks, in order. Empty input is no segments. */
export function parseProseMarks(text: string): ProseSegment[] {
  const segments: ProseSegment[] = [];
  const pattern = proseMarkPattern();
  let lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: 'mark', tone: match[1] as ProseMarkTone, value: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ kind: 'text', value: text.slice(lastIndex) });
  return segments;
}

/** The prose with every mark replaced by its inner text — exports, previews, any surface without a renderer. */
export const stripProseMarks = (text: string): string => text.replace(proseMarkPattern(), '$2');

// ---------------------------------------------------------------------------
// Insight list block
// ---------------------------------------------------------------------------

export const insightListItemSchema = z.object({
  item_type: z.enum(['insight', 'action', 'recommendation', 'question']),
  title: z.string(),
  summary: z.string(),
  rationale: z.string().min(1),
  impact: z.string().min(1),
  severity: z.enum(['positive', 'neutral', 'watch', 'risk']).default('neutral'),
  /** The figure in `summary` that carries this item's `severity`, copied verbatim
   *  ("0.90 ROAS"). The renderer sets that span in the severity tone — the structured
   *  twin of a prose mark (see `parseProseMarks`). Null when no single figure is judged. */
  highlight: z.string().nullable().default(null),
  priority: z.string().default('now'),
  cite_ids: z.array(z.string()).default([]),
  evidence_refs: z.array(z.string().min(1)).optional(),
});
export type InsightListItem = z.infer<typeof insightListItemSchema>;

export const insightListBlockSchema = blockBaseSchema.extend({
  category: z.literal('insight_list'),
  dataset_id: z.string().nullable().optional(),
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
  /** The context floor's third leg: the longer baseline (e.g. L30D) the pair is read
   *  against. Null on pairs that only compare two periods. */
  baseline: z.union([z.number(), z.string()]).nullable().default(null),
  unit: z.string().nullable().default(null),
  format: z.enum(['number', 'currency', 'percent', 'multiplier']).default('number'),
  percent_basis: percentBasisSchema.nullable().default(null),
  change: z.number().nullable().default(null),
  change_direction: z.enum(['up', 'down', 'flat']).nullable().default(null),
  severity: z.enum(['positive', 'neutral', 'watch', 'risk']).default('neutral'),
  cite_ids: z.array(z.string()).default([]),
});
export type ComparisonPair = z.infer<typeof comparisonPairSchema>;

export const comparisonBlockSchema = blockBaseSchema.extend({
  category: z.literal('comparison'),
  before_label: z.string(),
  after_label: z.string(),
  baseline_label: z.string().nullable().default(null),
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

// ---------------------------------------------------------------------------
// Data scope — the first block of every report: dates, timezone, source, caveats.
// "Never deliver a naked number": the reader knows what window and what source
// before reading any figure.
// ---------------------------------------------------------------------------

export const dataScopeBlockSchema = blockBaseSchema.extend({
  category: z.literal('data_scope'),
  /** Human-readable window, e.g. "Sep 4 – Sep 17, 2026 (14 full days)". */
  dates: z.string().min(1),
  /** IANA zone the window was resolved in; null when the source reports in UTC only. */
  timezone: z.string().nullable().default(null),
  source: z.enum(['db', 'api', 'sheet', 'mixed']),
  /** Caveats that change how the numbers read: partial month, sheet not refreshed,
   *  rows truncated, mixed currencies. */
  notes: z.array(z.string()).default([]),
});
export type DataScopeBlock = z.infer<typeof dataScopeBlockSchema>;

// ---------------------------------------------------------------------------
// Actions — the recommendation table. Every row names an entity, an action, a size
// and the evidence it rests on (metric, value, window). No verdict labels.
// ---------------------------------------------------------------------------

export const actionEvidenceSchema = z.object({
  metric: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  unit: z.string().nullable().default(null),
  /** The window the value was measured over, e.g. "L14D", "d7". */
  window: z.string().min(1),
  /** The comparison in words: "vs $40 target", "2.1× the account median". */
  comparator: z.string().nullable().default(null),
});
export type ActionEvidence = z.infer<typeof actionEvidenceSchema>;

/**
 * Where an action's entity sits in the Meta hierarchy. Resolved server-side against the
 * entities the turn's tool calls actually returned (`resolveBlockEntities` on the Backend),
 * never taken on the model's word alone: a row whose text names a campaign while its
 * entity is the account is the defect this field exists to make visible. `account` is a
 * legitimate value for an account-wide move — and the value a renderer must NOT deep-link,
 * because there is nothing under it to open.
 */
export const ACTION_ENTITY_LEVELS = ['account', 'campaign', 'adset', 'ad'] as const;
export const actionEntityLevelSchema = z.enum(ACTION_ENTITY_LEVELS);
export type ActionEntityLevel = z.infer<typeof actionEntityLevelSchema>;

export const actionRowSchema = z.object({
  priority: z.enum(['P1', 'P2', 'P3']),
  entity: z.object({
    /** The Meta id of the entity the move is about; null when the turn never saw it. */
    id: z.string().nullable().default(null),
    name: z.string().min(1),
    kind: z.string().nullable().default(null),
    /** Null when unresolved — a renderer treats null exactly like `account`: no link. */
    level: actionEntityLevelSchema.nullable().default(null),
  }),
  action: z.string().min(1),
  /** The size of the move: "+$500/day", "pause", "−30%", "~$890/day recoverable". */
  sizing: z.string().nullable().default(null),
  evidence: actionEvidenceSchema,
  cite_ids: z.array(z.string()).default([]),
});
export type ActionRow = z.infer<typeof actionRowSchema>;

export const actionsBlockSchema = blockBaseSchema.extend({
  category: z.literal('actions'),
  rows: z.array(actionRowSchema).min(1),
  citations: z.array(citationSchema).default([]),
});
export type ActionsBlock = z.infer<typeof actionsBlockSchema>;

// ---------------------------------------------------------------------------
// Goal pacing — budget vs. spend vs. time, for a flight or a month.
// ---------------------------------------------------------------------------

export const goalPacingBlockSchema = blockBaseSchema.extend({
  category: z.literal('goal_pacing'),
  budget: z.number().nonnegative(),
  spent: z.number().nonnegative(),
  currency_code: z.string().nullable().default(null),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  /** Share of the period elapsed, 0..1. */
  elapsed_pct: z.number().min(0).max(1),
  /** spent / (budget × elapsed_pct): 1 = on plan, >1 ahead, <1 behind. */
  pace_ratio: z.number().nonnegative(),
  /** Spend projected at period end on the current run rate; null when unknowable. */
  projected_end: z.number().nullable().default(null),
  status: z.enum(['on_track', 'underpacing', 'overpacing']),
});
export type GoalPacingBlock = z.infer<typeof goalPacingBlockSchema>;

// ---------------------------------------------------------------------------
// Survey — ambiguity, surfaced. Shipped only when a term had several readings; the
// first option is always the definition that was used ("keep it").
// ---------------------------------------------------------------------------

export const surveyBlockSchema = blockBaseSchema.extend({
  category: z.literal('survey'),
  /** The ambiguous term: "active", "top", "recent", "underperforming". */
  term: z.string().min(1),
  /** The definition the report used. */
  used: z.string().min(1),
  /** Alternatives, 1–3. */
  alternatives: z.array(z.string().min(1)).min(1).max(3),
});
export type SurveyBlock = z.infer<typeof surveyBlockSchema>;

const checkpointBlockV2UnionSchema = z.discriminatedUnion('category', [
  narrativeBlockSchema,
  metricGridBlockSchema,
  chartBlockBaseSchema,
  dataTableBlockBaseSchema,
  insightListBlockSchema,
  comparisonBlockSchema,
  dataScopeBlockSchema,
  actionsBlockSchema,
  goalPacingBlockSchema,
  surveyBlockSchema,
]);

export const checkpointBlockV2Schema = checkpointBlockV2UnionSchema.superRefine((block, ctx) => {
  if (block.category === 'chart') {
    addChartInvariantIssues(block, ctx);
  }
  if (block.category === 'data_table') {
    addDataTableInvariantIssues(block, ctx);
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
export const checkpointBlockV2LenientSchema = z.object({ category: blockCategorySchema }).loose();
export type CheckpointBlockV2Lenient = z.infer<typeof checkpointBlockV2LenientSchema>;

const asBlockRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const blockStringOrFallback = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

// Fail-visible degradation: turn any block into a narrative placeholder so a
// section that was produced but cannot render is surfaced, not silently lost.
export const degradeToNarrativeBlockV2 = (block: unknown): NarrativeBlock => {
  const rec = asBlockRecord(block);
  const category = typeof rec.category === 'string' ? rec.category : 'content';
  return narrativeBlockSchema.parse({
    block_id: blockStringOrFallback(rec.block_id, 'block_degraded'),
    category: 'narrative',
    scope: blockStringOrFallback(rec.scope, 'account'),
    title: blockStringOrFallback(rec.title, 'Section unavailable'),
    priority: 'supplementary',
    body: `This ${category} block could not be rendered.`,
    highlights: [],
  });
};

// ---------------------------------------------------------------------------
// Checkpoint report metadata (small, cross-boundary)
// ---------------------------------------------------------------------------

export const checkpointMetaSchema = z.object({
  schema_version: z.literal('2'),
  block_count: z.number(),
  has_charts: z.boolean(),
  has_media: z.boolean(),
  has_citations: z.boolean(),
  primary_scope: z.string(),
});
export type CheckpointMeta = z.infer<typeof checkpointMetaSchema>;

// ---------------------------------------------------------------------------
// Content validator — the reference methodology's closing checklist as a function
// over the block tree, so "quality" is a test, not a judgement. Renderability is the
// schema's job (above); this checks what the report SAYS. Run before send in dev;
// a violation is a reason to fix the emitter, never to hide the block.
// ---------------------------------------------------------------------------

export const TABLE_ROW_LIMIT = 25;

export type ReportViolation = {
  code:
    | 'data_scope_missing'
    | 'data_scope_not_first'
    | 'context_floor_missing'
    | 'percent_basis_missing'
    | 'currency_missing'
    | 'table_truncation_undeclared'
    | 'table_totals_missing'
    | 'action_entity_is_account';
  block_id: string | null;
  message: string;
};

type AnyBlock = z.infer<typeof checkpointBlockV2UnionSchema>;

// ---------------------------------------------------------------------------
// Entity naming — shared by the Backend resolver and the validator below, so the rule
// that grades a row and the rule that fixes it cannot disagree about what "names" means.
// ---------------------------------------------------------------------------

/** An entity a turn's evidence actually carried: a campaign, ad set or ad by name. */
export type ReportEntity = {
  level: ActionEntityLevel;
  id: string | null;
  name: string;
};

/** Case-, width- and whitespace-insensitive; diacritics are kept (CAÑADAS ≠ CANADAS). */
export const normalizeEntityName = (name: string): string =>
  name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Names too short to be a mention rather than a coincidence ("A", "B", "Q3"). */
const MIN_ENTITY_NAME_CHARS = 3;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `text` mentions `name` as a whole token, not as the inside of a longer word. */
export const textNamesEntity = (text: string, name: string): boolean => {
  const needle = normalizeEntityName(name);
  if (needle.length < MIN_ENTITY_NAME_CHARS) return false;
  const haystack = normalizeEntityName(text);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(
    haystack,
  );
};

/**
 * The account, however the model spelled it: the `account-<id>` label the tool layer
 * mints, the `act_<id>` Meta id, a bare id, or the word itself.
 */
export const isAccountEntityName = (name: string): boolean =>
  /^(?:the\s+)?(?:ad\s+)?account$/i.test(name.trim()) ||
  /^(?:account[-_ ]?|act_)?\d{6,}$/i.test(name.trim());

/** Every `**bold**` run in a clause — the model bolds the entity it is talking about. */
export const boldSpans = (text: string): string[] =>
  [...text.matchAll(/\*\*([^*\n]+?)\*\*/g)].map((match) => match[1].trim());

/**
 * The entities from `entities` that `text` names, in the order the text names them.
 * Bold spans come first because they are the model's own declaration of its subject;
 * plain mentions follow by position. A name mentioned twice is listed once.
 */
export const entitiesNamedIn = (
  text: string,
  entities: ReadonlyArray<ReportEntity>,
): ReportEntity[] => {
  const named = entities.filter((entity) => entity.level !== 'account');
  const bolded = boldSpans(text).flatMap((span) =>
    named.filter((entity) => normalizeEntityName(entity.name) === normalizeEntityName(span)),
  );
  const haystack = normalizeEntityName(text);
  const mentioned = named
    .filter((entity) => textNamesEntity(text, entity.name))
    .sort(
      (a, b) =>
        haystack.indexOf(normalizeEntityName(a.name)) -
        haystack.indexOf(normalizeEntityName(b.name)),
    );
  const seen = new Set<string>();
  return [...bolded, ...mentioned].filter((entity) => {
    const key = `${entity.level}|${entity.id ?? normalizeEntityName(entity.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export type ValidateReportOptions = {
  /**
   * The campaigns, ad sets and ads this turn's evidence carried. Without them the
   * account rule can only read the row's own bold spans; with them it can tell that
   * "shift budget into CAÑADAS" names a campaign the turn actually fetched.
   */
  entities?: ReadonlyArray<ReportEntity>;
};

const mentionsTruncation = (notes: string | null): boolean =>
  typeof notes === 'string' && /truncat|top \d+|first \d+|showing \d+/i.test(notes);

const hasTotalsRow = (rows: Record<string, string | number | null>[]): boolean =>
  rows.some((row) => Object.values(row).some((v) => typeof v === 'string' && /^total/i.test(v)));

export function validateReport(
  blocks: readonly AnyBlock[],
  options: ValidateReportOptions = {},
): ReportViolation[] {
  const out: ReportViolation[] = [];
  if (blocks.length === 0) return out;
  const entities = options.entities ?? [];

  const scopeIndex = blocks.findIndex((b) => b.category === 'data_scope');
  if (scopeIndex < 0) {
    out.push({
      code: 'data_scope_missing',
      block_id: null,
      message: 'Every report opens with a data_scope block: dates, timezone, source.',
    });
  } else if (scopeIndex !== 0) {
    out.push({
      code: 'data_scope_not_first',
      block_id: blocks[scopeIndex].block_id,
      message: 'The data_scope block must be the first block.',
    });
  }

  const hasFloor = blocks.some(
    (b) =>
      b.category === 'comparison' ||
      (b.category === 'metric_grid' && b.metrics.some((m) => m.change != null)),
  );
  const headlineGrid = blocks.find((b) => b.category === 'metric_grid');
  if (headlineGrid && !hasFloor) {
    out.push({
      code: 'context_floor_missing',
      block_id: headlineGrid.block_id,
      message:
        'A headline KPI needs a context floor: a prior period and a baseline (a comparison block, or change on the metric).',
    });
  }

  for (const b of blocks) {
    if (b.category === 'metric_grid') {
      for (const m of b.metrics) {
        if (m.format === 'percent' && m.percent_basis == null) {
          out.push({
            code: 'percent_basis_missing',
            block_id: b.block_id,
            message: `Metric "${m.label}" is a percent with no basis (fraction or points); the renderer would have to guess.`,
          });
        }
        if (m.format === 'currency' && !m.unit) {
          out.push({
            code: 'currency_missing',
            block_id: b.block_id,
            message: `Metric "${m.label}" is money with no currency code.`,
          });
        }
      }
    }
    if (b.category === 'data_table') {
      for (const c of b.columns) {
        if (c.format === 'percent' && c.percent_basis == null) {
          out.push({
            code: 'percent_basis_missing',
            block_id: b.block_id,
            message: `Column "${c.label}" is a percent with no basis (fraction or points).`,
          });
        }
      }
      if (b.rows.length > TABLE_ROW_LIMIT && !mentionsTruncation(b.notes)) {
        out.push({
          code: 'table_truncation_undeclared',
          block_id: b.block_id,
          message: `Table has ${b.rows.length} rows (limit ${TABLE_ROW_LIMIT}) and does not say it was truncated.`,
        });
      }
      const hasMoney = b.columns.some((c) => c.format === 'currency');
      if (hasMoney && b.rows.length >= 2 && !hasTotalsRow(b.rows)) {
        out.push({
          code: 'table_totals_missing',
          block_id: b.block_id,
          message: 'A money table with two or more entities needs a totals row.',
        });
      }
    }
    if (b.category === 'chart' && b.value_format === 'percent' && b.value_basis == null) {
      out.push({
        code: 'percent_basis_missing',
        block_id: b.block_id,
        message: 'Chart plots percent values with no basis (fraction or points).',
      });
    }
    if (b.category === 'comparison') {
      for (const pair of b.pairs) {
        if (pair.format === 'percent' && pair.percent_basis == null) {
          out.push({
            code: 'percent_basis_missing',
            block_id: b.block_id,
            message: `Comparison "${pair.label}" is a percent with no basis.`,
          });
        }
      }
    }
    // The card built to be clicked must name something to click on. A row whose entity
    // is the account while its own clause names a campaign or ad set is graded, never
    // rewritten here: the Backend resolver is the fix, this is the witness.
    if (b.category === 'actions') {
      for (const row of b.rows) {
        const isAccount = row.entity.level === 'account' || isAccountEntityName(row.entity.name);
        if (!isAccount) continue;
        const named = entitiesNamedIn(row.action, entities).map((entity) => entity.name);
        const boldedOther = boldSpans(row.action).filter((span) => !isAccountEntityName(span));
        const names = [...new Set([...named, ...boldedOther])];
        if (names.length === 0) continue;
        out.push({
          code: 'action_entity_is_account',
          block_id: b.block_id,
          message: `Action "${row.action.slice(0, 60)}" names ${names.join(', ')} but its entity is the account (${row.entity.name}).`,
        });
      }
    }
  }
  return out;
}
