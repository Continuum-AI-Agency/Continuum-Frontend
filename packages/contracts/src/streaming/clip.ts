import { z } from "zod";
import { clipPlanSchema } from "../media/clip";

/**
 * NDJSON progress frames for `POST /api/clips/generate`. The backend job
 * transcribes + sections + assembles the cut plan, emits `clip_plan_ready`, then
 * the browser cuts/stitches each section and reports `section_*` outcomes.
 */
export const clipGenerationStageEnum = z.enum([
  "queued",
  "transcribing",
  "sectioning",
  "planning",
  "cutting",
  "persisting",
]);

export const clipGenerationFrameSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("job_started"),
      jobId: z.string().min(1),
      sourceAssetId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("stage"),
      stage: clipGenerationStageEnum,
      message: z.string().nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("clip_plan_ready"),
      plan: clipPlanSchema,
      sourceSignedUrl: z.string().min(1),
    })
    .strict(),
  z.object({ type: z.literal("section_started"), index: z.number().int().min(0) }).strict(),
  z
    .object({
      type: z.literal("section_ready"),
      index: z.number().int().min(0),
      assetId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("section_failed"),
      index: z.number().int().min(0),
      error: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("job_completed"),
      ready: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ type: z.literal("job_failed"), error: z.string() }).strict(),
]);

export type ClipGenerationStage = z.infer<typeof clipGenerationStageEnum>;
export type ClipGenerationFrame = z.infer<typeof clipGenerationFrameSchema>;
