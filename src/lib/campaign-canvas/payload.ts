import { z } from "zod";

import type {
  AdData,
  AdFormat,
  AdSetData,
  AudienceData,
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignData,
  CampaignNodeType,
  CreativeAssetType,
  CreativeData,
} from "@/CampaignCanvas/types";
import {
  DEFAULT_AD_FORMAT,
  DEFAULT_CREATIVE_ASSET_TYPE,
} from "@/CampaignCanvas/types/adCreativeCompatibility";

const NODE_TYPES = ["campaign", "ad-set", "ad", "audience", "creative"] as const;
const VALIDATION_STATUSES = ["valid", "warning", "error"] as const;
const OBJECTIVES = [
  "OUTCOME_SALES",
  "OUTCOME_LEADS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_APP_PROMOTION",
] as const;
const BUYING_TYPES = ["AUCTION", "RESERVATION"] as const;
const BUDGET_TYPES = ["DAILY", "LIFETIME"] as const;
const CALL_TO_ACTIONS = [
  "LEARN_MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "BOOK_NOW",
  "CONTACT_US",
  "DOWNLOAD",
] as const;
const PAYLOAD_SOURCES = ["export", "deploy", "agent-check-in", "unknown"] as const;

const campaignNodeTypeSchema = z.enum(NODE_TYPES);
const validationStatusSchema = z.enum(VALIDATION_STATUSES);
const objectiveSchema = z.enum(OBJECTIVES);
const buyingTypeSchema = z.enum(BUYING_TYPES);
const adFormatSchema = z.enum(["IMAGE", "VIDEO", "CAROUSEL", "COLLECTION"]);
const creativeAssetTypeSchema = z.enum(["image", "video"]);
const budgetTypeSchema = z.enum(BUDGET_TYPES);
const callToActionSchema = z.enum(CALL_TO_ACTIONS);
const payloadSourceSchema = z.enum(PAYLOAD_SOURCES);
const genderSchema = z.union([z.literal(1), z.literal(2)]);

const baseNodeSchema = z.object({
  nodeId: z.string().min(1),
  nodeType: campaignNodeTypeSchema,
  label: z.string().min(1),
  selected: z.boolean(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  status: z.enum(["draft", "active", "paused", "archived"]).nullable(),
  validation: z.object({
    status: validationStatusSchema,
    errors: z.array(z.string()),
  }),
  meta: z.object({
    metaId: z.string().nullable(),
  }),
});

const campaignNodePayloadSchema = baseNodeSchema.extend({
  nodeType: z.literal("campaign"),
  options: z.object({
    objective: objectiveSchema.nullable(),
    buyingType: buyingTypeSchema,
    specialAdCategories: z.array(z.string()),
  }),
});

const adSetNodePayloadSchema = baseNodeSchema.extend({
  nodeType: z.literal("ad-set"),
  options: z.object({
    optimizationGoal: z.string().min(1),
    billingEvent: z.string().min(1),
    bidStrategy: z.string().min(1),
    budgetType: budgetTypeSchema,
    budgetAmount: z.number(),
    budgetCurrency: z.string().min(1),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    pacingType: z.array(z.string()),
  }),
});

const adNodePayloadSchema = baseNodeSchema.extend({
  nodeType: z.literal("ad"),
  options: z.object({
    adFormat: adFormatSchema,
    primaryText: z.string(),
    headline: z.string(),
    description: z.string().nullable(),
    callToAction: callToActionSchema,
  }),
});

const audienceNodePayloadSchema = baseNodeSchema.extend({
  nodeType: z.literal("audience"),
  options: z.object({
    locations: z.array(z.string()),
    ageMin: z.number().int().nullable(),
    ageMax: z.number().int().nullable(),
    genders: z.array(genderSchema),
    interests: z.array(z.string()),
    behaviors: z.array(z.string()),
    customAudiences: z.array(z.string()),
  }),
});

const creativeNodePayloadSchema = baseNodeSchema.extend({
  nodeType: z.literal("creative"),
  options: z.object({
    assetType: creativeAssetTypeSchema,
    assetUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    mediaId: z.string().nullable(),
    aspectRatio: z.string().nullable(),
  }),
});

const campaignCanvasNodePayloadSchema = z.discriminatedUnion("nodeType", [
  campaignNodePayloadSchema,
  adSetNodePayloadSchema,
  adNodePayloadSchema,
  audienceNodePayloadSchema,
  creativeNodePayloadSchema,
]);

const campaignCanvasEdgePayloadSchema = z.object({
  edgeId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceType: campaignNodeTypeSchema.nullable(),
  targetType: campaignNodeTypeSchema.nullable(),
  relationship: z.string().min(1),
  sourceHandle: z.string().nullable(),
  targetHandle: z.string().nullable(),
});

const campaignCanvasSummarySchema = z.object({
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  byType: z.object({
    campaign: z.number().int().nonnegative(),
    "ad-set": z.number().int().nonnegative(),
    ad: z.number().int().nonnegative(),
    audience: z.number().int().nonnegative(),
    creative: z.number().int().nonnegative(),
  }),
  validation: z.object({
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
  }),
});

const campaignCanvasContextSchema = z.object({
  source: payloadSourceSchema,
  brandProfileId: z.string().nullable(),
  adAccountId: z.string().nullable(),
  campaignId: z.string().nullable(),
});

const campaignAgentIssueSchema = z.object({
  nodeId: z.string().min(1),
  nodeType: campaignNodeTypeSchema,
  label: z.string().min(1),
  severity: z.enum(["warning", "error"]),
  errors: z.array(z.string()).min(1),
});

const campaignAgentCheckInSchema = z.object({
  validationIssues: z.array(campaignAgentIssueSchema),
  disconnectedNodeIds: z.array(z.string()),
  checklist: z.array(z.string()),
});

export const campaignCanvasPayloadSchema = z.object({
  schemaVersion: z.literal("campaign-canvas.v1"),
  generatedAt: z.string(),
  context: campaignCanvasContextSchema,
  summary: campaignCanvasSummarySchema,
  nodes: z.array(campaignCanvasNodePayloadSchema),
  edges: z.array(campaignCanvasEdgePayloadSchema),
  agentCheckIn: campaignAgentCheckInSchema,
});

export type CampaignCanvasPayload = z.infer<typeof campaignCanvasPayloadSchema>;

export type CampaignCanvasPayloadContext = Partial<
  Omit<CampaignCanvasPayload["context"], "source">
> & {
  source?: CampaignCanvasPayload["context"]["source"];
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const normalized = normalizeString(item);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

function normalizeValidationStatus(value: unknown): (typeof VALIDATION_STATUSES)[number] {
  if (value === "warning" || value === "error" || value === "valid") {
    return value;
  }
  return "valid";
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  return null;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeLabel(value: unknown, fallback: string): string {
  return normalizeString(value) ?? fallback;
}

function normalizeBaseNode(
  node: CampaignCanvasNode
): Omit<z.infer<typeof baseNodeSchema>, "nodeType"> {
  const nodeData = node.data as Record<string, unknown>;
  return {
    nodeId: node.id,
    label: normalizeLabel(nodeData.label, `${node.type} node`),
    selected: normalizeBoolean(node.selected),
    position: {
      x: normalizeNumber(node.position.x, 0),
      y: normalizeNumber(node.position.y, 0),
    },
    status:
      nodeData.status === "draft" ||
      nodeData.status === "active" ||
      nodeData.status === "paused" ||
      nodeData.status === "archived"
        ? nodeData.status
        : null,
    validation: {
      status: normalizeValidationStatus(nodeData.validationStatus),
      errors: normalizeStringArray(nodeData.validationErrors),
    },
    meta: {
      metaId: normalizeString(nodeData.metaId),
    },
  };
}

function normalizeCampaignNode(node: CampaignCanvasNode) {
  const base = normalizeBaseNode(node);
  const data = node.data as Partial<CampaignData>;
  return {
    ...base,
    nodeType: "campaign" as const,
    options: {
      objective: OBJECTIVES.includes(data.objective as (typeof OBJECTIVES)[number])
        ? (data.objective as (typeof OBJECTIVES)[number])
        : null,
      buyingType: BUYING_TYPES.includes(data.buyingType as (typeof BUYING_TYPES)[number])
        ? (data.buyingType as (typeof BUYING_TYPES)[number])
        : "AUCTION",
      specialAdCategories: normalizeStringArray(data.specialAdCategories),
    },
  };
}

function normalizeAdSetNode(node: CampaignCanvasNode) {
  const base = normalizeBaseNode(node);
  const data = node.data as Partial<AdSetData>;
  return {
    ...base,
    nodeType: "ad-set" as const,
    options: {
      optimizationGoal: normalizeLabel(data.optimizationGoal, "CONVERSIONS"),
      billingEvent: normalizeLabel(data.billingEvent, "IMPRESSIONS"),
      bidStrategy: normalizeLabel(data.bidStrategy, "LOWEST_COST_WITHOUT_CAP"),
      budgetType: BUDGET_TYPES.includes(data.budgetType as (typeof BUDGET_TYPES)[number])
        ? (data.budgetType as (typeof BUDGET_TYPES)[number])
        : "DAILY",
      budgetAmount: normalizeNumber(data.budgetAmount, 0),
      budgetCurrency: normalizeLabel(data.budgetCurrency, "USD"),
      startTime: normalizeString(data.startTime),
      endTime: normalizeString(data.endTime),
      pacingType: normalizeStringArray(data.pacingType),
    },
  };
}

function normalizeAdNode(node: CampaignCanvasNode) {
  const base = normalizeBaseNode(node);
  const data = node.data as Partial<AdData>;
  return {
    ...base,
    nodeType: "ad" as const,
    options: {
      adFormat: (["IMAGE", "VIDEO", "CAROUSEL", "COLLECTION"] as const).includes(
        data.adFormat as AdFormat
      )
        ? (data.adFormat as AdFormat)
        : DEFAULT_AD_FORMAT,
      primaryText: normalizeLabel(data.primaryText, ""),
      headline: normalizeLabel(data.headline, ""),
      description: normalizeString(data.description),
      callToAction: CALL_TO_ACTIONS.includes(data.callToAction as (typeof CALL_TO_ACTIONS)[number])
        ? (data.callToAction as (typeof CALL_TO_ACTIONS)[number])
        : "LEARN_MORE",
    },
  };
}

function normalizeAudienceNode(node: CampaignCanvasNode) {
  const base = normalizeBaseNode(node);
  const data = node.data as Partial<AudienceData>;
  return {
    ...base,
    nodeType: "audience" as const,
    options: {
      locations: normalizeStringArray(data.locations),
      ageMin: normalizeInteger(data.ageMin),
      ageMax: normalizeInteger(data.ageMax),
      genders: Array.isArray(data.genders)
        ? data.genders.filter((value): value is 1 | 2 => value === 1 || value === 2)
        : [],
      interests: normalizeStringArray(data.interests),
      behaviors: normalizeStringArray(data.behaviors),
      customAudiences: normalizeStringArray(data.customAudiences),
    },
  };
}

function normalizeCreativeNode(node: CampaignCanvasNode) {
  const base = normalizeBaseNode(node);
  const data = node.data as Partial<CreativeData>;
  return {
    ...base,
    nodeType: "creative" as const,
    options: {
      assetType:
        data.assetType === "image" || data.assetType === "video"
          ? (data.assetType as CreativeAssetType)
          : DEFAULT_CREATIVE_ASSET_TYPE,
      assetUrl: normalizeString(data.assetUrl),
      thumbnailUrl: normalizeString(data.thumbnailUrl),
      mediaId: normalizeString(data.mediaId),
      aspectRatio: normalizeString(data.aspectRatio),
    },
  };
}

function normalizeNode(node: CampaignCanvasNode) {
  switch (node.type) {
    case "campaign":
      return normalizeCampaignNode(node);
    case "ad-set":
      return normalizeAdSetNode(node);
    case "ad":
      return normalizeAdNode(node);
    case "audience":
      return normalizeAudienceNode(node);
    case "creative":
      return normalizeCreativeNode(node);
    default: {
      const exhaustiveCheck: never = node.type;
      throw new Error(`Unsupported node type: ${String(exhaustiveCheck)}`);
    }
  }
}

function buildEdgeRelationship(
  sourceType: CampaignNodeType | null,
  targetType: CampaignNodeType | null
): string {
  if (!sourceType || !targetType) {
    return "unknown_relationship";
  }
  return `${sourceType}_to_${targetType}`;
}

function buildChecklist(hasValidationIssues: boolean, hasDisconnectedNodes: boolean): string[] {
  const checklist = [
    "Confirm campaign objective, ad-set optimization, and bid strategy align with goals.",
    "Review audience constraints for geography, age, and gender consistency.",
    "Verify ad formats are compatible with connected creative asset types.",
  ];

  if (hasValidationIssues) {
    checklist.unshift("Resolve error-level validation issues before backend handoff.");
  }
  if (hasDisconnectedNodes) {
    checklist.push("Review disconnected nodes and confirm whether they should remain in scope.");
  }

  return checklist;
}

export function buildCampaignCanvasPayload(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
  context: CampaignCanvasPayloadContext = {}
): CampaignCanvasPayload {
  const normalizedNodes = nodes.map(normalizeNode);
  const nodesById = new Map(normalizedNodes.map((node) => [node.nodeId, node]));

  const normalizedEdges = edges.map((edge, index) => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    return {
      edgeId: normalizeString(edge.id) ?? `edge-${index + 1}`,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourceType: sourceNode?.nodeType ?? null,
      targetType: targetNode?.nodeType ?? null,
      relationship: buildEdgeRelationship(sourceNode?.nodeType ?? null, targetNode?.nodeType ?? null),
      sourceHandle: normalizeString(edge.sourceHandle),
      targetHandle: normalizeString(edge.targetHandle),
    };
  });

  const byType = NODE_TYPES.reduce(
    (acc, type) => {
      acc[type] = normalizedNodes.filter((node) => node.nodeType === type).length;
      return acc;
    },
    {
      campaign: 0,
      "ad-set": 0,
      ad: 0,
      audience: 0,
      creative: 0,
    } as Record<CampaignNodeType, number>
  );

  const validationIssues: CampaignCanvasPayload["agentCheckIn"]["validationIssues"] = normalizedNodes
    .filter((node) => node.validation.status === "warning" || node.validation.status === "error")
    .map((node) => ({
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      label: node.label,
      severity: node.validation.status === "error" ? "error" : "warning",
      errors: node.validation.errors.length ? node.validation.errors : ["No details provided."],
    }));

  const nodesWithConnections = new Set<string>();
  for (const edge of normalizedEdges) {
    nodesWithConnections.add(edge.sourceNodeId);
    nodesWithConnections.add(edge.targetNodeId);
  }

  const disconnectedNodeIds = normalizedNodes
    .filter((node) => !nodesWithConnections.has(node.nodeId))
    .map((node) => node.nodeId);

  const payload: CampaignCanvasPayload = {
    schemaVersion: "campaign-canvas.v1",
    generatedAt: new Date().toISOString(),
    context: {
      source: context.source ?? "unknown",
      brandProfileId: normalizeString(context.brandProfileId),
      adAccountId: normalizeString(context.adAccountId),
      campaignId: normalizeString(context.campaignId),
    },
    summary: {
      nodeCount: normalizedNodes.length,
      edgeCount: normalizedEdges.length,
      byType: {
        campaign: byType.campaign,
        "ad-set": byType["ad-set"],
        ad: byType.ad,
        audience: byType.audience,
        creative: byType.creative,
      },
      validation: {
        errorCount: validationIssues.filter((issue) => issue.severity === "error").length,
        warningCount: validationIssues.filter((issue) => issue.severity === "warning").length,
      },
    },
    nodes: normalizedNodes,
    edges: normalizedEdges,
    agentCheckIn: {
      validationIssues,
      disconnectedNodeIds,
      checklist: buildChecklist(validationIssues.length > 0, disconnectedNodeIds.length > 0),
    },
  };

  return campaignCanvasPayloadSchema.parse(payload);
}
