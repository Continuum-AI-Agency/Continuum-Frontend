import { z } from "zod";

import { ORGANIC_PLATFORM_KEYS } from "./platforms";

const platformKeySchema = z.enum(ORGANIC_PLATFORM_KEYS);

const calendarPlacementSeedSchema = z.object({
  placementId: z.string().min(1),
  trendId: z.string().min(1),
  dayId: z.string().min(1),
  scheduledAt: z.string().min(1),
  timeLabel: z.string().min(1).optional(),
  platform: platformKeySchema,
  accountId: z.string().min(1).optional(),
  seedSource: z.enum(["trend", "question", "event", "manual"]).optional(),
  desiredFormat: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CalendarPlacementSeed = z.infer<typeof calendarPlacementSeedSchema>;

const calendarGenerationOptionsSchema = z
  .object({
    schedulePreset: z.enum(["beta-launch"]).optional(),
    includeNewsletter: z.boolean().optional(),
    newsletterDayId: z.string().optional(),
    guidancePrompt: z.string().min(1).optional(),
    preferredPlatforms: z.array(platformKeySchema).optional(),
  })
  .optional();

export const calendarGenerationRequestSchema = z.object({
  brandProfileId: z.string().min(1),
  weekStart: z.string().min(1),
  timezone: z.string().min(1),
  placements: z.array(calendarPlacementSeedSchema).min(1),
  platformAccountIds: z.record(platformKeySchema, z.string().min(1)).optional(),
  options: calendarGenerationOptionsSchema,
});

export type CalendarGenerationRequest = z.infer<typeof calendarGenerationRequestSchema>;

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
    assetHints: z.array(z.string()).optional(),
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
  total: z.number().positive(),
  message: z.string().optional(),
});

const placementEventSchema = z.object({
  type: z.literal("placement"),
  placement: calendarPlacementSchema,
});

const errorEventSchema = z.object({
  type: z.literal("error"),
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
