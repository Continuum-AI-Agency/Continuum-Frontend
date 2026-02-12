import { z } from "zod";

export const jainaChatRequestSchema = z.object({
  query: z.string().min(1),
  userId: z.string().optional(),
  context: z.object({
    adAccountId: z.string().min(1),
    brandId: z.string().min(1),
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

export const planStepSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
});

export type PlanStep = z.infer<typeof planStepSchema>;

export const responsePlanDeltaSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  steps: z.array(planStepSchema).optional(),
  status: z.enum(["pending", "awaiting_approval", "approved", "rejected", "in_progress", "completed"]).optional(),
});

export type ResponsePlanDeltaEventData = z.infer<typeof responsePlanDeltaSchema>;

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
  language: z.string().optional().default("en"),
  executive_summary: z.string().optional(),
  summary: z.string().optional(),
  reasoning_trace: z.string().optional(),
  performance_snapshot: z.array(tableSectionSchema).optional().default([]),
  sections: z.array(sotSectionSchema).optional().default([]),
  strategic_recommendations: z.array(recommendationItemSchema).optional().default([]),
  follow_up_questions: z.array(z.string()).optional().default([]),
  handoff_trace: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  cached_sources: z.array(z.string()).optional().default([]),
  graphs: z.array(graphSpecSchema).optional().default([]),
});

export type SoTReport = z.infer<typeof sotReportSchema>;

export const thoughtEventSchema = z.object({
  text: z.string(),
  chunk: z.boolean().optional(),
});

export type ThoughtEventData = z.infer<typeof thoughtEventSchema>;

export const adkEventSchema = z.object({
  author: z.string().optional(),
  content: z.object({
    role: z.string().optional(),
    parts: z.array(
      z.union([
        z.object({ text: z.string() }),
        z.object({
          functionCall: z.object({
            name: z.string(),
            args: z.record(z.string(), z.unknown()),
            id: z.string(),
          }),
        }),
        z.object({
          functionResponse: z.object({
            name: z.string(),
            response: z.record(z.string(), z.unknown()),
            id: z.string(),
          }),
        }),
      ])
    ),
  }),
}).passthrough();

export type AdkEventData = z.infer<typeof adkEventSchema>;

export const directAnswerSchema = z.object({
  type: z.literal("direct_answer"),
  content: z.string(),
});

export type DirectAnswerPayload = z.infer<typeof directAnswerSchema>;

export const reportPayloadSchema = z.union([
  sotReportSchema,
  directAnswerSchema,
]);

export type ReportPayload = z.infer<typeof reportPayloadSchema>;
