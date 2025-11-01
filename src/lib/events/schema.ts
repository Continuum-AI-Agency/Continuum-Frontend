import { z, type ZodTypeAny } from "zod";

export const CONTINUUM_EVENT_TYPES = [
  "ai.task.progress",
  "ai.task.completed",
  "ai.task.failed",
  "integration.status.changed",
  "campaign.metrics.updated",
  "organic.trend.updated",
] as const;

export type ContinuumEventName = (typeof CONTINUUM_EVENT_TYPES)[number];

const aiTaskProgressSchema = z
  .object({
    taskId: z.string(),
    stage: z.string(),
    message: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
  })
  .strict();

const aiTaskCompletedSchema = z
  .object({
    taskId: z.string(),
    resultId: z.string(),
    summary: z.string().optional(),
  })
  .strict();

const aiTaskFailedSchema = z
  .object({
    taskId: z.string(),
    error: z.string(),
    retryable: z.boolean(),
  })
  .strict();

const integrationStatusChangedSchema = z
  .object({
    provider: z.string(),
    status: z.enum(["connected", "disconnected", "pending", "error"]),
    detail: z.string().optional(),
  })
  .strict();

const campaignMetricsUpdatedSchema = z
  .object({
    campaignId: z.string(),
    timeframe: z.enum(["24h", "7d", "30d", "lifetime"]),
    metrics: z.record(z.string(), z.number()),
  })
  .strict();

const organicTrendUpdatedSchema = z
  .object({
    trendId: z.string(),
    label: z.string(),
    score: z.number(),
    delta: z.number().optional(),
  })
  .strict();

export const continuumEventPayloadSchemas = {
  "ai.task.progress": aiTaskProgressSchema,
  "ai.task.completed": aiTaskCompletedSchema,
  "ai.task.failed": aiTaskFailedSchema,
  "integration.status.changed": integrationStatusChangedSchema,
  "campaign.metrics.updated": campaignMetricsUpdatedSchema,
  "organic.trend.updated": organicTrendUpdatedSchema,
} as const satisfies Record<ContinuumEventName, ZodTypeAny>;

type ContinuumEventSchemaMap = typeof continuumEventPayloadSchemas;

export const continuumEventNameSchema = z.enum(CONTINUUM_EVENT_TYPES);

export type ContinuumEventMap = {
  [K in ContinuumEventName]: z.infer<ContinuumEventSchemaMap[K]>;
};

export type ContinuumEvent<K extends ContinuumEventName = ContinuumEventName> = {
  type: K;
  data: ContinuumEventMap[K];
  id?: string;
  timestamp: string;
};

export function getContinuumEventSchema<K extends ContinuumEventName>(type: K) {
  return continuumEventPayloadSchemas[type];
}
