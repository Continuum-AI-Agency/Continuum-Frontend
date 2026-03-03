import { z } from "zod";
import { campaignCanvasActionsEnvelopeSchema } from "@/lib/campaign-canvas/agent-actions";

// ============================================================================
// Handoff Schemas
// ============================================================================

export const handoffTraceEntrySchema = z.object({
  correlation_id: z.string(),
  parent_correlation_id: z.string().nullable(),
  from_scope: z.string().nullable(),
  to_scope: z.string(),
  objective: z.string().nullable(),
  entity_id: z.string().nullable(),
  status: z.enum(["started", "completed", "failed"]),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  duration_ms: z.number().nullable(),
  error: z.string().nullable(),
});

export type HandoffTraceEntry = z.infer<typeof handoffTraceEntrySchema>;

// ============================================================================
// Request/Response Schemas
// ============================================================================

export const jainaChatRequestSchema = z.object({
  query: z.string().min(1),
  userId: z.string().optional(),
  canvas: z.boolean().optional(),
  context: z.object({
    adAccountId: z.string().min(1),
    brandId: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    canvas: z.boolean().optional(),
    campaignCanvas: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type JainaChatStreamRequest = z.infer<typeof jainaChatRequestSchema>;
export type JainaChatRequest = JainaChatStreamRequest;

export const jainaChatStopRequestSchema = z.union([
  z.object({
    context: z.object({
      adAccountId: z.string().min(1),
      brandId: z.string().min(1),
    }),
  }),
  z.object({
    ad_account_id: z.string().min(1),
  }),
]);

export type JainaChatStopRequest = z.infer<typeof jainaChatStopRequestSchema>;

export const jainaChatStopResponseSchema = z.object({
  status: z.enum(["stopped", "idle"]),
  stopped_runs: z.number().int().nonnegative(),
});

export type JainaChatStopResponse = z.infer<typeof jainaChatStopResponseSchema>;

export const jainaChatInputSchema = z.object({
  query: z.string().min(3, "Ask Jaina a specific question."),
});

export type JainaChatInputValues = z.infer<typeof jainaChatInputSchema>;

// ============================================================================
// Stream Contracts (HTTP NDJSON)
// ============================================================================

export const streamEventSchema = <TType extends string, TData extends z.ZodTypeAny>(
  type: TType,
  data: TData
) =>
  z.object({
    type: z.literal(type),
    data: data.optional(),
  });

export type StreamEvent<TType extends string, TData = Record<string, unknown>> = {
  type: TType;
  data?: TData;
};

export const recommendationItemSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  expected_impact: z.string().nullable(),
  priority: z.string(),
});

export type RecommendationItem = z.infer<typeof recommendationItemSchema>;

export const insightSchema = z.object({
  category: z.string(),
  title: z.string().optional(),
  text: z.string(),
  impact: z.string().nullable(),
  severity: z.enum(["positive", "neutral", "watch", "risk"]),
  confidence: z.string().nullable(),
  evidence: z.array(z.string()),
});

export type InsightItem = z.infer<typeof insightSchema>;

export const tableSectionSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  rows: z.array(z.unknown()),
  notes: z.string().nullable(),
});

export type TableSection = z.infer<typeof tableSectionSchema>;

export const dataSeriesSchema = z.object({
  name: z.string(),
  values: z.array(z.number()),
  cached: z.boolean(),
  unit: z.string().nullable(),
  derived_metrics: z.unknown().optional(),
});

export type DataSeries = z.infer<typeof dataSeriesSchema>;

export const graphSpecSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  graph_type: z.enum(["line", "bar", "stacked_bar", "area", "pie"]),
  labels: z.array(z.string()),
  series: z.array(z.unknown()),
  cached_sources: z.array(z.string()),
});

export type GraphSpec = z.infer<typeof graphSpecSchema>;

export const reportTableGridSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  headers: z.array(z.string()),
  rows: z.array(z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())])),
  notes: z.string().nullable().optional(),
});

export const frontendMetricItemSchema = z.object({
  metric: z.string(),
  value: z.union([z.string(), z.number()]),
  change: z.union([z.string(), z.number()]).optional(),
  trend: z.union([z.string(), z.number()]).optional(),
  direction: z.string().optional(),
  context: z.string().optional(),
  sub_label: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  status: z.string().nullable().optional(),
  format: z.string().optional(),
});

export const frontendGraphSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    type: z.string().optional(),
    graph_type: z.string().optional(),
    chart_type: z.string().optional(),
    labels: z.array(z.union([z.string(), z.number()])).optional(),
    datasets: z.array(z.record(z.string(), z.unknown())).optional(),
    data: z.array(z.record(z.string(), z.unknown())).optional(),
    series: z.array(z.record(z.string(), z.unknown())).optional(),
    x_axis_label: z.string().optional(),
    y_axis_label: z.string().optional(),
    cached_sources: z.array(z.string()).optional(),
  })
  .passthrough();

export const checkpointSectionSchema = z.object({
  heading: z.string(),
  scope: z.string(),
  summary: z.string(),
  highlights: z.array(insightSchema).default([]),
  tables: z.array(z.union([tableSectionSchema, reportTableGridSchema])).default([]),
  actions: z.array(recommendationItemSchema).default([]),
  confidence: z.string().nullable().default(null),
  cached_sources: z.array(z.string()).default([]),
  graphs: z.array(frontendGraphSchema).default([]),
});

export type CheckpointSection = z.infer<typeof checkpointSectionSchema>;

export const frontendCheckpointReportSchema = z.object({
  language: z.string().default("en"),
  executive_summary: z.string().default(""),
  performance_snapshot: z.array(frontendMetricItemSchema).default([]),
  sections: z.array(checkpointSectionSchema).default([]),
  strategic_recommendations: z.array(recommendationItemSchema).default([]),
  follow_up_questions: z.array(z.string()).default([]),
  handoff_trace: z.array(handoffTraceEntrySchema).default([]),
  cached_sources: z.array(z.string()).default([]),
  graphs: z.array(frontendGraphSchema).default([]),
});

export type FrontendCheckpointReport = z.infer<typeof frontendCheckpointReportSchema>;

export const chartDatasetSchema = z.object({
  label: z.string(),
  data: z.array(z.number()),
  backgroundColor: z.string().optional(),
  borderColor: z.string().optional(),
});

export type ChartDataset = z.infer<typeof chartDatasetSchema>;

export const chartSpecificationSchema = z.object({
  title: z.string(),
  chart_type: z.enum(["bar", "line", "pie", "doughnut"]),
  labels: z.array(z.string()),
  datasets: z.array(chartDatasetSchema),
  options: z.record(z.string(), z.any()).optional(),
});

export type ChartSpecification = z.infer<typeof chartSpecificationSchema>;

export const metricComparisonSchema = z.object({
  label: z.string(),
  planned: z.union([z.number(), z.string()]),
  actual: z.union([z.number(), z.string()]),
  index_percent: z.number(),
  unit: z.string(),
  deviation_type: z.enum(["positive", "negative", "neutral"]),
});

export type MetricComparison = z.infer<typeof metricComparisonSchema>;

export const reportAssemblySchema = z.object({
  header: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    period: z.string(),
    report_tags: z.array(z.string()),
  }),
  summary: z.object({
    narrative: z.string(),
    principal_deviation: z.string().optional(),
  }),
  metrics: z.array(metricComparisonSchema),
  charts: z.array(chartSpecificationSchema),
  insights: z.array(insightSchema),
  recommendations: z.array(z.union([recommendationItemSchema, z.string()])),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ReportAssembly = z.infer<typeof reportAssemblySchema>;

export const responseCreatedSchema = streamEventSchema(
  "response.created",
  z.object({
    id: z.string(),
    object: z.literal("realtime.response"),
    status: z.literal("in_progress"),
    status_details: z.null().optional(),
    output: z.array(z.unknown()),
  })
);

export const responseOutputItemSchema = streamEventSchema(
  "response.output_item.added",
  z.object({
    item: z.object({
      id: z.string(),
      object: z.literal("realtime.item"),
      type: z.literal("message"),
      status: z.literal("in_progress"),
      role: z.literal("assistant"),
      content: z.array(z.unknown()),
    }),
  })
);

export const responseContentPartSchema = streamEventSchema(
  "response.content_part.added",
  z.object({
    item_id: z.string(),
    part: z.object({
      id: z.string(),
      object: z.literal("realtime.content_part"),
      type: z.enum(["text", "json"]),
      text: z.string().optional(),
      json: z.string().optional(),
    }),
  })
);

export const progressEventSchema = streamEventSchema(
  "response.progress",
  z.object({
    stage: z.string(),
  }).passthrough()
);

export type ProgressEventData = Exclude<z.infer<typeof progressEventSchema>["data"], undefined>;

export const stateDeltaSchema = streamEventSchema(
  "state.delta",
  z.object({
    source: z.string(),
    delta: z.record(z.string(), z.unknown()),
  })
);

export type StateDeltaEventData = Exclude<z.infer<typeof stateDeltaSchema>["data"], undefined>;

export const responsePlanDeltaSchema = streamEventSchema(
  "response.plan.delta",
  z.object({
    item_id: z.string(),
    part_id: z.string(),
    delta: z.string(),
  })
);

export type ResponsePlanDeltaEventData = Exclude<
  z.infer<typeof responsePlanDeltaSchema>["data"],
  undefined
>;

export const hitlPausedSchema = streamEventSchema(
  "hitl.paused",
  z.object({
    prompt: z.string(),
  })
);

export type HitlPausedEventData = Exclude<z.infer<typeof hitlPausedSchema>["data"], undefined>;

export const canvasActionsProposedSchema = streamEventSchema(
  "canvas.actions.proposed",
  campaignCanvasActionsEnvelopeSchema
);

export type CanvasActionsProposedEventData = Exclude<
  z.infer<typeof canvasActionsProposedSchema>["data"],
  undefined
>;

export const toolBatchSchema = streamEventSchema(
  "tool.batch",
  z.object({
    calls: z.array(z.object({
      id: z.string(),
      name: z.string(),
      args: z.record(z.string(), z.unknown()),
      metadata: z.record(z.string(), z.unknown()),
      correlation_id: z.string().optional().nullable(),
      parent_correlation_id: z.string().nullable().optional(),
    })),
    results: z.array(z.object({
      id: z.string(),
      name: z.string(),
      ok: z.boolean(),
      cached: z.boolean(),
      shared: z.boolean().optional(),
      duration_ms: z.number().optional(),
      output: z.unknown().optional(),
      error: z.string().optional(),
      correlation_id: z.string().optional().nullable(),
      parent_correlation_id: z.string().nullable().optional(),
    })),
  })
);

export const handoffStartSchema = streamEventSchema(
  "handoff.start",
  z.object({
    correlation_id: z.string(),
    from_scope: z.string().nullable(),
    to_scope: z.string(),
    objective: z.string().nullable(),
    entity_id: z.string().nullable(),
  })
);

export const handoffCompleteSchema = streamEventSchema(
  "handoff.complete",
  z.object({
    correlation_id: z.string(),
    status: z.enum(["completed", "failed"]),
    duration_ms: z.number(),
    error: z.string().nullable(),
    from_scope: z.string().nullable(),
    to_scope: z.string(),
    objective: z.string().nullable(),
    entity_id: z.string().nullable(),
  })
);

export const agentEnvelopeSchema = streamEventSchema(
  "agent.envelope",
  z.object({
    envelope: z.object({
      version: z.literal("1"),
      kind: z.enum(["tool", "handoff", "agent"]),
      event: z.enum(["start", "complete", "error"]),
      correlation_id: z.string(),
      parent_correlation_id: z.string().nullable(),
      session_id: z.string().nullable(),
      scope: z.string().nullable(),
      timestamp: z.string(),
      payload: z.record(z.string(), z.unknown()),
    }),
  })
);

export const responseCheckpointReportSchema = streamEventSchema(
  "response.checkpoint_report",
  z.object({
    item_id: z.string(),
    part_id: z.string(),
    report: z.unknown(),
  })
);

export const responseReportAssemblySchema = streamEventSchema(
  "response.report_assembly",
  z.object({
    item_id: z.string(),
    part_id: z.string(),
    report: reportAssemblySchema,
    html_preview: z.string(),
  })
);

export const outputTextDeltaSchema = streamEventSchema(
  "response.output_text.delta",
  z.object({
    item_id: z.string(),
    part_id: z.string(),
    delta: z.string(),
  })
);

export const responseContentPartDoneSchema = streamEventSchema(
  "response.content_part.done",
  z.object({
    item_id: z.string(),
    part_id: z.string(),
  })
);

export const responseOutputItemDoneSchema = streamEventSchema(
  "response.output_item.done",
  z.object({
    item_id: z.string(),
  })
);

export const responseDoneSchema = streamEventSchema(
  "response.done",
  z.object({
    id: z.string(),
    object: z.literal("realtime.response"),
    status: z.literal("completed"),
    status_details: z.null().optional(),
    output: z.array(z.unknown()),
  })
);

export const streamErrorSchema = streamEventSchema(
  "error",
  z.object({
    type: z.string(),
    code: z.string(),
    message: z.string(),
    param: z.null(),
  })
);

export const outputJsonDeltaSchema = z.object({
  item_id: z.string().optional(),
  part_id: z.string().optional(),
  delta: z.string(),
});

export type JainaStreamEvent =
  | z.infer<typeof responseCreatedSchema>
  | z.infer<typeof responseOutputItemSchema>
  | z.infer<typeof responseContentPartSchema>
  | z.infer<typeof progressEventSchema>
  | z.infer<typeof stateDeltaSchema>
  | z.infer<typeof responsePlanDeltaSchema>
  | z.infer<typeof hitlPausedSchema>
  | z.infer<typeof canvasActionsProposedSchema>
  | z.infer<typeof toolBatchSchema>
  | z.infer<typeof handoffStartSchema>
  | z.infer<typeof handoffCompleteSchema>
  | z.infer<typeof agentEnvelopeSchema>
  | z.infer<typeof responseCheckpointReportSchema>
  | z.infer<typeof responseReportAssemblySchema>
  | z.infer<typeof outputTextDeltaSchema>
  | z.infer<typeof responseContentPartDoneSchema>
  | z.infer<typeof responseOutputItemDoneSchema>
  | z.infer<typeof responseDoneSchema>
  | z.infer<typeof streamErrorSchema>;

export const jainaStreamEventSchema = z.union([
  responseCreatedSchema,
  responseOutputItemSchema,
  responseContentPartSchema,
  progressEventSchema,
  stateDeltaSchema,
  responsePlanDeltaSchema,
  hitlPausedSchema,
  canvasActionsProposedSchema,
  toolBatchSchema,
  handoffStartSchema,
  handoffCompleteSchema,
  agentEnvelopeSchema,
  responseCheckpointReportSchema,
  responseReportAssemblySchema,
  outputTextDeltaSchema,
  responseContentPartDoneSchema,
  responseOutputItemDoneSchema,
  responseDoneSchema,
  streamErrorSchema,
]);

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

export const creativeArtifactSchema = z.object({
  id: z.string(),
  type: z.literal("creative"),
  url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  post_copy: z.string().optional(),
  headline: z.string().optional(),
  description: z.string().optional(),
  call_to_action: z.string().optional(),
  platform: z.enum(["facebook", "instagram", "tiktok", "google"]).optional(),
  format: z.enum(["image", "video", "carousel"]).optional(),
});

export type CreativeArtifact = z.infer<typeof creativeArtifactSchema>;

export const artifactDeltaSchema = z.object({
  creatives: z.array(creativeArtifactSchema).optional(),
  images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().optional(),
  })).optional(),
});

export type ArtifactDeltaEventData = z.infer<typeof artifactDeltaSchema>;

export const planStepSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
});

export type PlanStep = z.infer<typeof planStepSchema>;

export const planScopeSchema = z.enum([
  "account",
  "campaign",
  "adset",
  "ad",
  "creative",
]);

export type PlanScope = z.infer<typeof planScopeSchema>;

export const planRequestedArgsSchema = z.object({
  reason: z.string(),
  plan: z.literal(true),
  scopes: z.array(planScopeSchema).optional(),
});

export type PlanRequestedArgs = z.infer<typeof planRequestedArgsSchema>;

export const responsePlanRequestedSchema = z.object({
  plan_id: z.string(),
  tool_name: z.string(),
  status: z.literal("awaiting_approval"),
  summary: z.string(),
  args: planRequestedArgsSchema,
  created_at: z.string(),
});

export type ResponsePlanRequestedEventData = z.infer<typeof responsePlanRequestedSchema>;

export const responsePlanRequestedPayloadSchema = z.object({
  plan_id: z.string().optional(),
  planId: z.string().optional(),
  tool_name: z.string().optional(),
  toolName: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  created_at: z.string().optional(),
  createdAt: z.string().optional(),
}).passthrough();

export function parsePlanRequestedPayload(
  payload: unknown
): ResponsePlanRequestedEventData | null {
  const parsedPayload = responsePlanRequestedPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return null;

  const raw = parsedPayload.data;
  const planId = raw.plan_id ?? raw.planId;
  if (!planId) return null;

  const summary = raw.summary ?? raw.description ?? "Review the plan below.";
  const parsedArgs = planRequestedArgsSchema.safeParse(raw.args);
  const args = parsedArgs.success
    ? parsedArgs.data
    : {
        reason: summary,
        plan: true as const,
      };

  const normalized: ResponsePlanRequestedEventData = {
    plan_id: planId,
    tool_name: raw.tool_name ?? raw.toolName ?? "unknown_tool",
    status: "awaiting_approval",
    summary,
    args,
    created_at: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
  };

  return responsePlanRequestedSchema.safeParse(normalized).success
    ? normalized
    : null;
}

export const responsePlanDecisionSchema = z.object({
  plan_id: z.string(),
  approved: z.boolean(),
  status: z.enum(["approved", "rejected"]),
  note: z.string().optional(),
});

export type ResponsePlanDecisionEventData = z.infer<typeof responsePlanDecisionSchema>;

export const responsePlanDecisionPayloadSchema = z.object({
  plan_id: z.string().optional(),
  planId: z.string().optional(),
  approved: z.boolean().optional(),
  status: z.string().optional(),
  decision: z.string().optional(),
  action: z.string().optional(),
  note: z.string().optional(),
  reason: z.string().optional(),
}).passthrough();

function resolveDecisionBoolean(
  value: string | undefined
): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    ["approve", "approved", "accept", "accepted", "proceed", "proceeded", "yes", "true"].includes(
      normalized
    )
  ) {
    return true;
  }
  if (
    ["deny", "denied", "reject", "rejected", "decline", "declined", "no", "false"].includes(
      normalized
    )
  ) {
    return false;
  }
  return undefined;
}

export function parsePlanDecisionPayload(
  payload: unknown
): ResponsePlanDecisionEventData | null {
  const parsedPayload = responsePlanDecisionPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return null;

  const raw = parsedPayload.data;
  const planId = raw.plan_id ?? raw.planId;
  if (!planId) return null;

  const decisionToken = raw.decision ?? raw.status ?? raw.action;
  const approved =
    typeof raw.approved === "boolean"
      ? raw.approved
      : resolveDecisionBoolean(decisionToken);
  if (typeof approved !== "boolean") return null;

  const normalized: ResponsePlanDecisionEventData = {
    plan_id: planId,
    approved,
    status: approved ? "approved" : "rejected",
    note: raw.note ?? raw.reason,
  };

  return responsePlanDecisionSchema.safeParse(normalized).success
    ? normalized
    : null;
}

export const planDecisionCommandSchema = z.object({
  type: z.literal("plan.decision"),
  data: z.object({
    decision: z.enum(["approve", "deny"]),
    planId: z.string().min(1),
    reason: z.string().optional(),
  }),
});

export type PlanDecisionCommand = z.infer<typeof planDecisionCommandSchema>;

export const feedbackApprovalCommandSchema = z.object({
  type: z.literal("feedback"),
  data: z.object({
    approved: z.boolean(),
    planId: z.string().min(1),
    reason: z.string().optional(),
  }),
});

export type FeedbackApprovalCommand = z.infer<typeof feedbackApprovalCommandSchema>;

export const planApprovalCommandSchema = z.object({
  type: z.literal("plan.approval"),
  data: z.object({
    plan_id: z.string().min(1),
    approved: z.boolean(),
    note: z.string().optional(),
  }),
});

export type PlanApprovalCommand = z.infer<typeof planApprovalCommandSchema>;

export const planDecisionAnyCommandSchema = z.union([
  planDecisionCommandSchema,
  feedbackApprovalCommandSchema,
  planApprovalCommandSchema,
]);

export type PlanDecisionAnyCommand = z.infer<typeof planDecisionAnyCommandSchema>;

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

export const compatibilityStreamEventSchema = z.union([
  z.object({
    type: z.literal("thought"),
    data: thoughtEventSchema,
  }),
  z.object({
    type: z.literal("adk.event"),
    data: adkEventSchema,
  }),
]);

// ============================================================================
// SoT Report Schemas - The main report structure
// ============================================================================

export const metricItemSchema = z.object({
  metric: z.string(),
  value: z.union([z.string(), z.number()]),
  change: z.union([z.string(), z.number()]).optional(),
  direction: z.string().optional(),
  context: z.string().optional(),
  sub_label: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  status: z.string().nullable().optional(),
  format: z.string().optional(),
});

export const chartDataPointSchema = z.object({
  label: z.string().optional(),
  value: z.number().optional(),
  x: z.union([z.string(), z.number()]).optional(),
  y: z.number().optional(),
  fill: z.string().optional(),
});

export const chartSeriesDataPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number(),
});

export const chartSeriesSchema = z.object({
  name: z.string(),
  data: z.array(chartSeriesDataPointSchema),
});

export const chartSchema = z.object({
  title: z.string(),
  type: z.enum(["line", "bar", "pie", "area", "stacked_bar"]),
  data: z.array(chartDataPointSchema).optional(),
  series: z.array(chartSeriesSchema).optional(),
  x_axis_label: z.string().optional(),
  y_axis_label: z.string().optional(),
  description: z.string().optional(),
});

export const tableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const recommendationSchema = recommendationItemSchema.extend({
  action: z.string().optional(),
  type: z.string().optional(),
  target: z.string().optional(),
  description: z.string().optional(),
  reasoning: z.string().optional(),
  impact: z.string().optional(),
  effort: z.string().optional(),
  expected_outcome: z.string().optional(),
});


// ============================================================================
// Legacy/Direct Answer Schemas
// ============================================================================

export const directAnswerSchema = z.object({
  type: z.literal("direct_answer"),
  content: z.string(),
});

export type DirectAnswerPayload = z.infer<typeof directAnswerSchema>;

// ============================================================================
// Backend Response Parsing
// ============================================================================

function extractJsonArrayFromString(str: string): any[] {
  const startIdx = str.indexOf('[');
  const endIdx = str.lastIndexOf(']');
  
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return [];
  }
  
  try {
    return JSON.parse(str.slice(startIdx, endIdx + 1));
  } catch {
    return [];
  }
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value);
}

function formatEnumLabel(value: unknown): string {
  const raw = toDisplayString(value).trim();
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeChartType(value: unknown): "line" | "bar" | "pie" | "area" | "stacked_bar" {
  const raw = toDisplayString(value).toLowerCase().trim();
  if (!raw) return "bar";

  if (raw === "stacked-bar" || raw === "stackedbar" || raw === "stacked_bar") {
    return "stacked_bar";
  }
  if (raw === "line") return "line";
  if (raw === "bar" || raw === "column") return "bar";
  if (raw === "pie" || raw === "donut") return "pie";
  if (raw === "area") return "area";
  return "bar";
}

function toMetricStatus(input: any): string {
  if (typeof input?.status === "string" && input.status.trim().length > 0) {
    return input.status;
  }
  if (typeof input?.impact === "string") {
    const impact = input.impact.toLowerCase();
    if (impact.includes("negative") || impact.includes("risk") || impact.includes("critical")) {
      return "risk";
    }
    if (impact.includes("positive")) {
      return "positive";
    }
  }
  if (typeof input?.is_positive_change === "boolean") {
    return input.is_positive_change ? "positive" : "risk";
  }
  if (typeof input?.is_positive === "boolean") {
    return input.is_positive ? "positive" : "risk";
  }
  return "neutral";
}

function toInsightSeverity(input: any): "positive" | "neutral" | "watch" | "risk" {
  if (typeof input?.severity === "string") {
    const severity = input.severity.toLowerCase();
    if (severity === "positive" || severity === "neutral" || severity === "watch" || severity === "risk") {
      return severity;
    }
  }
  if (typeof input?.impact === "string") {
    const impact = input.impact.toLowerCase();
    if (impact.includes("negative") || impact.includes("risk") || impact.includes("critical")) {
      return "risk";
    }
    if (impact.includes("watch") || impact.includes("caution")) {
      return "watch";
    }
    if (impact.includes("positive")) {
      return "positive";
    }
  }
  if (typeof input?.type === "string") {
    const type = input.type.toLowerCase();
    if (type === "risk") return "risk";
    if (type === "opportunity" || type === "performance" || type === "positive") return "positive";
  }
  return "neutral";
}

function toTableFromRows(rows: any[] | undefined): { headers: string[]; rows: string[][] } | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const headers = Object.keys(rows[0] || {});
  if (headers.length === 0) return null;
  return {
    headers,
    rows: rows.map((row) => headers.map((header) => toDisplayString(row?.[header]))),
  };
}

function parseWideChartsFromRows(graph: any): any[] {
  const rows = Array.isArray(graph?.data)
    ? graph.data.filter((row: unknown) => row && typeof row === "object")
    : [];
  if (rows.length === 0) return [];

  const firstRow = rows[0] as Record<string, unknown>;
  const keys = Object.keys(firstRow);
  if (keys.length === 0) return [];

  const candidateLabelKeys = ["label", "name", "x", "category", "campaign", "ad_set", "ad_set_name"];
  const labelKey =
    candidateLabelKeys.find((key) => key in firstRow) ??
    keys.find((key) => typeof firstRow[key] === "string") ??
    keys[0];

  const numericKeys = keys.filter((key) => {
    if (key === labelKey) return false;
    const value = firstRow[key];
    if (typeof value === "number") return true;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed);
    }
    return false;
  });

  if (numericKeys.length === 0) return [];

  const baseTitle = toDisplayString(graph?.title || graph?.graph_name || "Chart");
  const chartType = normalizeChartType(graph?.type || graph?.graph_type || "bar");
  const xAxisLabel = graph?.x_axis_label || formatEnumLabel(labelKey);
  const description = graph?.description || graph?.graph_description;

  return numericKeys.map((metricKey) => ({
    title: numericKeys.length > 1 ? `${baseTitle} — ${metricKey}` : baseTitle,
    type: chartType,
    data: rows.map((row: Record<string, unknown>) => ({
      label: toDisplayString(row[labelKey]),
      value: toFiniteNumber(row[metricKey]),
    })),
    x_axis_label: xAxisLabel,
    y_axis_label: metricKey,
    description,
  }));
}

function parseGraph(graph: any): any {
  if (!graph) return null;
  
  const baseChart = {
    title: graph.title || graph.graph_name || "Chart",
    type: normalizeChartType(graph.type || graph.graph_type || "bar"),
    description: graph.description || graph.graph_description,
  };
  
  if (Array.isArray(graph.series)) {
    return {
      ...baseChart,
      series: graph.series.map((s: any) => ({
        name: s.name || "Series",
        data: (s.data || []).map((d: any, index: number) => ({
          x: d.x || d.label || d.name || d.category || String(index + 1),
          y: toFiniteNumber(d.y ?? d.value),
        })),
      })),
      x_axis_label: graph.x_axis_label,
      y_axis_label: graph.y_axis_label,
    };
  }

  if (Array.isArray(graph.labels) && Array.isArray(graph.datasets)) {
    const labels = graph.labels.map((label: unknown) => String(label ?? ""));
    const datasets = graph.datasets;

    if (datasets.length === 1) {
      const dataset = datasets[0] || {};
      return {
        ...baseChart,
        title: graph.title || dataset.label || baseChart.title,
        data: labels.map((label: string, index: number) => ({
          label,
          value: toFiniteNumber(dataset.data?.[index]),
        })),
      };
    }

    return {
      ...baseChart,
      series: datasets.map((dataset: any, datasetIndex: number) => ({
        name: dataset.label || `Series ${datasetIndex + 1}`,
        data: labels.map((label: string, index: number) => ({
          x: label,
          y: toFiniteNumber(dataset.data?.[index]),
        })),
      })),
      x_axis_label: graph.x_axis_label,
      y_axis_label: graph.y_axis_label,
    };
  }
  
  return {
    ...baseChart,
    data: (graph.data || []).map((d: any) => ({
      label: d.label || d.name || d.x || d.category || "",
      value: toFiniteNumber(d.value ?? d.y),
      fill: d.fill,
    })),
  };
}

function parseGraphsFromInput(graph: any): any[] {
  if (!graph) return [];
  const wideCharts = parseWideChartsFromRows(graph);
  if (wideCharts.length > 0) {
    return wideCharts;
  }
  const parsed = parseGraph(graph);
  return parsed ? [parsed] : [];
}

function parseReportData(reportData: any): { 
  metrics: any[]; 
  graphs: any[]; 
  table: any | null;
  title: string;
  summary: string;
  sectionSummary: string;
} {
  const result = {
    metrics: [] as any[],
    graphs: [] as any[],
    table: null as any | null,
    title: reportData.title || "",
    summary: reportData.summary || "",
    sectionSummary:
      reportData.section_summary ||
      reportData.analysis_summary ||
      "",
  };
  
  // Support key_metrics (Lead Strategist format)
  if (Array.isArray(reportData.key_metrics)) {
    result.metrics = reportData.key_metrics.map((m: any) => ({
      metric: m.label || m.metric || "Metric",
      value: m.value ?? "0",
      change: m.change,
      status: toMetricStatus(m),
      direction: m.direction,
      context: m.context,
      sub_label: m.sub_label,
      prefix: m.prefix,
      suffix: m.suffix,
    }));
  }
  
  // Support performance_snapshot (SoT format)
  if (Array.isArray(reportData.performance_snapshot)) {
    result.metrics = reportData.performance_snapshot.map((m: any) => ({
      metric: m.label || m.metric || "Metric",
      value: m.value ?? "0",
      change: m.change,
      status: toMetricStatus(m),
      direction: m.direction,
      context: m.context,
      sub_label: m.sub_label,
      prefix: m.prefix,
      suffix: m.suffix,
    }));
  }
  
  if (Array.isArray(reportData.graphs)) {
    result.graphs = reportData.graphs.flatMap((graph: any) =>
      parseGraphsFromInput(graph)
    );
  }
  if (Array.isArray(reportData.charts)) {
    result.graphs.push(
      ...reportData.charts.flatMap((graph: any) => parseGraphsFromInput(graph))
    );
  }
  if (reportData.main_graph) {
    result.graphs.push(...parseGraphsFromInput(reportData.main_graph));
  }
  if (reportData.primary_performance_graph) {
    result.graphs.push(...parseGraphsFromInput(reportData.primary_performance_graph));
  }
  
  if (reportData.table) {
    result.table = {
      headers: reportData.table.headers || [],
      rows: reportData.table.rows || [],
    };
  } else if (Array.isArray(reportData.campaign_table) && reportData.campaign_table.length > 0) {
    const table = toTableFromRows(reportData.campaign_table);
    if (table) result.table = table;
  } else if (Array.isArray(reportData.performance_table) && reportData.performance_table.length > 0) {
    const table = toTableFromRows(reportData.performance_table);
    if (table) result.table = table;
  }
  
  return result;
}

// ============================================================================
// Report Payload Schema - Main entry point for parsing backend responses
// ============================================================================

export const reportPayloadSchema = z.union([
  // specialist_insights format (JSON wrapped in strings) - ONLY match if specialist_insights exists
  z.object({
    specialist_insights: z.array(z.string()),
  }).transform((data) => {
    const insights = data.specialist_insights || [];
    
    let executiveSummary = "";
    let performanceSnapshot: any[] = [];
    let sections: any[] = [];
    let strategicRecommendations: any[] = [];
    let allGraphs: any[] = [];
    
    for (const insightStr of insights) {
      const items = extractJsonArrayFromString(insightStr);
      
      for (const item of items) {
        if (!item) continue;
        
        if (item.report_data) {
          const reportData = item.report_data;
          const parsed = parseReportData(reportData);
          
          if (parsed.summary && !executiveSummary) {
            executiveSummary = parsed.summary;
          }
          
          if (parsed.metrics.length > 0 && performanceSnapshot.length === 0) {
            performanceSnapshot = parsed.metrics;
          }
          
          if (parsed.graphs.length > 0) {
            allGraphs.push(...parsed.graphs);
          }
          
          const sectionTables = parsed.table ? [parsed.table] : [];
          const sectionGraphs = parsed.graphs;
          
          if (sectionTables.length > 0 || sectionGraphs.length > 0 || parsed.sectionSummary) {
            sections.push({
              heading: parsed.title || "Analysis",
              scope: "account",
              summary: parsed.sectionSummary,
              highlights: [],
              tables: sectionTables,
              actions: [],
              confidence: null,
              cached_sources: [],
              graphs: sectionGraphs,
            });
          }
        }
        
        const itemRecommendations = item.recommendations || item.reccomendations;
        if (Array.isArray(itemRecommendations)) {
          strategicRecommendations.push(...itemRecommendations.map((r: any) => ({
            title: r.title || r.action || formatEnumLabel(r.type) || "Recommendation",
            rationale: r.rationale || r.description || r.recommendation || r.reasoning || "",
            expected_impact: r.expected_impact ?? r.impact ?? null,
            priority: r.priority ? String(r.priority).toUpperCase() : "MEDIUM",
            // Backward compatibility
            action: r.action || r.title || formatEnumLabel(r.type) || "Recommendation",
            description: r.rationale || r.description || r.recommendation || r.reasoning || "",
            type: formatEnumLabel(r.type) || null,
            target: r.target || null,
            reasoning: r.reasoning || r.rationale || null,
            impact: r.impact || r.expected_impact || null,
          })));
        }
      }
    }
    
    return {
      language: "en",
      executive_summary: executiveSummary || "Analysis complete.",
      performance_snapshot: performanceSnapshot,
      sections,
      strategic_recommendations: strategicRecommendations,
      follow_up_questions: [],
      handoff_trace: [],
      cached_sources: [],
      graphs: allGraphs,
    };
  }),
  // Catch-all for flexible/streaming JSON formats - try this BEFORE strict frontendCheckpointReportSchema
  z.record(z.string(), z.unknown()).transform((data) => {
    const anyData = data as any;
    
    // Support multiple field name variations
    const executiveSummary = anyData.executive_summary || anyData.summary || anyData.title || "";
    const sectionSummary =
      anyData.section_summary ||
      anyData.analysis_summary ||
      anyData.section_overview ||
      "";
    const performanceSnapshot: any[] = [];
    // Support: key_metrics (Lead Strategist), performance_snapshot (SoT)
    const metricsSource = anyData.key_metrics || anyData.performance_snapshot || [];
    if (Array.isArray(metricsSource)) {
      performanceSnapshot.push(...metricsSource.map((m: any) => ({
        metric: m.label || m.metric || "Metric",
        value: m.value ?? m.value ?? "0",
        change: m.change,
        direction: m.direction,
        context: m.context,
        sub_label: m.sub_label,
        status: toMetricStatus(m),
        prefix: m.prefix,
        suffix: m.suffix,
      })));
    }
    
    const allGraphs: any[] = [];
    // Support: main_graph, primary_performance_graph, graphs, charts
    if (anyData.main_graph) {
      allGraphs.push(...parseGraphsFromInput(anyData.main_graph));
    }
    if (anyData.primary_performance_graph) {
      allGraphs.push(...parseGraphsFromInput(anyData.primary_performance_graph));
    }
    if (Array.isArray(anyData.graphs)) {
      allGraphs.push(
        ...anyData.graphs.flatMap((graph: any) => parseGraphsFromInput(graph))
      );
    }
    if (Array.isArray(anyData.charts)) {
      allGraphs.push(
        ...anyData.charts.flatMap((graph: any) => parseGraphsFromInput(graph))
      );
    }
    
    const sections: any[] = [];
    const sectionTables: any[] = [];
    
    // Support: campaign_table, performance_table
    const campaignTable = toTableFromRows(anyData.campaign_table);
    if (campaignTable) {
      sectionTables.push(campaignTable);
    }
    const performanceTable = toTableFromRows(anyData.performance_table);
    if (performanceTable) {
      sectionTables.push(performanceTable);
    }
    if (anyData.table && Array.isArray(anyData.table.headers) && Array.isArray(anyData.table.rows)) {
      sectionTables.push({
        headers: anyData.table.headers.map((header: unknown) => toDisplayString(header)),
        rows: anyData.table.rows.map((row: unknown) =>
          Array.isArray(row) ? row.map((cell) => toDisplayString(cell)) : []
        ),
      });
    }
    
    // Support: key_insights, strategy_and_insights, strategic_analysis, insights
    const highlights: any[] = [];
    const insightsSources = [
      anyData.key_insights,
      anyData.strategic_analysis,
      anyData.strategy_and_insights,
      anyData.insights,
      anyData.key_findings,
    ];
    for (const source of insightsSources) {
      if (!Array.isArray(source)) continue;
      highlights.push(...source.map((a: any) => ({
        category: a.category || "analysis",
        title: a.title || a.name || "",
        text: a.content || a.description || a.text || "",
        impact: a.impact || a.metric || null,
        severity: toInsightSeverity(a),
        confidence: a.confidence ?? null,
        evidence: Array.isArray(a.evidence) ? a.evidence.map((item: unknown) => toDisplayString(item)) : [],
      })));
    }
    
    if (sectionTables.length > 0 || highlights.length > 0 || allGraphs.length > 0 || sectionSummary) {
      sections.push({
        heading: anyData.section_title || anyData.analysis_title || "Analysis",
        scope: "account",
        summary: sectionSummary,
        highlights,
        tables: sectionTables,
        actions: [],
        confidence: null,
        cached_sources: [],
        graphs: allGraphs,
      });
    }
    
    // Support: action_plan, next_steps, recommendations, priority_recommendations
    const strategicRecommendations: any[] = [];
    const recommendationSources = [
      anyData.action_plan,
      anyData.next_steps,
      anyData.recommendations,
      anyData.reccomendations,
      anyData.priority_recommendations,
      anyData.priority_reccomendations,
      anyData["priority reccomendations"],
    ];
    for (const source of recommendationSources) {
      if (!Array.isArray(source)) continue;
      strategicRecommendations.push(...source.map((s: any) => ({
        title: s.action || s.title || formatEnumLabel(s.type) || "Recommendation",
        rationale: s.rationale || s.description || s.recommendation || s.reasoning || "",
        expected_impact: s.expected_impact ?? s.impact ?? null,
        priority: s.priority ? String(s.priority).toUpperCase() : "MEDIUM",
        // Backward compatibility
        action: s.action || s.title || formatEnumLabel(s.type) || "Recommendation",
        description: s.rationale || s.description || s.recommendation || s.reasoning || "",
        type: formatEnumLabel(s.type) || null,
        target: s.target || null,
        reasoning: s.reasoning || s.rationale || null,
        impact: s.impact || s.expected_impact || null,
      })));
    }
    
    return {
      language: "en",
      // Primary field names (SoT format)
      executive_summary: executiveSummary,
      performance_snapshot: performanceSnapshot,
      sections,
      strategic_recommendations: strategicRecommendations,
      follow_up_questions: anyData.follow_up_questions || [],
      handoff_trace: anyData.handoff_trace || [],
      cached_sources: anyData.cached_sources || [],
      graphs: allGraphs,
      // Aliases for backward compatibility / other formats
      summary: executiveSummary,
      charts: allGraphs,
      priority_recommendations: strategicRecommendations,
      strategic_insights: highlights,
      title: anyData.title || "",
      // Legacy fields
      data_integrity_notes: ["Date Range", `Date Range: ${anyData.date_range || "N/A"}`],
    };
  }),
  // Strict FrontendCheckpointReport schema - only matches if data has meaningful SoT fields
  frontendCheckpointReportSchema,
  // Direct answer format
  directAnswerSchema,
]);

export type ReportPayload = FrontendCheckpointReport | DirectAnswerPayload;

// ============================================================================
// Helper to check if report has content
// ============================================================================

export function hasReportContent(
  report: ReportPayload | null
): boolean {
  if (!report) return false;
  if ("type" in report && report.type === "direct_answer") return true;
  
  const r = report as FrontendCheckpointReport;
  return !!(
    r.executive_summary ||
    r.performance_snapshot?.length ||
    r.sections?.length ||
    r.strategic_recommendations?.length ||
    r.graphs?.length
  );
}
