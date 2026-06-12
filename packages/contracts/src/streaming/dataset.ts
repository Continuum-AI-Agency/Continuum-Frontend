/**
 * Analysis dataset contract — the canonical, addressable shape a Jaina tool
 * produces and a report block references by `dataset_id`.
 *
 * The data harness exists so report blocks stop restating model-authored
 * numbers. Tools emit `AnalysisDataset`s carrying REAL timestamps + entity ids;
 * chart/data-table blocks reference a dataset by id and a deterministic
 * materializer projects the dataset into renderable rows — the chart x-axis is
 * COMPUTED from `points[].ts`, table rows are PULLED FORWARD from `rows[]`.
 *
 * Each point/row carries `meta` (entity ids, source, `creative` ref) so the
 * Frontend can show datapoint-metadata tooltips and lazy-load creative previews
 * on hover — value goes up, nothing is dropped.
 *
 * Import via the root entry only: `import { analysisDatasetSchema } from
 * '@continuum/contracts'` — Backend `moduleResolution: node` does not resolve
 * subpaths.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared header (every dataset kind carries these)
// ---------------------------------------------------------------------------

export const datasetValueFormatSchema = z.enum([
  "text",
  "number",
  "currency",
  "percent",
  "multiplier",
]);
export type DatasetValueFormat = z.infer<typeof datasetValueFormatSchema>;

export const datasetEntitySchema = z.object({
  type: z.string(),
  id: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
});
export type DatasetEntity = z.infer<typeof datasetEntitySchema>;

export const datasetPeriodSchema = z.object({
  since: z.string(),
  until: z.string(),
  timezone: z.string().nullable().default(null),
  // Meta `time_increment` — a number (days) or a token like "monthly".
  time_increment: z.union([z.number(), z.string()]).nullable().default(null),
  requested_label: z.string().nullable().default(null),
});
export type DatasetPeriod = z.infer<typeof datasetPeriodSchema>;

export const datasetCurrencySchema = z.object({
  code: z.string(),
  symbol: z.string().nullable().default(null),
});
export type DatasetCurrency = z.infer<typeof datasetCurrencySchema>;

export const datasetSourceSchema = z.object({
  tool: z.string(),
  cache_key: z.string().nullable().default(null),
  fetched_at: z.string().nullable().default(null),
  params_summary: z.string().nullable().default(null),
});
export type DatasetSource = z.infer<typeof datasetSourceSchema>;

const datasetHeaderShape = {
  dataset_id: z.string().min(1),
  metric_keys: z.array(z.string()).default([]),
  entity: datasetEntitySchema.nullable().default(null),
  period: datasetPeriodSchema,
  currency: datasetCurrencySchema.nullable().default(null),
  source: datasetSourceSchema,
};

// ---------------------------------------------------------------------------
// time_series
// ---------------------------------------------------------------------------

export const timeSeriesPointSchema = z.object({
  ts: z.string(),
  values: z.record(z.string(), z.number().nullable()),
  meta: z.record(z.string(), z.unknown()).nullable().default(null),
});
export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;

export const timeSeriesDatasetSchema = z.object({
  kind: z.literal("time_series"),
  ...datasetHeaderShape,
  points: z.array(timeSeriesPointSchema).default([]),
});
export type TimeSeriesDataset = z.infer<typeof timeSeriesDatasetSchema>;

// ---------------------------------------------------------------------------
// table
// ---------------------------------------------------------------------------

export const datasetTableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  format: datasetValueFormatSchema.default("text"),
});
export type DatasetTableColumn = z.infer<typeof datasetTableColumnSchema>;

export const datasetTableRowSchema = z.object({
  cells: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  meta: z.record(z.string(), z.unknown()).nullable().default(null),
});
export type DatasetTableRow = z.infer<typeof datasetTableRowSchema>;

export const tableDatasetSchema = z.object({
  kind: z.literal("table"),
  ...datasetHeaderShape,
  columns: z.array(datasetTableColumnSchema).default([]),
  rows: z.array(datasetTableRowSchema).default([]),
});
export type TableDataset = z.infer<typeof tableDatasetSchema>;

// ---------------------------------------------------------------------------
// scalar_group (groundwork for metric-grid materialization — follow-on)
// ---------------------------------------------------------------------------

export const datasetScalarMetricSchema = z.object({
  key: z.string(),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable().default(null),
  format: datasetValueFormatSchema.default("number"),
});
export type DatasetScalarMetric = z.infer<typeof datasetScalarMetricSchema>;

export const scalarGroupDatasetSchema = z.object({
  kind: z.literal("scalar_group"),
  ...datasetHeaderShape,
  metrics: z.array(datasetScalarMetricSchema).default([]),
});
export type ScalarGroupDataset = z.infer<typeof scalarGroupDatasetSchema>;

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export const analysisDatasetSchema = z.discriminatedUnion("kind", [
  timeSeriesDatasetSchema,
  tableDatasetSchema,
  scalarGroupDatasetSchema,
]);
export type AnalysisDataset = z.infer<typeof analysisDatasetSchema>;

export const analysisDatasetKindSchema = z.enum(["time_series", "table", "scalar_group"]);
export type AnalysisDatasetKind = z.infer<typeof analysisDatasetKindSchema>;

// ---------------------------------------------------------------------------
// Creative reference — carried in a block's `row_meta[i].creative` so a
// `format: "creative"` cell can lazy-resolve/sign a preview on hover.
// ---------------------------------------------------------------------------

// Named `datasetCreativeRef*` (not `creativeRef*`) to avoid colliding with the
// unrelated organic `creativeRefSchema`/`CreativeRef` in `media/attach.ts` —
// both are re-exported from the package root, and a shared name makes the root
// import ambiguous. This is the analysis/report-row creative ref.
export const datasetCreativeRefSchema = z.object({
  creative_id: z.string().nullable().default(null),
  ad_id: z.string().nullable().default(null),
  asset_id: z.string().nullable().default(null),
  bucket: z.string().nullable().default(null),
  storage_path: z.string().nullable().default(null),
  thumbnail_url: z.string().nullable().default(null),
  // Brand + account context so a `format:"creative"` cell can lazy-resolve a
  // FRESH preview (Meta CDN URLs expire) via the creative-preview endpoint
  // without threading chat state down to the cell — and so resume works.
  ad_account_id: z.string().nullable().default(null),
  brand_id: z.string().nullable().default(null),
});
export type DatasetCreativeRef = z.infer<typeof datasetCreativeRefSchema>;

// ---------------------------------------------------------------------------
// Creative-preview HTTP envelope — POST /api/agents/jaina/creative-preview.
// A `format:"creative"` table cell sends the row's creative ref on hover-open
// and renders the returned image. Brand access is enforced server-side from the
// caller's bearer token; the image URL is re-resolved fresh each call.
// ---------------------------------------------------------------------------

export const jainaCreativePreviewRequestSchema = z.object({
  brand_id: z.string().min(1),
  ad_account_id: z.string().min(1),
  creative_id: z.string().nullable().default(null),
  ad_id: z.string().nullable().default(null),
  ad_format: z.string().default("DESKTOP_FEED_STANDARD"),
});
export type JainaCreativePreviewRequest = z.infer<typeof jainaCreativePreviewRequestSchema>;

export const jainaCreativePreviewResponseSchema = z.object({
  thumbnail_url: z.string().nullable().default(null),
  image_url: z.string().nullable().default(null),
  preview_iframe: z.string().nullable().default(null),
  creative_id: z.string().nullable().default(null),
  ad_id: z.string().nullable().default(null),
});
export type JainaCreativePreviewResponse = z.infer<typeof jainaCreativePreviewResponseSchema>;

// ---------------------------------------------------------------------------
// Compact catalog entry — what the synthesis prompt sees (ids + shape, NO raw
// values), so the model references a dataset_id instead of authoring numbers.
// ---------------------------------------------------------------------------

export const datasetCatalogEntrySchema = z.object({
  dataset_id: z.string(),
  kind: analysisDatasetKindSchema,
  metric_keys: z.array(z.string()),
  entity: datasetEntitySchema.nullable().default(null),
  period: datasetPeriodSchema,
  currency: datasetCurrencySchema.nullable().default(null),
  point_count: z.number().nullable().default(null),
  row_count: z.number().nullable().default(null),
});
export type DatasetCatalogEntry = z.infer<typeof datasetCatalogEntrySchema>;
