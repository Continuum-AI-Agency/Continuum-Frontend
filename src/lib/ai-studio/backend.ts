import { z } from "zod";

import {
  aiStudioJobSchema,
  aiStudioMediumSchema,
  aiStudioProviderSchema,
  aiStudioTemplateSchema,
  aiStudioTemplatesResponseSchema,
  aiStudioGenerationResponseSchema,
  aiStudioJobStatusSchema,
  type AiStudioJob,
  type AiStudioTemplate,
  type AiStudioGenerationResponse,
  type AiStudioJobsResponse,
  type AiStudioTemplatesResponse,
} from "@/lib/schemas/aiStudio";

const backendArtifactSchema = z.object({
  id: z.string(),
  uri: z.string().url(),
  preview_uri: z.string().url().nullish(),
  mime_type: z.string().nullish(),
  medium: aiStudioMediumSchema,
  file_name: z.string().nullish(),
  size_bytes: z.number().int().nonnegative().nullish(),
  metadata: z.record(z.unknown()).nullish(),
  created_at: z.string().datetime({ message: "Artifact created_at must be ISO formatted" }),
});

const backendJobSchema = z.object({
  id: z.string(),
  brand_profile_id: z.string(),
  provider: aiStudioProviderSchema,
  medium: aiStudioMediumSchema,
  template_id: z.string().nullish(),
  prompt: z.string(),
  negative_prompt: z.string().nullish(),
  aspect_ratio: z.string().nullish(),
  duration_seconds: z.number().int().positive().nullish(),
  status: aiStudioJobStatusSchema,
  created_at: z.string().datetime({ message: "Job created_at must be ISO formatted" }),
  updated_at: z.string().datetime({ message: "Job updated_at must be ISO formatted" }).nullish(),
  artifacts: z.array(backendArtifactSchema).default([]),
  failure: z
    .object({
      code: z.string().nullish(),
      message: z.string(),
      retryable: z.boolean().nullish(),
      details: z.record(z.unknown()).nullish(),
    })
    .nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

const backendJobsResponseSchema = z.object({
  jobs: z.array(backendJobSchema),
});

const backendTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  provider: aiStudioProviderSchema,
  medium: aiStudioMediumSchema,
  aspect_ratio: z.string().nullish(),
  default_prompt: z.string().nullish(),
  default_negative_prompt: z.string().nullish(),
  metadata: z.record(z.unknown()).nullish(),
  tags: z.array(z.string().nullish()).nullish(),
});

const backendTemplatesResponseSchema = z.object({
  templates: z.array(backendTemplateSchema),
});

const backendGenerationResponseSchema = z.object({
  job: backendJobSchema,
});

function mapArtifact(artifact: z.infer<typeof backendArtifactSchema>) {
  return {
    id: artifact.id,
    uri: artifact.uri,
    previewUri: artifact.preview_uri ?? undefined,
    mimeType: artifact.mime_type ?? undefined,
    medium: artifact.medium,
    fileName: artifact.file_name ?? undefined,
    sizeBytes: artifact.size_bytes ?? undefined,
    metadata: artifact.metadata ?? undefined,
    createdAt: artifact.created_at,
  };
}

function mapJob(job: z.infer<typeof backendJobSchema>): AiStudioJob {
  const mapped = {
    id: job.id,
    brandProfileId: job.brand_profile_id,
    provider: job.provider,
    medium: job.medium,
    templateId: job.template_id ?? undefined,
    prompt: job.prompt,
    negativePrompt: job.negative_prompt ?? undefined,
    aspectRatio: job.aspect_ratio ?? undefined,
    durationSeconds: job.duration_seconds ?? undefined,
    status: job.status,
    createdAt: job.created_at,
    updatedAt: job.updated_at ?? undefined,
    artifacts: job.artifacts.map(mapArtifact),
    failure: job.failure
      ? {
          code: job.failure.code ?? undefined,
          message: job.failure.message,
          retryable: job.failure.retryable ?? undefined,
          details: job.failure.details ?? undefined,
        }
      : undefined,
    metadata: job.metadata ?? undefined,
  };

  return aiStudioJobSchema.parse(mapped);
}

function mapTemplate(template: z.infer<typeof backendTemplateSchema>): AiStudioTemplate {
  const mapped = {
    id: template.id,
    name: template.name,
    description: template.description ?? undefined,
    provider: template.provider,
    medium: template.medium,
    aspectRatio: template.aspect_ratio ?? undefined,
    defaultPrompt: template.default_prompt ?? undefined,
    defaultNegativePrompt: template.default_negative_prompt ?? undefined,
    metadata: template.metadata ?? undefined,
    tags:
      template.tags?.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) ?? undefined,
  };

  return aiStudioTemplateSchema.parse(mapped);
}

export function mapBackendJob(payload: unknown): AiStudioJob {
  const parsed = backendJobSchema.parse(payload);
  return mapJob(parsed);
}

export function mapBackendJobsResponse(payload: unknown): AiStudioJobsResponse {
  const parsed = backendJobsResponseSchema.parse(payload);
  const jobs = parsed.jobs.map(mapJob);
  return { jobs };
}

export function mapBackendTemplatesResponse(payload: unknown): AiStudioTemplatesResponse {
  const parsed = backendTemplatesResponseSchema.parse(payload);
  const templates = parsed.templates.map(mapTemplate);
  return aiStudioTemplatesResponseSchema.parse({ templates });
}

export function mapBackendGenerationResponse(payload: unknown): AiStudioGenerationResponse {
  const parsed = backendGenerationResponseSchema.parse(payload);
  const job = mapJob(parsed.job);
  return aiStudioGenerationResponseSchema.parse({ job });
}

