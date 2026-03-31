import { z } from "zod";

const STORAGE_PREFIX = "continuum:organic-planner:ai-studio-context";

export const AI_STUDIO_CONTEXT_STORAGE_PREFIX = STORAGE_PREFIX;
export const AI_STUDIO_LAST_DRAFT_STORAGE_KEY = `${STORAGE_PREFIX}:last-draft-id`;
export const AI_STUDIO_PENDING_APPLY_PREFIX = `${STORAGE_PREFIX}:pending-apply`;
export const AI_STUDIO_SESSION_HISTORY_PREFIX = `${STORAGE_PREFIX}:session-history`;

export type OrganicPostType = "post" | "reel" | "carousel";
export type OrganicPlatformForStudio = "instagram" | "linkedin";
export type OrganicWorkflowConcept =
  | "ig_post_single_image"
  | "ig_reel_single_video"
  | "ig_carousel_multi_image"
  | "li_post_single_image";

const workflowConceptSchema = z.enum([
  "ig_post_single_image",
  "ig_reel_single_video",
  "ig_carousel_multi_image",
  "li_post_single_image",
]);

export const plannerHandoffMediaSuggestionSchema = z
  .object({
    assetUrl: z.string().optional(),
    assetBase64: z.string().optional(),
    generationContext: z.unknown().optional(),
  })
  .optional();

export const plannerHandoffAssetHintSchema = z.object({
  role: z.string().min(1),
  suggestion: z.string().min(1),
});

export const plannerAiStudioHandoffSchema = z.object({
  schemaVersion: z.literal("planner_ai_handoff_v1"),
  draftId: z.string().min(1),
  brandProfileId: z.string().min(1),
  weekStartId: z.string().min(1),
  platform: z.enum(["instagram", "linkedin"]),
  postType: z.enum(["post", "reel", "carousel"]),
  workflowConcept: workflowConceptSchema.optional(),
  format: z.string().min(1),
  authoritativeCount: z.number().int().positive().optional(),
  title: z.string().default(""),
  summary: z.string().default(""),
  captionPreview: z.string().default(""),
  creativeDirectionPrompt: z.string().optional(),
  thumbnailPrompt: z.string().optional(),
  seedTrendId: z.string().optional(),
  mediaSuggestion: plannerHandoffMediaSuggestionSchema,
  assetHints: z.array(plannerHandoffAssetHintSchema).optional(),
  updatedAt: z.string().min(1),
});

export type PlannerAiStudioHandoff = z.infer<typeof plannerAiStudioHandoffSchema>;

const applyAssetInputSchema = z.object({
  role: z.string().min(1),
  kind: z.enum(["image", "video"]),
  slideIndex: z.number().int().nonnegative().optional(),
  sourceUrl: z.string().url().optional(),
  sourceDataUrl: z.string().optional(),
  sourceBase64: z.string().optional(),
  mimeType: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  generationContext: z.unknown().optional(),
});

const applyContentPatchSchema = z
  .object({
    title: z.string().optional(),
    summary: z.string().optional(),
    captionPreview: z.string().optional(),
    creativeDirectionPrompt: z.string().optional(),
    thumbnailPrompt: z.string().optional(),
    creativeIdea: z.string().optional(),
  })
  .strict();

export const plannerAiStudioApplyRequestSchema = z.object({
  schemaVersion: z.literal("planner_ai_apply_v1"),
  draftId: z.string().min(1),
  brandProfileId: z.string().min(1),
  postType: z.enum(["post", "reel", "carousel"]),
  platform: z.enum(["instagram", "linkedin"]),
  overwrite: z.literal(true),
  contentPatch: applyContentPatchSchema,
  assets: z.array(applyAssetInputSchema).min(1),
  selection: z
    .object({
      required: z.boolean().default(false),
      selectedAssetRole: z.string().optional(),
    })
    .optional(),
});

export type PlannerAiStudioApplyRequest = z.infer<typeof plannerAiStudioApplyRequestSchema>;

const persistedAssetSchema = z.object({
  role: z.string().min(1),
  kind: z.enum(["image", "video"]),
  slideIndex: z.number().int().nonnegative().optional(),
  storagePath: z.string().min(1),
  storageUrl: z.string().min(1),
  mimeType: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  generationContext: z.unknown().optional(),
});

export const plannerAiStudioApplyResponseSchema = z.object({
  schemaVersion: z.literal("planner_ai_apply_v1"),
  draftId: z.string().min(1),
  brandProfileId: z.string().min(1),
  postType: z.enum(["post", "reel", "carousel"]),
  platform: z.enum(["instagram", "linkedin"]),
  overwrite: z.literal(true),
  contentPatch: applyContentPatchSchema,
  assets: z.array(persistedAssetSchema).min(1),
  appliedAt: z.string().min(1),
});

export type PlannerAiStudioApplyResponse = z.infer<typeof plannerAiStudioApplyResponseSchema>;

export type PlannerAiStudioRevision = {
  revisionId: string;
  draftId: string;
  createdAt: string;
  before: PlannerAiStudioHandoff;
  applied: PlannerAiStudioApplyResponse;
};

function dedupeHandoffCandidates(
  candidates: PlannerAiStudioHandoff[]
): PlannerAiStudioHandoff[] {
  const seen = new Set<string>();
  const deduped: PlannerAiStudioHandoff[] = [];

  candidates.forEach((candidate) => {
    const signature = JSON.stringify(candidate);
    if (seen.has(signature)) return;
    seen.add(signature);
    deduped.push(candidate);
  });

  return deduped;
}

export function buildAiStudioHandoffStorageCandidates(
  handoff: PlannerAiStudioHandoff
): PlannerAiStudioHandoff[] {
  const candidates: PlannerAiStudioHandoff[] = [handoff];
  const mediaSuggestion = handoff.mediaSuggestion;

  if (mediaSuggestion?.assetBase64) {
    const mediaWithoutBase64 = { ...mediaSuggestion };
    delete mediaWithoutBase64.assetBase64;
    candidates.push({
      ...handoff,
      mediaSuggestion: mediaWithoutBase64,
    });
  }

  if (mediaSuggestion && typeof mediaSuggestion.generationContext !== "undefined") {
    const mediaWithoutContext = { ...mediaSuggestion };
    delete mediaWithoutContext.generationContext;
    candidates.push({
      ...handoff,
      mediaSuggestion: mediaWithoutContext,
    });
  }

  if (mediaSuggestion) {
    candidates.push({
      ...handoff,
      mediaSuggestion: undefined,
    });
  }

  if (handoff.assetHints?.length) {
    candidates.push({
      ...handoff,
      mediaSuggestion: undefined,
      assetHints: undefined,
    });
  }

  return dedupeHandoffCandidates(candidates);
}

export function buildAiStudioStorageKey(draftId: string): string {
  return `${STORAGE_PREFIX}:${draftId}`;
}

export function buildPendingApplyStorageKey(draftId: string): string {
  return `${AI_STUDIO_PENDING_APPLY_PREFIX}:${draftId}`;
}

export function buildSessionHistoryStorageKey(draftId: string): string {
  return `${AI_STUDIO_SESSION_HISTORY_PREFIX}:${draftId}`;
}

export function normalizeDraftPostType(format?: string): OrganicPostType {
  const normalized = (format ?? "").toLowerCase();
  if (normalized.includes("reel") || normalized.includes("video")) return "reel";
  if (normalized.includes("carousel")) return "carousel";
  return "post";
}

export type WorkflowConceptSpec = {
  concept: OrganicWorkflowConcept;
  outputKind: "image" | "video";
  outputMode: "single" | "ordered";
  maxReferenceImages: number;
  requiresExplicitPickOnMultiOutput: boolean;
  defaultModel: "nano-banana-2" | "veo-3.1-fast";
};

export const WORKFLOW_CONCEPT_SPECS: Record<OrganicWorkflowConcept, WorkflowConceptSpec> = {
  ig_post_single_image: {
    concept: "ig_post_single_image",
    outputKind: "image",
    outputMode: "single",
    maxReferenceImages: 14,
    requiresExplicitPickOnMultiOutput: false,
    defaultModel: "nano-banana-2",
  },
  ig_reel_single_video: {
    concept: "ig_reel_single_video",
    outputKind: "video",
    outputMode: "single",
    maxReferenceImages: 14,
    requiresExplicitPickOnMultiOutput: false,
    defaultModel: "veo-3.1-fast",
  },
  ig_carousel_multi_image: {
    concept: "ig_carousel_multi_image",
    outputKind: "image",
    outputMode: "ordered",
    maxReferenceImages: 14,
    requiresExplicitPickOnMultiOutput: false,
    defaultModel: "nano-banana-2",
  },
  li_post_single_image: {
    concept: "li_post_single_image",
    outputKind: "image",
    outputMode: "single",
    maxReferenceImages: 5,
    requiresExplicitPickOnMultiOutput: true,
    defaultModel: "nano-banana-2",
  },
};

export function resolveWorkflowConcept(input: {
  platform: OrganicPlatformForStudio;
  postType: OrganicPostType;
}): OrganicWorkflowConcept {
  if (input.platform === "linkedin") {
    return "li_post_single_image";
  }
  if (input.postType === "reel") {
    return "ig_reel_single_video";
  }
  if (input.postType === "carousel") {
    return "ig_carousel_multi_image";
  }
  return "ig_post_single_image";
}

export function resolveWorkflowConceptSpec(input: {
  platform: OrganicPlatformForStudio;
  postType: OrganicPostType;
  workflowConcept?: OrganicWorkflowConcept;
}): WorkflowConceptSpec {
  const concept = input.workflowConcept ?? resolveWorkflowConcept(input);
  return WORKFLOW_CONCEPT_SPECS[concept];
}
