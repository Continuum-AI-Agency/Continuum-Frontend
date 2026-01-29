import { z } from "zod";

export const jainaChatRequestSchema = z.object({
  query: z.string().min(1),
  userId: z.string().optional(),
  context: z.object({
    adAccountId: z.string().min(1),
    brandId: z.string().optional(),
  }),
});

export type JainaChatRequest = z.infer<typeof jainaChatRequestSchema>;

export const jainaChatInputSchema = z.object({
  query: z.string().min(3, "Ask Jaina a specific question."),
});

export type JainaChatInputValues = z.infer<typeof jainaChatInputSchema>;

export const jainaStreamEventSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type JainaStreamEvent = z.infer<typeof jainaStreamEventSchema>;

export const progressEventSchema = z
  .object({
    stage: z.string(),
  })
  .passthrough();

export type ProgressEventData = z.infer<typeof progressEventSchema>;

export const outputJsonDeltaSchema = z.object({
  item_id: z.string().optional(),
  part_id: z.string().optional(),
  delta: z.string(),
});

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
});

export type ToolCallEventData = z.infer<typeof toolCallSchema>;

export const toolResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  ok: z.boolean(),
  cached: z.boolean(),
  shared: z.boolean().optional(),
  duration_ms: z.number().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export type ToolResultEventData = z.infer<typeof toolResultSchema>;

export const stateDeltaSchema = z.object({
  source: z.string(),
  delta: z.record(z.string(), z.unknown()),
});

export type StateDeltaEventData = z.infer<typeof stateDeltaSchema>;

export const responseCreatedSchema = z.object({
  id: z.string(),
});

export const responseOutputItemSchema = z.object({
  item: z.object({
    id: z.string(),
  }),
});

export const responseContentPartSchema = z.object({
  item_id: z.string(),
  part: z.object({
    id: z.string(),
  }),
});

export const streamErrorSchema = z.object({
  type: z.string().optional(),
  code: z.string().optional(),
  message: z.string(),
  param: z.unknown().nullable().optional(),
});

const metricRowSchema = z.object({
  label: z.string(),
  value: z.string(),
  comparison: z.string().nullable(),
  status: z.string().nullable(),
  source: z.string().nullable(),
  cached: z.boolean(),
});

const tableSectionSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  rows: z.array(metricRowSchema),
  notes: z.string().nullable(),
});

const insightItemSchema = z.object({
  category: z.string(),
  text: z.string(),
  impact: z.string().nullable(),
  severity: z.enum(["positive", "neutral", "watch", "risk"]),
  confidence: z.string().nullable(),
  evidence: z.array(z.string()),
});

const recommendationItemSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  expected_impact: z.string().nullable(),
  priority: z.string(),
});

const dataSeriesSchema = z.object({
  name: z.string(),
  values: z.array(z.number()),
  cached: z.boolean(),
  unit: z.string().nullable(),
});

const graphSpecSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  graph_type: z.enum(["line", "bar", "stacked_bar", "area", "pie"]),
  labels: z.array(z.string()),
  series: z.array(dataSeriesSchema),
  cached_sources: z.array(z.string()),
});

const sotSectionSchema = z.object({
  heading: z.string(),
  scope: z.string(),
  summary: z.string(),
  highlights: z.array(insightItemSchema),
  tables: z.array(tableSectionSchema),
  actions: z.array(recommendationItemSchema),
  confidence: z.string().nullable(),
  cached_sources: z.array(z.string()),
  graphs: z.array(graphSpecSchema),
});

export const sotReportSchema = z.object({
  language: z.string(),
  executive_summary: z.string(),
  performance_snapshot: z.array(tableSectionSchema),
  sections: z.array(sotSectionSchema),
  strategic_recommendations: z.array(recommendationItemSchema),
  follow_up_questions: z.array(z.string()),
  handoff_trace: z.array(z.record(z.string(), z.unknown())),
  cached_sources: z.array(z.string()),
  graphs: z.array(graphSpecSchema),
});

export type SoTReport = z.infer<typeof sotReportSchema>;
