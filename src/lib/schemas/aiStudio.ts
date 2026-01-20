import { z } from "zod";

export const aiStudioProviderSchema = z.enum([
  "nano-banana",
  "veo-3-1",
  "sora-2",
]);

export const aiStudioMediumSchema = z.enum(["image", "video"]);

export const aiStudioAspectRatioSchema = z
  .string()
  .regex(/^\d{1,2}:\d{1,2}$/, "Aspect ratio must be formatted as W:H");

// Supported aspect ratios per provider/medium. Keep in sync with upstream model docs.
export const providerAspectRatioOptions: Record<AiStudioProvider, Partial<Record<AiStudioMedium, readonly string[]>>> = {
  "nano-banana": {
    image: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const,
  },
  "veo-3-1": {
    video: ["16:9", "9:16"] as const,
  },
  "sora-2": {
    video: ["16:9", "9:16", "1:1"] as const,
  },
};

export const aiStudioJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const aiStudioTemplateSchema = z.object({
  id: z.string().min(1, "Template id is required"),
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  provider: aiStudioProviderSchema,
  medium: aiStudioMediumSchema,
  aspectRatio: aiStudioAspectRatioSchema.optional(),
  defaultPrompt: z.string().optional(),
  defaultNegativePrompt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const timestampSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Invalid ISO timestamp",
});

export const aiStudioArtifactSchema = z.object({
  id: z.string().min(1, "Artifact id is required"),
  uri: z.string().url(),
  previewUri: z.string().url().optional(),
  mimeType: z.string().optional(),
  medium: aiStudioMediumSchema,
  fileName: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: timestampSchema,
});

export const aiStudioJobFailureSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().min(1, "Failure message is required"),
    retryable: z.boolean().optional(),
    details: z.record(z.unknown()).optional(),
  })
  .optional();

export const aiStudioJobSchema = z.object({
  id: z.string().min(1, "Job id is required"),
  brandProfileId: z.string().min(1, "brandProfileId is required"),
  provider: aiStudioProviderSchema,
  medium: aiStudioMediumSchema,
  templateId: z.string().optional(),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  aspectRatio: aiStudioAspectRatioSchema.optional(),
  durationSeconds: z.number().int().positive().optional(),
  status: aiStudioJobStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema.optional(),
  artifacts: z.array(aiStudioArtifactSchema).default([]),
  failure: aiStudioJobFailureSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const aiStudioJobsResponseSchema = z.object({
  jobs: z.array(aiStudioJobSchema),
});

export const aiStudioTemplatesResponseSchema = z.object({
  templates: z.array(aiStudioTemplateSchema),
});

export const aiStudioGenerationRequestSchema = z.object({
  brandProfileId: z.string().min(1, "brandProfileId is required"),
  provider: aiStudioProviderSchema,
  medium: aiStudioMediumSchema,
  prompt: z.string().min(1, "Prompt is required"),
  negativePrompt: z.string().optional(),
  templateId: z.string().optional(),
  aspectRatio: aiStudioAspectRatioSchema.optional(),
  durationSeconds: z.number().int().positive().max(120).optional(),
  guidanceScale: z.number().min(0).max(20).optional(),
  seed: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (!value.aspectRatio) return;
  const providerOptions = providerAspectRatioOptions[value.provider]?.[value.medium];
  if (!providerOptions) return;
  if (!providerOptions.includes(value.aspectRatio)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["aspectRatio"],
      message: `Aspect ratio ${value.aspectRatio} is not supported for ${value.provider} ${value.medium}. Supported: ${providerOptions.join(", ")}`,
    });
  }
});

export const aiStudioGenerationResponseSchema = z.object({
  job: aiStudioJobSchema,
});

const workflowBaseSchema = z.object({
  id: z.string().min(1, "Workflow id is required"),
  brandProfileId: z.string().min(1, "brandProfileId is required"),
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().optional(),
  nodes: z.array(z.record(z.unknown())).optional().default([]),
  edges: z.array(z.record(z.unknown())).optional().default([]),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime({ message: "Workflow createdAt must be an ISO timestamp" }),
  updatedAt: z.string().datetime({ message: "Workflow updatedAt must be an ISO timestamp" }).optional(),
});

export const aiStudioWorkflowSchema = workflowBaseSchema;

export const aiStudioWorkflowRowSchema = z.object({
  id: z.string().min(1, "Workflow id is required"),
  brand_profile_id: z.string().min(1, "brand_profile_id is required"),
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().nullish(),
  nodes: z.array(z.unknown()).nullish(),
  edges: z.array(z.unknown()).nullish(),
  metadata: z.record(z.unknown()).nullish(),
  created_at: timestampSchema,
  updated_at: timestampSchema.nullish(),
});

export const aiStudioWorkflowsResponseSchema = z.object({
  workflows: z.array(aiStudioWorkflowSchema),
});

export type AiStudioWorkflowRow = z.infer<typeof aiStudioWorkflowRowSchema>;
export type AiStudioWorkflow = z.infer<typeof aiStudioWorkflowSchema>;
export type AiStudioWorkflowsResponse = z.infer<typeof aiStudioWorkflowsResponseSchema>;

export type AiStudioProvider = z.infer<typeof aiStudioProviderSchema>;
export type AiStudioMedium = z.infer<typeof aiStudioMediumSchema>;
export type AiStudioAspectRatio = z.infer<typeof aiStudioAspectRatioSchema>;
export type AiStudioJobStatus = z.infer<typeof aiStudioJobStatusSchema>;
export type AiStudioTemplate = z.infer<typeof aiStudioTemplateSchema>;
export type AiStudioArtifact = z.infer<typeof aiStudioArtifactSchema>;
export type AiStudioJob = z.infer<typeof aiStudioJobSchema>;
export type AiStudioGenerationRequest = z.infer<typeof aiStudioGenerationRequestSchema>;
export type AiStudioGenerationResponse = z.infer<typeof aiStudioGenerationResponseSchema>;
export type AiStudioJobsResponse = z.infer<typeof aiStudioJobsResponseSchema>;
export type AiStudioTemplatesResponse = z.infer<typeof aiStudioTemplatesResponseSchema>;

export function mapAiStudioWorkflowRow(row: AiStudioWorkflowRow): AiStudioWorkflow {
  const mapped = {
    id: row.id,
    brandProfileId: row.brand_profile_id,
    name: row.name,
    description: row.description ?? undefined,
    nodes: row.nodes ?? [],
    edges: row.edges ?? [],
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };

  return aiStudioWorkflowSchema.parse(mapped);
}
