import { z } from 'zod';

import { ORGANIC_PLATFORM_KEYS } from './platforms';

const platformKeySchema = z.enum(ORGANIC_PLATFORM_KEYS);

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
    source: z.enum(['trend', 'question', 'event', 'manual']).optional().nullable(),
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

const mediaSuggestionGenerationContextSchema = z
  .object({
    sourceAgent: z.string().nullish(),
    finalPrompt: z.string().nullish(),
    request: z
      .object({
        provider: z.string().nullish(),
        model: z.string().nullish(),
        imageSize: z.string().nullish(),
      })
      .nullish(),
    placement: z
      .object({
        placementId: z.string().nullish(),
        dayId: z.string().nullish(),
        scheduledAt: z.string().nullish(),
      })
      .nullish(),
    strategist: z
      .object({
        objective: z.string().nullish(),
        funnel: z.string().nullish(),
        funnelStage: z.string().nullish(),
        targetAudience: z.string().nullish(),
        tone: z.string().nullish(),
        angle: z.string().nullish(),
        postType: z.string().nullish(),
        postSize: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    creativeDirection: z
      .object({
        title: z.string().nullish(),
        conceptTitle: z.string().nullish(),
        direction: z.string().nullish(),
        creativeDirection: z.string().nullish(),
        hook: z.string().nullish(),
        storyHook: z.string().nullish(),
        trendIntegration: z.string().nullish(),
        modes: z.array(z.string()).nullish(),
        visualMode: z.string().nullish(),
        audioMode: z.string().nullish(),
        notes: z.string().nullish(),
        productionNotes: z.array(z.string()).nullish(),
      })
      .passthrough()
      .nullish(),
    trend: z
      .object({
        trendId: z.string().nullish(),
        seedSource: z.enum(['trend', 'question', 'event', 'manual']).nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()
  .nullish();

const mediaSuggestionAssetSchema = z
  .object({
    role: z.string().nullish(),
    order: z.number().nullish(),
    provider: z.string().nullish(),
    model: z.string().nullish(),
    prompt: z.string().nullish(),
    width: z.number().nullish(),
    height: z.number().nullish(),
    assetBase64: z.string().nullish(),
    mimeType: z.string().nullish(),
    error: z.string().nullish(),
    generationContext: mediaSuggestionGenerationContextSchema.nullish(),
  })
  .passthrough();

const placementCreativeSchema = z
  .object({
    creativeIdea: z.string().optional().nullable(),
    assetIds: z.array(z.string()).optional(),
    mediaSuggestion: z
      .object({
        provider: z.string().nullish(),
        model: z.string().nullish(),
        kind: z.string().nullish(),
        prompt: z.string().nullish(),
        width: z.number().nullish(),
        height: z.number().nullish(),
        assetUrl: z.string().nullish(),
        alt: z.string().nullish(),
        assetBase64: z.string().nullish(),
        assets: z.array(mediaSuggestionAssetSchema).nullish(),
        // Persisted 512px Stage-2 storyboard preview frames (durable
        // bucket+storagePath; storageUrl re-minted on load). Mirrors the
        // @continuum/contracts organicStoryboardPreviewSchema shape.
        storyboard: z
          .array(
            z
              .object({
                role: z.string().nullish(),
                bucket: z.string().nullish(),
                storagePath: z.string().nullish(),
                storageUrl: z.string().nullish(),
                format: z.string().nullish(),
              })
              .passthrough(),
          )
          .nullish(),
        generationContext: mediaSuggestionGenerationContextSchema.nullish(),
      })
      .nullish(),
    assetHints: z
      .array(
        z.object({
          role: z.string(),
          suggestion: z.string(),
        }),
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

const placementPublishingAssetSchema = z
  .object({
    role: z.string(),
    kind: z.enum(['image', 'video']),
    slideIndex: z.number().nullish(),
    assetId: z.string().nullish(),
    bucket: z.string().nullish(),
    storagePath: z.string(),
    storageUrl: z.string(),
    mimeType: z.string().nullish(),
    width: z.number().nullish(),
    height: z.number().nullish(),
  })
  .passthrough();

export const calendarPlacementSchema = z.object({
  placementId: z.string().min(1),
  schedule: placementScheduleSchema,
  platform: placementPlatformSchema,
  seed: placementSeedSchema,
  content: placementContentSchema.optional().default({}),
  creative: placementCreativeSchema,
  copy: placementCopySchema,
  publishingAssets: z.array(placementPublishingAssetSchema).nullish(),
});

export type CalendarPlacement = z.infer<typeof calendarPlacementSchema>;

const progressEventSchema = z.object({
  type: z.literal('progress'),
  completed: z.number().nonnegative(),
  total: z.number().nonnegative(),
  stage: z.enum(['analyzing', 'optimizing', 'drafting', 'matching', 'finalizing']).optional(),
  message: z.string().optional(),
});

const placementEventSchema = z.object({
  type: z.literal('placement'),
  placement: calendarPlacementSchema,
});

const slotStartedEventSchema = z.object({
  type: z.literal('slot_started'),
  placementId: z.string().min(1),
  message: z.string().optional(),
});

const slotHeartbeatEventSchema = z.object({
  type: z.literal('slot_heartbeat'),
  placementId: z.string().min(1),
  stage: z.string().optional(),
  progress: z.number().min(0).max(1),
  elapsedMs: z.number().nonnegative().optional(),
});

const slotStageEventSchema = z.object({
  type: z.literal('slot_stage'),
  placementId: z.string().min(1),
  stage: z.string().min(1),
});

const slotCompletedEventSchema = z.object({
  type: z.literal('slot_completed'),
  placement: calendarPlacementSchema,
  persistedDraftId: z.string().uuid().optional(),
});

const slotFailedEventSchema = z.object({
  type: z.literal('slot_failed'),
  placementId: z.string().min(1),
  code: z.string().optional(),
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  attempts: z.number().int().nonnegative().optional(),
});

const errorEventSchema = z.object({
  type: z.literal('error'),
  code: z.string().optional(),
  message: z.string().min(1),
  placementId: z.string().optional(),
});

const completeEventSchema = z.object({
  type: z.literal('complete'),
  summary: z
    .object({
      total: z.number().int().nonnegative(),
      succeeded: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    })
    .optional(),
});

export const calendarGenerationEventSchema = z.discriminatedUnion('type', [
  progressEventSchema,
  slotStartedEventSchema,
  slotHeartbeatEventSchema,
  slotStageEventSchema,
  slotCompletedEventSchema,
  slotFailedEventSchema,
  placementEventSchema,
  errorEventSchema,
  completeEventSchema,
]);

export type CalendarGenerationEvent = z.infer<typeof calendarGenerationEventSchema>;
