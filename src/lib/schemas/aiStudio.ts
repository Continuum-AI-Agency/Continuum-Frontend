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

export const aiStudioArtifactSchema = z.object({
  id: z.string().min(1, "Artifact id is required"),
  uri: z.string().url(),
  previewUri: z.string().url().optional(),
  mimeType: z.string().optional(),
  medium: aiStudioMediumSchema,
  fileName: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime({ message: "Artifact createdAt must be an ISO timestamp" }),
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
  createdAt: z.string().datetime({ message: "Job createdAt must be an ISO timestamp" }),
  updatedAt: z.string().datetime({ message: "Job updatedAt must be an ISO timestamp" }).optional(),
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
});

export const aiStudioGenerationResponseSchema = z.object({
  job: aiStudioJobSchema,
});

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


