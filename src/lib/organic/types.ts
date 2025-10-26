import { z } from "zod";

import { ORGANIC_PLATFORM_KEYS, type OrganicPlatformKey } from "./platforms";
import { promptFormValueSchema } from "./prompts";

const primitiveText = z.union([z.string(), z.number(), z.boolean()]);

const textFieldSchema = primitiveText
  .or(z.null())
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  });

const optionalNumberSchema = z
  .union([z.number(), z.string()])
  .optional()
  .refine((value) => {
    if (value === undefined) return true;
    if (typeof value === "number") return Number.isFinite(value);
    return value.trim().length > 0 && Number.isFinite(Number(value));
  }, { message: "Expected numeric value" })
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

export const contentGridRowSchema = z
  .object({
    day: textFieldSchema,
    type: textFieldSchema,
    format: textFieldSchema,
    tone: textFieldSchema,
    title_topic: textFieldSchema,
    objective: textFieldSchema,
    target: textFieldSchema,
    cta: textFieldSchema,
    num_slides: optionalNumberSchema,
  })
  .transform((row) => ({
    day: row.day,
    type: row.type,
    format: row.format,
    tone: row.tone,
    title_topic: row.title_topic,
    objective: row.objective,
    target: row.target,
    cta: row.cta,
    num_slides: row.num_slides,
  }));

export type ContentGridRow = z.infer<typeof contentGridRowSchema>;

export const weeklyGridSchema = z.object({
  grid: z.array(contentGridRowSchema),
});

export type WeeklyGrid = z.infer<typeof weeklyGridSchema>;

const narrativeScriptSchema = z.object({
  hook: textFieldSchema,
  interrupt: textFieldSchema,
  context: textFieldSchema,
  open_loop: textFieldSchema,
  explanation: textFieldSchema,
  value: textFieldSchema,
  cta: textFieldSchema,
  slide_by_slide_breakdown: z.array(textFieldSchema).optional().nullable().default(null),
});

export type NarrativeScript = z.infer<typeof narrativeScriptSchema>;

const hashtagsSchema = z
  .object({
    high_competition: z.array(textFieldSchema).optional(),
    medium_competition: z.array(textFieldSchema).optional(),
    low_competition: z.array(textFieldSchema).optional(),
  })
  .transform((hashtags) => ({
    high_competition: (hashtags.high_competition ?? []).map((item) => item),
    medium_competition: (hashtags.medium_competition ?? []).map((item) => item),
    low_competition: (hashtags.low_competition ?? []).map((item) => item),
  }));

const technicalScriptSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .default({});

export const detailedPostTemplateSchema = z.object({
  day_platform: textFieldSchema,
  type: textFieldSchema,
  format: textFieldSchema,
  title_topic: textFieldSchema,
  objective: textFieldSchema,
  target: textFieldSchema,
  creative_idea: textFieldSchema,
  narrative_script: narrativeScriptSchema,
  technical_script: technicalScriptSchema,
  caption_copy: textFieldSchema,
  hashtags: hashtagsSchema,
  media_url: textFieldSchema.optional().transform((value) => (value ? value : undefined)),
  media_urls: z.array(textFieldSchema).optional().transform((arr) => (arr ? arr.filter((item) => item.length > 0) : undefined)),
  num_slides: optionalNumberSchema,
});

export type DetailedPostTemplate = z.infer<typeof detailedPostTemplateSchema>;

export const generationRequestSchema = z.object({
  platformAccountIds: z
    .record(z.enum(ORGANIC_PLATFORM_KEYS), z.string().min(1, "Account id is required"))
    .refine(
      (records) => Object.keys(records).length > 0,
      "Select at least one platform"
    ),
  language: z.string().min(1, "Language is required"),
  userPrompt: z.string().min(1, "A user prompt is required"),
  generationPrompt: z.string().optional(),
  selectedTrendIds: z.array(z.string()).max(5).default([]),
  prompt: promptFormValueSchema,
});

export type GenerationRequestPayload = z.infer<typeof generationRequestSchema>;
export type PromptPayload = z.infer<typeof promptFormValueSchema>;

export const dailyDetailsRequestSchema = z.object({
  platformAccountIds: z
    .record(z.enum(ORGANIC_PLATFORM_KEYS), z.string().min(1))
    .refine(
      (records) => Object.keys(records).length > 0,
      "Select at least one platform"
    ),
  weeklyGrid: weeklyGridSchema,
  language: z.string().min(1),
});

export type DailyDetailsRequestPayload = z.infer<typeof dailyDetailsRequestSchema>;

export const gridJobResponseSchema = z.object({
  job_id: z.string(),
  channel: z.string(),
  status: z.string(),
});

export type GridJobResponse = z.infer<typeof gridJobResponseSchema>;

export type PlatformAccountMap = Record<OrganicPlatformKey, string>;
