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
  clarification: z
    .object({
      id: z.string().min(1),
    })
    .optional(),
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

export const frontendBudgetSchema = z
  .object({
    total_spend: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
  })
  .passthrough();

export const frontendGraphSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    frontend_parser: z.string().optional(),
    data_format: z.string().optional(),
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
  report_title: z.string().default(""),
  executive_summary: z.string().default(""),
  budget: frontendBudgetSchema.nullable().default(null),
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

export const responseClarificationRequestSchema = streamEventSchema(
  "response.clarification_request",
  z
    .object({
      id: z.string().optional(),
      clarification_id: z.string().optional(),
      question: z.string().optional(),
      prompt: z.string().optional(),
      message: z.string().optional(),
    })
    .passthrough()
);

const objectiveEventItemSchema = z
  .object({
    id: z.string().optional(),
    objective_id: z.string().optional(),
    key: z.string().optional(),
    title: z.string().optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const responseObjectivesSchema = streamEventSchema(
  "response.objectives",
  z.union([
    z
      .object({
        objectives: z.array(objectiveEventItemSchema).optional(),
        items: z.array(objectiveEventItemSchema).optional(),
        checklist: z.array(objectiveEventItemSchema).optional(),
      })
      .passthrough(),
    z.array(objectiveEventItemSchema),
  ])
);

export const responseObjectiveUpdatedSchema = streamEventSchema(
  "response.objective.updated",
  z
    .object({
      objective: objectiveEventItemSchema.optional(),
      update: objectiveEventItemSchema.optional(),
      id: z.string().optional(),
      objective_id: z.string().optional(),
      key: z.string().optional(),
      title: z.string().optional(),
      label: z.string().optional(),
      description: z.string().optional(),
      summary: z.string().optional(),
      status: z.string().optional(),
    })
    .passthrough()
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
  | z.infer<typeof responseObjectivesSchema>
  | z.infer<typeof responseObjectiveUpdatedSchema>
  | z.infer<typeof responseClarificationRequestSchema>
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
  responseObjectivesSchema,
  responseObjectiveUpdatedSchema,
  responseClarificationRequestSchema,
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

export const jainaObjectiveStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

export type JainaObjectiveStatus = z.infer<typeof jainaObjectiveStatusSchema>;

export const jainaObjectiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: jainaObjectiveStatusSchema,
});

export type JainaObjective = z.infer<typeof jainaObjectiveSchema>;

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

function resolveFrontendParserHint(value: unknown): "series" | "chartjs" | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.startsWith("series")) return "series";
  if (normalized.startsWith("chartjs")) return "chartjs";
  return "";
}

function parseGraph(graph: any): any {
  if (!graph) return null;

  const parserHint = resolveFrontendParserHint(
    graph.frontend_parser ?? graph.data_format
  );

  const baseChart = {
    title: graph.title || graph.graph_name || "Chart",
    type: normalizeChartType(graph.type || graph.graph_type || "bar"),
    description: graph.description || graph.graph_description,
    frontend_parser: parserHint || undefined,
  };

  if (parserHint === "series" && Array.isArray(graph.series)) {
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

  if (parserHint === "chartjs" && Array.isArray(graph.labels) && Array.isArray(graph.datasets)) {
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
  const parserHint = resolveFrontendParserHint(
    graph.frontend_parser ?? graph.data_format
  );

  if (parserHint === "series" || parserHint === "chartjs") {
    const parsedWithHint = parseGraph(graph);
    return parsedWithHint ? [parsedWithHint] : [];
  }

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
      report_title: "",
      executive_summary: executiveSummary || "Analysis complete.",
      budget: null,
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
    const anyData = data as Record<string, unknown>;
    const nestedReport =
      anyData.report && typeof anyData.report === "object" && !Array.isArray(anyData.report)
        ? (anyData.report as Record<string, unknown>)
        : null;
    const source = nestedReport ?? anyData;
    const summaryObject =
      source.summary && typeof source.summary === "object" && !Array.isArray(source.summary)
        ? (source.summary as Record<string, unknown>)
        : null;

    const mapRecommendation = (value: unknown) => {
      if (typeof value === "string") {
        return {
          title: value,
          rationale: value,
          expected_impact: null,
          priority: "MEDIUM",
          action: value,
          description: value,
          type: null,
          target: null,
          reasoning: null,
          impact: null,
        };
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const item = value as Record<string, unknown>;
      const title =
        (typeof item.action === "string" && item.action) ||
        (typeof item.title === "string" && item.title) ||
        formatEnumLabel(item.type) ||
        "Recommendation";
      const rationale =
        (typeof item.rationale === "string" && item.rationale) ||
        (typeof item.description === "string" && item.description) ||
        (typeof item.recommendation === "string" && item.recommendation) ||
        (typeof item.reasoning === "string" && item.reasoning) ||
        "";
      return {
        title,
        rationale,
        expected_impact: item.expected_impact ?? item.impact ?? null,
        priority:
          item.priority !== undefined && item.priority !== null
            ? String(item.priority).toUpperCase()
            : "MEDIUM",
        action: title,
        description: rationale,
        type: formatEnumLabel(item.type) || null,
        target: (typeof item.target === "string" && item.target) || null,
        reasoning:
          (typeof item.reasoning === "string" && item.reasoning) ||
          (typeof item.rationale === "string" && item.rationale) ||
          null,
        impact:
          (typeof item.impact === "string" && item.impact) ||
          (typeof item.expected_impact === "string" && item.expected_impact) ||
          null,
      };
    };

    const mapHighlight = (value: unknown) => {
      if (typeof value === "string") {
        return {
          category: "analysis",
          title: "",
          text: value,
          impact: null,
          severity: "neutral",
          confidence: null,
          evidence: [],
        };
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const insight = value as Record<string, unknown>;
      return {
        category:
          (typeof insight.category === "string" && insight.category) || "analysis",
        title:
          (typeof insight.title === "string" && insight.title) ||
          (typeof insight.name === "string" && insight.name) ||
          "",
        text:
          (typeof insight.content === "string" && insight.content) ||
          (typeof insight.description === "string" && insight.description) ||
          (typeof insight.text === "string" && insight.text) ||
          "",
        impact:
          (typeof insight.impact === "string" && insight.impact) ||
          (typeof insight.metric === "string" && insight.metric) ||
          null,
        severity: toInsightSeverity(insight),
        confidence:
          (typeof insight.confidence === "string" && insight.confidence) || null,
        evidence: Array.isArray(insight.evidence)
          ? insight.evidence.map((item: unknown) => toDisplayString(item))
          : [],
      };
    };

    const sectionGraphSources = [
      source.main_graph,
      source.primary_performance_graph,
      ...(Array.isArray(source.graphs) ? source.graphs : []),
      ...(Array.isArray(source.charts) ? source.charts : []),
    ];
    const allGraphs = sectionGraphSources.flatMap((graph) => parseGraphsFromInput(graph));

    const performanceSnapshot: any[] = [];
    const metricsSource = source.key_metrics || source.performance_snapshot || [];
    if (Array.isArray(metricsSource)) {
      performanceSnapshot.push(
        ...metricsSource.map((m: any) => ({
          metric: m.label || m.metric || m.name || "Metric",
          value: m.value ?? "0",
          change: m.change,
          direction: m.direction,
          context: m.context,
          sub_label: m.sub_label,
          status: toMetricStatus(m),
          prefix: m.prefix || (m.unit === "currency" ? "$" : undefined),
          suffix: m.suffix || (m.unit === "%" ? "%" : undefined),
          format: m.format || (m.unit === "currency" ? "currency" : undefined),
        }))
      );
    }

    if (Array.isArray(source.kpis)) {
      performanceSnapshot.push(
        ...source.kpis.map((kpi: any) => ({
          metric: kpi.name || kpi.metric || kpi.label || "KPI",
          value: kpi.value ?? "0",
          status: toMetricStatus(kpi),
          prefix: kpi.unit === "currency" ? "$" : undefined,
          suffix: kpi.unit === "x" || kpi.unit === "%" ? String(kpi.unit) : undefined,
          format: kpi.unit === "currency" ? "currency" : undefined,
          context: typeof kpi.description === "string" ? kpi.description : undefined,
        }))
      );
    }

    const budget =
      source.budget && typeof source.budget === "object" && !Array.isArray(source.budget)
        ? (source.budget as Record<string, unknown>)
        : null;
    if (budget && budget.total_spend !== undefined && budget.total_spend !== null) {
      performanceSnapshot.push({
        metric: "Total Spend",
        value:
          typeof budget.total_spend === "number" || typeof budget.total_spend === "string"
            ? budget.total_spend
            : String(budget.total_spend),
        prefix: budget.currency === "USD" ? "$" : undefined,
        format: budget.currency === "USD" ? "currency" : undefined,
        status: "neutral",
      });
    }

    const sections: any[] = [];
    const topLevelHighlights: any[] = [];

    if (Array.isArray(source.sections)) {
      for (const rawSection of source.sections) {
        if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) {
          continue;
        }
        const section = rawSection as Record<string, unknown>;
        const highlightsSource =
          section.highlights ||
          section.insights ||
          section.key_insights ||
          section.key_findings ||
          [];
        const actionsSource =
          section.actions || section.recommendations || section.reccomendations || [];
        const sectionHighlights = Array.isArray(highlightsSource)
          ? highlightsSource
              .map((item) => mapHighlight(item))
              .filter(
                (
                  item
                ): item is NonNullable<ReturnType<typeof mapHighlight>> =>
                  item !== null
              )
          : [];
        const sectionActions = Array.isArray(actionsSource)
          ? actionsSource
              .map((item) => mapRecommendation(item))
              .filter(
                (
                  item
                ): item is NonNullable<ReturnType<typeof mapRecommendation>> =>
                  item !== null
              )
          : [];
        const rawTables = Array.isArray(section.tables)
          ? section.tables
          : section.table
            ? [section.table]
            : [];
        const sectionGraphs = [
          ...(Array.isArray(section.graphs) ? section.graphs : []),
          ...(Array.isArray(section.charts) ? section.charts : []),
        ].flatMap((graph) => parseGraphsFromInput(graph));

        sections.push({
          heading:
            (typeof section.heading === "string" && section.heading) ||
            (typeof section.title === "string" && section.title) ||
            "Analysis",
          scope:
            (typeof section.scope === "string" && section.scope) || "account",
          summary:
            (typeof section.summary === "string" && section.summary) ||
            (typeof section.content === "string" && section.content) ||
            (typeof section.section_summary === "string" && section.section_summary) ||
            (typeof section.analysis_summary === "string" && section.analysis_summary) ||
            "",
          highlights: sectionHighlights,
          tables: rawTables,
          actions: sectionActions,
          confidence:
            (typeof section.confidence === "string" && section.confidence) || null,
          cached_sources: Array.isArray(section.cached_sources)
            ? section.cached_sources.map((item) => toDisplayString(item))
            : [],
          graphs: sectionGraphs,
        });
      }
    }

    const sectionTables: any[] = [];
    const campaignTable = toTableFromRows(
      Array.isArray(source.campaign_table) ? source.campaign_table : undefined
    );
    if (campaignTable) {
      sectionTables.push(campaignTable);
    }
    const performanceTable = toTableFromRows(
      Array.isArray(source.performance_table) ? source.performance_table : undefined
    );
    if (performanceTable) {
      sectionTables.push(performanceTable);
    }
    if (
      source.table &&
      typeof source.table === "object" &&
      !Array.isArray(source.table) &&
      Array.isArray((source.table as Record<string, unknown>).headers) &&
      Array.isArray((source.table as Record<string, unknown>).rows)
    ) {
      const table = source.table as Record<string, unknown>;
      sectionTables.push({
        headers: (table.headers as unknown[]).map((header) => toDisplayString(header)),
        rows: (table.rows as unknown[]).map((row) =>
          Array.isArray(row) ? row.map((cell) => toDisplayString(cell)) : []
        ),
      });
    }

    const insightsSources = [
      summaryObject?.key_findings,
      source.key_insights,
      source.strategic_analysis,
      source.strategy_and_insights,
      source.insights,
      source.key_findings,
    ];
    for (const sourceInsights of insightsSources) {
      if (!Array.isArray(sourceInsights)) continue;
      topLevelHighlights.push(
        ...sourceInsights
          .map((item) => mapHighlight(item))
          .filter(
            (
              item
            ): item is NonNullable<ReturnType<typeof mapHighlight>> =>
              item !== null
          )
      );
    }

    if (sections.length > 0 && topLevelHighlights.length > 0) {
      const firstSection = sections[0];
      if (firstSection && Array.isArray(firstSection.highlights)) {
        firstSection.highlights = [...topLevelHighlights, ...firstSection.highlights];
      }
    }

    const sectionSummary =
      (typeof source.section_summary === "string" && source.section_summary) ||
      (typeof source.analysis_summary === "string" && source.analysis_summary) ||
      (typeof source.section_overview === "string" && source.section_overview) ||
      "";
    if (
      sections.length === 0 &&
      (sectionTables.length > 0 ||
        topLevelHighlights.length > 0 ||
        allGraphs.length > 0 ||
        sectionSummary)
    ) {
      sections.push({
        heading:
          (typeof source.section_title === "string" && source.section_title) ||
          (typeof source.analysis_title === "string" && source.analysis_title) ||
          "Analysis",
        scope: "account",
        summary: sectionSummary,
        highlights: topLevelHighlights,
        tables: sectionTables,
        actions: [],
        confidence: null,
        cached_sources: [],
        graphs: allGraphs,
      });
    }

    const strategicRecommendations: any[] = [];
    const recommendationSources = [
      summaryObject?.recommendations,
      source.strategic_recommendations,
      source.action_plan,
      source.next_steps,
      source.recommendations,
      source.reccomendations,
      source.priority_recommendations,
      source.priority_reccomendations,
      source["priority reccomendations"],
    ];
    for (const recommendationSource of recommendationSources) {
      if (!Array.isArray(recommendationSource)) continue;
      strategicRecommendations.push(
        ...recommendationSource
          .map((item) => mapRecommendation(item))
          .filter(
            (
              item
            ): item is NonNullable<ReturnType<typeof mapRecommendation>> =>
              item !== null
          )
      );
    }
    if (strategicRecommendations.length === 0) {
      for (const section of sections) {
        if (Array.isArray(section.actions)) {
          strategicRecommendations.push(...section.actions);
        }
      }
    }

    const executiveSummary =
      (typeof source.executive_summary === "string" && source.executive_summary) ||
      (typeof summaryObject?.overview === "string" && summaryObject.overview) ||
      (typeof source.summary === "string" && source.summary) ||
      (typeof source.title === "string" && source.title) ||
      "";
    const reportTitle =
      (typeof summaryObject?.title === "string" && summaryObject.title) ||
      (typeof source.title === "string" && source.title) ||
      "";

    return {
      language:
        (typeof source.language === "string" && source.language) || "en",
      report_title: reportTitle,
      executive_summary: executiveSummary,
      budget,
      performance_snapshot: performanceSnapshot,
      sections,
      strategic_recommendations: strategicRecommendations,
      follow_up_questions: Array.isArray(source.follow_up_questions)
        ? source.follow_up_questions
        : [],
      handoff_trace: Array.isArray(source.handoff_trace) ? source.handoff_trace : [],
      cached_sources: Array.isArray(source.cached_sources) ? source.cached_sources : [],
      graphs: allGraphs,
      summary: executiveSummary,
      charts: allGraphs,
      priority_recommendations: strategicRecommendations,
      strategic_insights: topLevelHighlights,
      title: (typeof source.title === "string" && source.title) || "",
      data_integrity_notes: [
        "Date Range",
        `Date Range: ${typeof source.date_range === "string" ? source.date_range : "N/A"}`,
      ],
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
