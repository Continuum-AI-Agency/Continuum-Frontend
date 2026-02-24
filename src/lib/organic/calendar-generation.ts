import { z } from "zod";

import { ORGANIC_PLATFORM_KEYS } from "./platforms";

const platformKeySchema = z.enum(ORGANIC_PLATFORM_KEYS);
const seedSourceSchema = z.enum(["trend", "question", "event", "manual"]);
const dayIdRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeLabelRegex = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$/i;

const nonEmptyStringSchema = z.string().trim().min(1);
const platformAccountIdsShape = Object.fromEntries(
  ORGANIC_PLATFORM_KEYS.map((platform) => [platform, nonEmptyStringSchema.optional()])
) as Record<(typeof ORGANIC_PLATFORM_KEYS)[number], z.ZodOptional<typeof nonEmptyStringSchema>>;

function isValidDayId(value: string) {
  if (!dayIdRegex.test(value)) return false;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function isValidIsoDateTime(value: string) {
  if (!value.includes("T")) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function isValidTimeZone(value: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const dayIdSchema = nonEmptyStringSchema.refine(isValidDayId, {
  message: "Expected day id in YYYY-MM-DD format",
});

const scheduledAtSchema = nonEmptyStringSchema.refine(isValidIsoDateTime, {
  message: "Expected an ISO datetime value for scheduledAt",
});

const timeLabelSchema = nonEmptyStringSchema.regex(timeLabelRegex, {
  message: "Expected time label like 9:00 AM",
});

const timezoneSchema = nonEmptyStringSchema.refine(isValidTimeZone, {
  message: "Expected a valid IANA timezone",
});
const platformAccountIdsSchema = z.object(platformAccountIdsShape).strict();

export const calendarPlacementScheduleRequestSchema = z
  .object({
    dayId: dayIdSchema,
    scheduledAt: scheduledAtSchema,
    timeLabel: timeLabelSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const scheduledDay = value.scheduledAt.slice(0, 10);
    if (scheduledDay !== value.dayId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: "scheduledAt must be on the same day as dayId",
      });
    }
  });

export const calendarPlacementPlatformRequestSchema = z
  .object({
    name: platformKeySchema,
    accountId: nonEmptyStringSchema.optional(),
  })
  .strict();

export const calendarPlacementSeedRequestSchema = z
  .object({
    source: seedSourceSchema,
    trendId: nonEmptyStringSchema.optional(),
    questionId: nonEmptyStringSchema.optional(),
    eventId: nonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === "trend" && !value.trendId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trendId"],
        message: "trendId is required when source is trend",
      });
    }
    if (value.source === "question" && !value.questionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionId"],
        message: "questionId is required when source is question",
      });
    }
    if (value.source === "event" && !value.eventId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventId"],
        message: "eventId is required when source is event",
      });
    }
  });

export const calendarPlacementContentRequestSchema = z
  .object({
    format: nonEmptyStringSchema.optional(),
    desiredFormat: nonEmptyStringSchema.optional(),
  })
  .strict()
  .optional();

export const calendarPlacementSeedSchema = z
  .object({
    placementId: nonEmptyStringSchema,
    schedule: calendarPlacementScheduleRequestSchema,
    platform: calendarPlacementPlatformRequestSchema,
    seed: calendarPlacementSeedRequestSchema,
    content: calendarPlacementContentRequestSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CalendarPlacementSeed = z.infer<typeof calendarPlacementSeedSchema>;

export const calendarGenerationOptionsSchema = z
  .object({
    schedulePreset: z.enum(["beta-launch"]).optional(),
    includeNewsletter: z.boolean().optional(),
    newsletterDayId: dayIdSchema.optional(),
    guidancePrompt: nonEmptyStringSchema.optional(),
    language: nonEmptyStringSchema.optional(),
    preferredPlatforms: z.array(platformKeySchema).optional(),
  })
  .strict()
  .optional();

export const calendarGenerationRequestSchema = z
  .object({
    brandProfileId: nonEmptyStringSchema,
    weekStart: dayIdSchema,
    timezone: timezoneSchema,
    placements: z.array(calendarPlacementSeedSchema).min(1),
    platformAccountIds: platformAccountIdsSchema.optional(),
    options: calendarGenerationOptionsSchema,
  })
  .strict();

export type CalendarGenerationRequest = z.infer<typeof calendarGenerationRequestSchema>;

export const backendCalendarPlacementSeedSchema = z
  .object({
    placementId: nonEmptyStringSchema,
    trendId: nonEmptyStringSchema.nullable(),
    dayId: dayIdSchema,
    scheduledAt: scheduledAtSchema,
    timeLabel: timeLabelSchema.nullish(),
    platform: platformKeySchema,
    accountId: nonEmptyStringSchema.nullish(),
    seedSource: seedSourceSchema,
    desiredFormat: nonEmptyStringSchema.nullish(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.seedSource === "trend" && !value.trendId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trendId"],
        message: "trendId is required when seedSource is trend",
      });
    }
  })
  .strict();

export const backendCalendarGenerationRequestSchema = z
  .object({
    brandProfileId: nonEmptyStringSchema,
    weekStart: dayIdSchema,
    timezone: timezoneSchema,
    placements: z.array(backendCalendarPlacementSeedSchema).min(1),
    platformAccountIds: platformAccountIdsSchema,
    options: calendarGenerationOptionsSchema.nullable(),
  })
  .strict();

export type BackendCalendarGenerationRequest = z.infer<typeof backendCalendarGenerationRequestSchema>;

function normalizeDesiredFormat(content?: z.infer<typeof calendarPlacementContentRequestSchema>) {
  const rawFormat = content?.desiredFormat ?? content?.format;
  if (!rawFormat) return null;
  let format = rawFormat.toLowerCase();
  if (format.includes("newsletter")) {
    format = "newsletter";
  }
  if (format === "static") {
    format = "post";
  }
  return format;
}

function cleanBackendOptions(
  options?: z.infer<typeof calendarGenerationOptionsSchema>
): z.infer<typeof calendarGenerationOptionsSchema> | null {
  if (!options) return null;
  const clean: Record<string, unknown> = {};
  if (options.schedulePreset) clean.schedulePreset = options.schedulePreset;
  if (typeof options.includeNewsletter === "boolean") {
    clean.includeNewsletter = options.includeNewsletter;
  }
  if (options.newsletterDayId) clean.newsletterDayId = options.newsletterDayId;
  if (options.guidancePrompt) clean.guidancePrompt = options.guidancePrompt;
  if (options.language) clean.language = options.language;
  if (options.preferredPlatforms && options.preferredPlatforms.length > 0) {
    clean.preferredPlatforms = options.preferredPlatforms;
  }
  return Object.keys(clean).length > 0
    ? (clean as z.infer<typeof calendarGenerationOptionsSchema>)
    : null;
}

export function toBackendCalendarGenerationRequest(
  request: CalendarGenerationRequest
): BackendCalendarGenerationRequest {
  const normalized = {
    brandProfileId: request.brandProfileId,
    weekStart: request.weekStart,
    timezone: request.timezone,
    platformAccountIds: request.platformAccountIds ?? {},
    placements: request.placements.map((placement) => ({
      placementId: placement.placementId,
      trendId: placement.seed.trendId ?? null,
      dayId: placement.schedule.dayId,
      scheduledAt: placement.schedule.scheduledAt,
      timeLabel: placement.schedule.timeLabel ?? null,
      platform: placement.platform.name,
      accountId: placement.platform.accountId ?? null,
      seedSource: placement.seed.source,
      desiredFormat: normalizeDesiredFormat(placement.content),
      metadata: placement.metadata ?? null,
    })),
    options: cleanBackendOptions(request.options),
  };
  return backendCalendarGenerationRequestSchema.parse(normalized);
}

const hashtagBucketsSchema = z
  .object({
    high: z.array(z.string()).optional(),
    medium: z.array(z.string()).optional(),
    low: z.array(z.string()).optional(),
  })
  .optional();

const placementScheduleSchema = z.object({
  dayId: z.string().min(1),
  scheduledAt: z.string().min(1),
  timeOfDay: z.string().optional().nullable(),
  adjusted: z.boolean().optional(),
});

const placementPlatformSchema = z.object({
  name: platformKeySchema,
  accountId: z.string().optional().nullable(),
});

const placementSeedSchema = z
  .object({
    trendId: z.string().optional().nullable(),
    source: z.enum(["trend", "question", "event", "manual"]).optional().nullable(),
  })
  .optional();

const placementContentSchema = z.object({
  type: z.string().optional().nullable(),
  format: z.string().optional().nullable(),
  titleTopic: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  target: z.string().optional().nullable(),
  tone: z.string().optional().nullable(),
  cta: z.string().optional().nullable(),
  numSlides: z.number().optional().nullable(),
});

const placementCreativeSchema = z
  .object({
    creativeIdea: z.string().optional().nullable(),
    assetIds: z.array(z.string()).optional(),
    assetHints: z
      .array(
        z.object({
          role: z.string(),
          suggestion: z.string(),
        })
      )
      .optional(),
  })
  .optional();

const placementCopySchema = z
  .object({
    caption: z.string().optional().nullable(),
    hashtags: hashtagBucketsSchema,
  })
  .optional();

export const calendarPlacementSchema = z.object({
  placementId: z.string().min(1),
  schedule: placementScheduleSchema,
  platform: placementPlatformSchema,
  seed: placementSeedSchema,
  content: placementContentSchema.optional().default({}),
  creative: placementCreativeSchema,
  copy: placementCopySchema,
});

export type CalendarPlacement = z.infer<typeof calendarPlacementSchema>;

const progressEventSchema = z.object({
  type: z.literal("progress"),
  completed: z.number().nonnegative(),
  total: z.number().nonnegative(),
  stage: z.enum(["analyzing", "optimizing", "drafting", "matching", "finalizing"]).optional(),
  message: z.string().optional(),
});

const placementEventSchema = z.object({
  type: z.literal("placement"),
  placement: calendarPlacementSchema,
});

const errorEventSchema = z.object({
  type: z.literal("error"),
  code: z.string().optional(),
  message: z.string().min(1),
  placementId: z.string().optional(),
});

const completeEventSchema = z.object({
  type: z.literal("complete"),
});

export const calendarGenerationEventSchema = z.discriminatedUnion("type", [
  progressEventSchema,
  placementEventSchema,
  errorEventSchema,
  completeEventSchema,
]);

export type CalendarGenerationEvent = z.infer<typeof calendarGenerationEventSchema>;
