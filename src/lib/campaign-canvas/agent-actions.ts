import { z } from "zod";

const NODE_TYPES = ["campaign", "ad-set", "ad", "audience", "creative"] as const;
const OBJECTIVES = [
  "OUTCOME_SALES",
  "OUTCOME_LEADS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_APP_PROMOTION",
] as const;

const flowPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const createNodePayloadSchema = z
  .union([
    z.object({
      nodeType: z.enum(NODE_TYPES),
      data: z.record(z.string(), z.unknown()).optional().default({}),
      position: flowPositionSchema.optional(),
      id: z.string().min(1).optional(),
    }),
    z.object({
      type: z.enum(NODE_TYPES),
      data: z.record(z.string(), z.unknown()).optional().default({}),
      position: flowPositionSchema.optional(),
      id: z.string().min(1).optional(),
    }),
  ])
  .transform((payload) => {
    const nodeType = "nodeType" in payload ? payload.nodeType : payload.type;
    return {
      nodeType,
      data: payload.data ?? {},
      position: payload.position,
      clientNodeId: payload.id,
    };
  });

const actionCreateNodeSchema = z.object({
  type: z.literal("CREATE_NODE"),
  payload: createNodePayloadSchema,
});

const connectNodesPayloadSchema = z
  .union([
    z.object({
      sourceId: z.string().min(1),
      targetId: z.string().min(1),
    }),
    z.object({
      source_id: z.string().min(1),
      target_id: z.string().min(1),
    }),
  ])
  .transform((payload) => ({
    sourceId: "sourceId" in payload ? payload.sourceId : payload.source_id,
    targetId: "targetId" in payload ? payload.targetId : payload.target_id,
  }));

const actionConnectNodesSchema = z.object({
  type: z.literal("CONNECT_NODES"),
  payload: connectNodesPayloadSchema,
});

const updateNodePayloadSchema = z
  .union([
    z.object({
      nodeId: z.string().min(1),
      data: z.record(z.string(), z.unknown()).default({}),
    }),
    z.object({
      node_id: z.string().min(1),
      data: z.record(z.string(), z.unknown()).default({}),
    }),
  ])
  .transform((payload) => ({
    nodeId: "nodeId" in payload ? payload.nodeId : payload.node_id,
    data: payload.data ?? {},
  }));

const actionUpdateNodeSchema = z.object({
  type: z.literal("UPDATE_NODE"),
  payload: updateNodePayloadSchema,
});

const actionRecommendStructureSchema = z.object({
  type: z.literal("RECOMMEND_STRUCTURE"),
  payload: z.object({
    objective: z.enum(OBJECTIVES),
  }),
});

export const campaignCanvasAgentActionSchema = z.discriminatedUnion("type", [
  actionCreateNodeSchema,
  actionConnectNodesSchema,
  actionUpdateNodeSchema,
  actionRecommendStructureSchema,
]);

export type CampaignCanvasAgentAction = z.infer<typeof campaignCanvasAgentActionSchema>;

export const campaignCanvasActionsEnvelopeSchema = z.object({
  kind: z.literal("campaign_canvas_actions"),
  brandId: z.string().min(1),
  userId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  rationale: z.string().optional(),
  actions: z.array(campaignCanvasAgentActionSchema).min(1),
});

export type CampaignCanvasActionsEnvelope = z.infer<typeof campaignCanvasActionsEnvelopeSchema>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function collectCandidates(value: unknown): unknown[] {
  const seen = new Set<unknown>();
  const queue: unknown[] = [value];
  const candidates: unknown[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || seen.has(current)) continue;
    seen.add(current);

    candidates.push(current);

    const record = asRecord(current);
    if (!record) continue;

    const nestedKeys = [
      "campaign_canvas_actions",
      "campaignCanvasActions",
      "campaign_canvas",
      "campaignCanvas",
      "payload",
      "data",
      "response",
      "result",
      "output",
    ];

    for (const key of nestedKeys) {
      if (key in record) {
        queue.push(record[key]);
      }
    }
  }

  return candidates;
}

export function extractCampaignCanvasActionsEnvelope(
  value: unknown
): CampaignCanvasActionsEnvelope | null {
  const candidates = collectCandidates(value);

  for (const candidate of candidates) {
    const parsed = campaignCanvasActionsEnvelopeSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return null;
}
