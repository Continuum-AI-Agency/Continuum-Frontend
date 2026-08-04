import { z } from 'zod';
import { imageSizeSchema } from '../ai-studio/image-size';
import { artDirectionSchema } from '../creative/art-direction';
import { organicUgcSpecSchema } from '../media/reel-video';

export const organicPipelinePlatformSchema = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'youtube',
]);

export const organicPipelineSeedSourceSchema = z.enum(['trend', 'question', 'event', 'manual']);

export const organicMediaGenerationContextSchema = z
  .object({
    sourceAgent: z.literal('asset_producer'),
    finalPrompt: z.string().min(1),
    request: z
      .object({
        provider: z.string().min(1),
        model: z.string().min(1),
        imageSize: imageSizeSchema,
      })
      .strict(),
    placement: z
      .object({
        placementId: z.string().min(1),
        dayId: z.string().min(1),
        scheduledAt: z.string().min(1),
      })
      .strict(),
    strategist: z
      .object({
        objective: z.string().nullable(),
        funnelStage: z.string().nullable(),
        targetAudience: z.string().nullable(),
        tone: z.string().nullable(),
        angle: z.string().nullable(),
        postType: z.string().nullable(),
        postSize: z.string().nullable(),
      })
      .strict(),
    creativeDirection: z
      .object({
        conceptTitle: z.string().nullable(),
        creativeDirection: z.string().nullable(),
        storyHook: z.string().nullable(),
        trendIntegration: z.string().nullable(),
        visualMode: z.string().nullable(),
        audioMode: z.string().nullable(),
        productionNotes: z.array(z.string()),
      })
      .strict(),
    trend: z
      .object({
        trendId: z.string().nullable(),
        seedSource: organicPipelineSeedSourceSchema.nullable(),
      })
      .strict(),
  })
  .strict();

/** Style/tone/aspect for a HyperFrames composition (mirrors the backend HyperframeBrief enums). */
export const organicHyperframeStylePresetSchema = z.enum([
  'cinematic',
  'kinetic-type',
  'minimal',
  'brutalist',
  'editorial',
  'neon',
  'retro',
  'futuristic',
]);
export const organicHyperframeToneSchema = z.enum(['calm', 'balanced', 'high-energy']);
export const organicHyperframeAspectRatioSchema = z.enum(['16:9', '9:16', '1:1']);

/**
 * A durable pointer to a storyboard panel used as a video frame input. Bytes are
 * downloaded at realization time; nothing base64 is ever persisted here.
 */
export const organicSceneFrameRefSchema = z
  .object({
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    assetId: z.string().nullable().optional(),
  })
  .strict();

/** One scene of a multi-shot reel (mirrors backend ReelSceneAsset). */
export const organicReelSceneAssetSchema = z
  .object({
    index: z.number().int().min(0),
    role: z.enum(['hook', 'body', 'cta']),
    prompt: z.string(),
    captionText: z.string().nullable().optional(),
    durationSec: z.number(),
    bucket: z.string().nullable().optional(),
    clipUrl: z.string().nullable().optional(),
    signedClipUrl: z.string().nullable().optional(),
    assetId: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
    /**
     * The approved contact-sheet panel this scene animates FROM. Veo takes
     * reference images XOR frames, so once this is set it replaces the scene's
     * reference images entirely — the panel is what carries creator identity and
     * product fidelity into the clip.
     */
    firstFrame: organicSceneFrameRefSchema.nullable().optional(),
    /**
     * The panel this scene animates INTO — the next scene's panel, when the shot
     * match-cuts. Every panel exists before any clip renders, so this costs no
     * serialization. Never set without `firstFrame`; Veo rejects that.
     */
    lastFrame: organicSceneFrameRefSchema.nullable().optional(),
    /**
     * The decisions behind this scene, kept alongside the rendered `prompt`.
     *
     * It persists because the still and the clip are different machines: the panel
     * renders with a copy-safe zone and a single-frame rule, the Veo shot re-renders
     * from this same direction with a movement clause instead. Drop it here and the
     * clip silently reuses the still's string, which is the defect it exists to fix.
     */
    artDirection: artDirectionSchema.nullable().optional(),
  })
  .strict();

/** A stitched/storyboarded reel asset (mirrors backend ReelAsset). */
export const organicReelAssetSchema = z
  .object({
    generated: z.boolean(),
    url: z.string().nullable().optional(),
    bucket: z.string().nullable().optional(),
    signedUrl: z.string().nullable().optional(),
    // Poster frame for the video. A user-attached reel carries the library's derived
    // thumbnail; without a slot for it the poster is lost at the attach boundary and
    // the preview has nothing to paint until the first frame decodes.
    thumbnailUrl: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    durationSec: z.number(),
    scenes: z.array(organicReelSceneAssetSchema),
    ugc: organicUgcSpecSchema.optional(),
    error: z.string().nullable().optional(),
    qualityIssues: z.array(z.string()).optional(),
    qualityScore: z.number().optional(),
  })
  .strict();

/**
 * A HyperFrames (HTML video composition) asset. The composition HTML is the
 * source of truth (durable `bucket`+`htmlPath`, re-signed on read); `mp4*` is
 * the derived publishable video, persisted async by the FE render + edge fn.
 * `spec` stays `unknown` HERE to avoid coupling this pipeline-frame schema to the
 * CompositionSpec shape (the backend's parallel media schema keeps its own loose
 * spec; tightening only one side breaks structural assignability across the two
 * zod instances). The canonical `CompositionSpec` is exported from this package
 * (./hyperframes) for typed consumers (FE spec viewer, ai-studio endpoints).
 */
export const organicHyperframeAssetSchema = z
  .object({
    generated: z.boolean(),
    compositionId: z.string().nullable(),
    bucket: z.string().nullable().optional(),
    htmlPath: z.string().nullable().optional(),
    coverImageUrl: z.string().nullable().optional(),
    coverPath: z.string().nullable().optional(),
    coverBase64: z.string().nullable().optional(),
    mp4Bucket: z.string().nullable().optional(),
    mp4Path: z.string().nullable().optional(),
    mp4Url: z.string().nullable().optional(),
    mp4Status: z.enum(['pending', 'ready', 'failed']).nullable().optional(),
    error: z.string().nullable().optional(),
    spec: z.unknown().nullable().optional(),
    // Authored render size and length. Explicit because `spec` is null on
    // agent-written compositions, and the player used to derive both from it —
    // falling back to 16:9/15s, which letterboxes every vertical piece.
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationSeconds: z.number().positive().nullable().optional(),
    // Library assets embedded as hf-asset://<id>, re-signed by the browser at
    // render time rather than baked in as URLs that expire before the render.
    sourceAssets: z
      .array(
        z
          .object({
            assetId: z.string().min(1),
            kind: z.enum(['image', 'video', 'audio']),
          })
          .strict(),
      )
      .nullable()
      .optional(),
  })
  .strict();

/**
 * Realization tier of a draft's media in the checkpointed pipeline. The TEXT
 * checkpoint delivers a draft at `pending`; the user then either attaches their
 * own library creative (`user_supplied`) or triggers headless generation
 * (`generating` → `ready`). `skipped` = media intentionally left empty.
 */
export const organicDraftMediaStatusSchema = z.enum([
  'pending',
  'generating',
  'ready',
  'user_supplied',
  'skipped',
]);

/**
 * First-class ENRICHMENT stage of a calendar draft, tracked as its own indexed
 * column (`organic_calendar_drafts.media_stage`) so "how enriched is this draft"
 * is a cheap, queryable fact rather than a JSONB `content_json` scan. This axis
 * is ORTHOGONAL to the publish-lifecycle `status` column (draft → scheduled →
 * published): a `draft` can be at any media stage.
 *
 *   text_only        caption ready, no media yet (initial state)
 *   storyboard_ready 512px blueprint persisted, awaiting a realize choice
 *   realizing        final media generation in flight
 *   realized         final media present (generated OR user-supplied)
 *   failed           draft generation terminally failed
 */
export const organicMediaStageSchema = z.enum([
  'text_only',
  'storyboard_ready',
  'realizing',
  'realized',
  'failed',
]);

/**
 * Derive the media stage from the durable signals already in a placement /
 * `content_json`. This is the SINGLE source of truth for the `media_stage`
 * column: every persist re-derives and stamps it, so the column can never drift
 * from the JSON it summarizes. `failed` is intentionally NOT derivable here — it
 * is a terminal lifecycle signal stamped explicitly by the failure handlers, not
 * inferred from media content.
 */
export function deriveOrganicMediaStage(
  placement:
    | {
        publishingAssets?: unknown;
        creative?: {
          mediaSuggestion?: {
            mediaStatus?: string | null;
            storyboard?: unknown;
          } | null;
        } | null;
      }
    | null
    | undefined,
): z.infer<typeof organicMediaStageSchema> {
  const mediaSuggestion = placement?.creative?.mediaSuggestion ?? null;
  const mediaStatus = mediaSuggestion?.mediaStatus ?? null;
  const publishingAssets = placement?.publishingAssets;
  const hasPublishingAssets = Array.isArray(publishingAssets) && publishingAssets.length > 0;

  if (mediaStatus === 'user_supplied' || mediaStatus === 'ready' || hasPublishingAssets) {
    return 'realized';
  }
  if (mediaStatus === 'generating') {
    return 'realizing';
  }
  const storyboard = mediaSuggestion?.storyboard;
  if (Array.isArray(storyboard) && storyboard.length > 0) {
    return 'storyboard_ready';
  }
  return 'text_only';
}

/**
 * How strongly brand assets are imprinted on the GENERATED media for a concept.
 * Chosen contextually by the blueprint stage (visual_technical): brand-aligned
 * media should match the brand's vision/voice/aesthetic, NOT always stamp the
 * logo. `palette-only` (the default) grounds via palette + voice guidance with
 * no literal brand asset; `logo` seeds the brand mark; `reference-creative`
 * seeds prior on-brand creatives as references; `none` = no brand imprint.
 */
export const organicBrandTreatmentSchema = z.enum([
  'logo',
  'palette-only',
  'reference-creative',
  'none',
]);

/** A durable storage handle for a brand asset seeded into media generation. */
export const organicBrandReferenceSchema = z
  .object({
    kind: z.enum(['logo', 'creative']),
    assetId: z.string().optional(),
    bucket: z.string().optional(),
    storagePath: z.string().min(1),
  })
  .strict();

/**
 * Contextual brand grounding the blueprint stage records for media generation.
 * `treatment` drives whether `references` (logo / prior on-brand creative) are
 * seeded into the model; `palette` is carried forward as soft guidance — NOT a
 * hard color snap, so organic creative stays free to be innovative/non-slop.
 * The authoritative grounding text (voice, vision, brand-guideline rules) is
 * baked into the generation prompt at gen time, not stored here.
 */
export const organicMediaBrandGroundingSchema = z
  .object({
    treatment: organicBrandTreatmentSchema,
    references: z.array(organicBrandReferenceSchema).optional(),
    palette: z.array(z.string()).optional(),
    rationale: z.string().nullable().optional(),
  })
  .strict();

/** Audio direction produced by the background blueprint phase (audio_technical). */
export const organicMediaAudioConceptSchema = z
  .object({
    audioMode: z.string().nullable().optional(),
    trackSuggestion: z.string().nullable().optional(),
    soundDesign: z.string().nullable().optional(),
    voiceover: z.string().nullable().optional(),
    notes: z.array(z.string()).optional(),
  })
  .strict();

/**
 * Concept + strategist brief captured at the text checkpoint (Phase 1) so the
 * gated realize step (Phase 2) can reconstruct the blueprint inputs faithfully
 * without re-deriving them. This is distinct from `generationContext`, which is
 * the realized-blueprint context and ALWAYS carries a `finalPrompt` (the absence
 * of `generationContext.finalPrompt` is the "media not yet realized" signal).
 */
export const organicMediaCheckpointContextSchema = z
  .object({
    strategist: z
      .object({
        objective: z.string().nullable(),
        funnelStage: z.string().nullable(),
        targetAudience: z.string().nullable(),
        tone: z.string().nullable(),
        angle: z.string().nullable(),
        postType: z.string().nullable(),
        postSize: z.string().nullable(),
      })
      .strict(),
    creativeDirection: z
      .object({
        conceptTitle: z.string().nullable(),
        creativeDirection: z.string().nullable(),
        storyHook: z.string().nullable(),
        trendIntegration: z.string().nullable(),
        visualMode: z.string().nullable(),
        audioMode: z.string().nullable(),
        productionNotes: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

/**
 * A signed-URL string for a durable, displayed media slot. Rejects an inline
 * base64 `data:` URL at the boundary — final/preview media must render from a
 * re-signed storage URL, never a base64 blob (which bloats the UI and persisted
 * state). An empty string is allowed (transient, before the first sign).
 */
const signedMediaUrl = z.string().refine((v) => !v.startsWith('data:'), {
  message: 'must be a signed storage URL, not an inline base64 data: URL',
});

/**
 * Durable, re-signable storage reference for one published media slot. The FE
 * re-signs via /api/library/sign (assetId) or the bucket+storagePath. Written by
 * the generation pipeline (source 'ai_generated') AND by user-supplied attach
 * (`shapeUserSuppliedMedia`), so both paths render and publish identically.
 */
export const organicPublishingAssetSchema = z
  .object({
    role: z.string(),
    kind: z.enum(['image', 'video']),
    slideIndex: z.number().int().min(0).optional(),
    assetId: z.string().optional(),
    bucket: z.string().optional(),
    storagePath: z.string(),
    storageUrl: signedMediaUrl,
    mimeType: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .strict();

/**
 * Durable, re-signable storage reference for one 512px storyboard preview frame
 * (Stage 2 blueprint). Review-only — distinct from `organicPublishingAssetSchema`
 * (the final published media). Stored as bucket+storagePath so the calendar
 * re-signs a fresh URL on every load (the upload-time signed URL expires ~1h)
 * instead of relying on a stale URL or a base64 blob.
 */
export const organicStoryboardPreviewSchema = z
  .object({
    role: z.string(),
    bucket: z.string(),
    storagePath: z.string().min(1),
    storageUrl: signedMediaUrl,
    format: z.string().nullable().optional(),
    /**
     * Which reel scene this panel belongs to. `role` cannot carry the join —
     * multiple scenes legitimately share `role: 'body'` — so realization needs an
     * explicit key to hand the right panel to the right clip as its first frame.
     * Optional because panels persisted before the contact-sheet path existed
     * have no scene to point at.
     */
    sceneIndex: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export const organicMediaSuggestionSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    kind: z.string().optional(),
    prompt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    assetUrl: z.string().optional(),
    assetBase64: z.string().optional(),
    url: z.string().optional(),
    signedUrl: z.string().optional(),
    mimeType: z.string().optional(),
    alt: z.string().optional(),
    // Durable storage bucket for the primary asset (mirrors a publishingAsset's
    // bucket) so publish staging can re-stage a user-supplied creative from any
    // private bucket, not just the default.
    bucket: z.string().optional(),
    // Realization-tier readiness (checkpointed pipeline). `mediaStatus` gates the
    // expensive media step: text + blueprint land first (`pending`), then the user
    // attaches (`user_supplied`) or generates (`generating` → `ready`).
    mediaStatus: organicDraftMediaStatusSchema.optional(),
    textReady: z.boolean().optional(),
    blueprintReady: z.boolean().optional(),
    // Opaque revision of the exact persisted storyboard the user reviewed.
    // Realization requests must echo it so stale or implicit approvals fail closed.
    previewRevision: z.string().min(1).optional(),
    // Contextual brand grounding for media generation, decided by the blueprint
    // (Stage 2). Drives whether the logo / prior on-brand creatives are seeded as
    // references; palette + voice/vision/guideline text ground every concept.
    brandGrounding: organicMediaBrandGroundingSchema.optional(),
    audioConcept: organicMediaAudioConceptSchema.optional(),
    // Concept + brief captured at the text checkpoint so gated realization can
    // reconstruct blueprint inputs without re-deriving them. Distinct from
    // `generationContext` (the realized-blueprint context, which carries finalPrompt).
    checkpointContext: organicMediaCheckpointContextSchema.optional(),
    generationContext: organicMediaGenerationContextSchema.optional(),
    ugc: organicUgcSpecSchema.optional(),
    assets: z
      .array(
        z
          .object({
            role: z.string(),
            order: z.number().int().min(1).optional(),
            slideRole: z.string().optional(),
            headline: z.string().optional(),
            body: z.string().optional(),
            overlayText: z.string().optional(),
            provider: z.string().optional(),
            model: z.string().optional(),
            prompt: z.string().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
            assetUrl: z.string().optional(),
            assetBase64: z.string().optional(),
            url: z.string().nullable().optional(),
            signedUrl: z.string().nullable().optional(),
            bucket: z.string().nullable().optional(),
            generated: z.boolean().optional(),
            mimeType: z.string().optional(),
            error: z.string().nullable().optional(),
            generationContext: organicMediaGenerationContextSchema.optional(),
          })
          .strict(),
      )
      .optional(),
    reel: organicReelAssetSchema.optional(),
    hyperframe: organicHyperframeAssetSchema.optional(),
    // Persisted 512px storyboard preview frames from the Stage 2 blueprint, kept as
    // durable bucket+storagePath references so the no-media draft re-displays them
    // (re-signed) after a reload. Review-only; NOT the final publishingAssets.
    storyboard: z.array(organicStoryboardPreviewSchema).optional(),
  })
  .strict();

// Numeric-claim provenance: every number in generated copy is audited against
// the placement's evidence (claimGuard) and the normalized claim list rides the
// placement so provenance travels with the draft to realize/publish. Defined
// here (not organic.ts) because organic.ts imports from this module.
export const numericClaimTypeEnum = z.enum([
  'numeric',
  'statistic',
  'proof',
  'comparative',
  'social_proof',
]);
export type NumericClaimType = z.infer<typeof numericClaimTypeEnum>;

export const claimEvidenceKindEnum = z.enum([
  'trend_lift',
  'hook_rate',
  'top_post',
  'metric',
  'competitor',
  'external',
]);
export type ClaimEvidenceKind = z.infer<typeof claimEvidenceKindEnum>;

export const numericClaimSchema = z.object({
  text: z.string().describe('The exact claim as it appears in caption/cta'),
  claimType: numericClaimTypeEnum,
  status: z.enum(['grounded', 'data_needed']),
  source: z
    .object({
      evidenceKind: claimEvidenceKindEnum,
      refId: z.string().nullable().describe('Resolves to an angleEvidenceItem.refId'),
      metricName: z.string().nullable().default(null),
      metricValue: z.number().nullable().default(null),
      capturedAt: z.string().nullable().default(null),
    })
    .nullable()
    .default(null)
    .describe("null iff status === 'data_needed'"),
});
export type NumericClaim = z.infer<typeof numericClaimSchema>;

export const organicCalendarPlacementSchema = z
  .object({
    placementId: z.string().min(1),
    schedule: z
      .object({
        dayId: z.string().min(1),
        scheduledAt: z.string().min(1),
        timeOfDay: z.string().nullable().optional(),
        adjusted: z.boolean().optional(),
      })
      .strict(),
    platform: z
      .object({
        name: organicPipelinePlatformSchema,
        accountId: z.string().nullable().optional(),
      })
      .strict(),
    seed: z
      .object({
        trendId: z.string().nullable().optional(),
        source: organicPipelineSeedSourceSchema.nullable().optional(),
      })
      .strict()
      .optional(),
    content: z
      .object({
        type: z.string().nullable().optional(),
        format: z.string().nullable().optional(),
        titleTopic: z.string().nullable().optional(),
        objective: z.string().nullable().optional(),
        target: z.string().nullable().optional(),
        tone: z.string().nullable().optional(),
        cta: z.string().nullable().optional(),
        numSlides: z.number().nullable().optional(),
      })
      .strict(),
    creative: z
      .object({
        creativeIdea: z.string().nullable().optional(),
        // The user's own creative direction, as typed in the planner preview. Held
        // alongside `creativeIdea` (the generated brief) so an edit survives a
        // refetch and renders back into the panel it was typed in. Declared here
        // because this object is `.strict()` — an undeclared key is a parse failure.
        creativeDirectionPrompt: z.string().nullable().optional(),
        assetIds: z.array(z.string()).optional(),
        assetHints: z
          .array(
            z
              .object({
                role: z.string(),
                suggestion: z.string(),
              })
              .strict(),
          )
          .optional(),
        carousel: z
          .object({
            title: z.string(),
            hook: z.string(),
            saveRationale: z.string().optional(),
            shareRationale: z.string().optional(),
            slides: z.array(
              z
                .object({
                  order: z.number().int().min(1),
                  role: z.string(),
                  headline: z.string(),
                  body: z.string(),
                  overlayText: z.string(),
                  visualPrompt: z.string().optional(),
                })
                .strict(),
            ),
          })
          .strict()
          .optional(),
        mediaSuggestion: organicMediaSuggestionSchema.optional(),
      })
      .strict()
      .optional(),
    copy: z
      .object({
        caption: z.string().nullable().optional(),
        hashtags: z
          .object({
            high: z.array(z.string()).optional(),
            medium: z.array(z.string()).optional(),
            low: z.array(z.string()).optional(),
          })
          .strict()
          .optional(),
        // Audited numeric-claim provenance (claimGuard); data_needed entries mark
        // numbers with no grounded evidence so publish surfaces can flag them.
        claims: z.array(numericClaimSchema).optional(),
      })
      .strict()
      .optional(),
    quality: z
      .object({
        passed: z.boolean(),
        overallScore: z.number().min(0).max(100),
        brandFitScore: z.number().min(0).max(100),
        platformFitScore: z.number().min(0).max(100),
        noveltyScore: z.number().min(0).max(100),
        complianceScore: z.number().min(0).max(100),
        blockingIssues: z.array(z.string()).optional(),
        requiredFixes: z.array(z.string()).optional(),
        fixesApplied: z.array(z.string()).optional(),
        revisionCount: z.number().int().min(0).optional(),
        summary: z.string().optional(),
      })
      .strict()
      .optional(),
    // Durable, re-signable storage references for the generated media. Posts/carousels
    // upload their bytes during generation (the raw base64 is stripped before persist),
    // so the calendar/list previews read a durable `storagePath`+`bucket` and re-sign on
    // read rather than relying on the 1h upload-time signed URL or large base64 blobs.
    publishingAssets: z.array(organicPublishingAssetSchema).optional(),
  })
  .strict();

const organicPipelineStageSchema = z.enum([
  'analyzing',
  'optimizing',
  'drafting',
  'matching',
  'finalizing',
]);

const organicSlotStageSchema = z.enum([
  'strategizing',
  'concepting',
  'drafting',
  'reviewing',
  'revising',
  'generating_assets',
  'merging',
]);

const organicSlotHeartbeatStageSchema = z.enum([
  'queued',
  'concepting',
  'drafting',
  'generating_assets',
  'reviewing',
  'revising',
  'merging',
]);

export const organicCalendarProgressEventSchema = z
  .object({
    type: z.literal('progress'),
    completed: z.number().min(0),
    total: z.number().min(0),
    stage: organicPipelineStageSchema.optional(),
    message: z.string().optional(),
  })
  .strict();

export const organicCalendarSlotStartedEventSchema = z
  .object({
    type: z.literal('slot_started'),
    placementId: z.string().min(1),
    message: z.string().optional(),
  })
  .strict();

export const organicCalendarSlotStageEventSchema = z
  .object({
    type: z.literal('slot_stage'),
    placementId: z.string().min(1),
    stage: organicSlotStageSchema,
    agentName: z.string().min(1),
    message: z.string().optional(),
  })
  .strict();

export const organicCalendarSlotHeartbeatEventSchema = z
  .object({
    type: z.literal('slot_heartbeat'),
    placementId: z.string().min(1),
    stage: organicSlotHeartbeatStageSchema,
    progress: z.number().min(0).max(1),
    elapsedMs: z.number().int().min(0),
    message: z.string().optional(),
  })
  .strict();

// Emitted as soon as a placement's preview image is generated (the 512px Nano
// Banana mockup), before the full placement completes — lets the chat surface
// the concept image at the assets stage instead of only at completion.
export const organicCalendarSlotAssetReadyEventSchema = z
  .object({
    type: z.literal('slot_asset_ready'),
    placementId: z.string().min(1),
    imageUrl: z.string().nullable().optional(),
    images: z.array(z.string()).optional(),
    format: z.string().nullable().optional(),
  })
  .strict();

// Step-1 checkpoint: the placement's TEXT (caption + hashtags + concept) is ready
// and gets persisted as a placeholder draft BEFORE the creative director
// (blueprint) and the opt-in headless media generation run. The placement here is
// text-only (media pending); the terminal slot_completed carries the full draft.
export const organicCalendarSlotTextReadyEventSchema = z
  .object({
    type: z.literal('slot_text_ready'),
    placement: organicCalendarPlacementSchema,
  })
  .strict();

export const organicCalendarSlotCompletedEventSchema = z
  .object({
    type: z.enum(['slot_completed', 'placement']),
    placement: organicCalendarPlacementSchema,
  })
  .strict();

export const organicCalendarSlotFailedEventSchema = z
  .object({
    type: z.literal('slot_failed'),
    placementId: z.string().min(1),
    code: z.string().optional(),
    message: z.string().min(1),
    retryable: z.boolean().optional(),
    attempts: z.number().int().min(0).optional(),
  })
  .strict();

export const organicCalendarErrorEventSchema = z
  .object({
    type: z.literal('error'),
    code: z.string().optional(),
    message: z.string().min(1),
    placementId: z.string().optional(),
  })
  .strict();

export const organicCalendarCompleteEventSchema = z
  .object({
    type: z.literal('complete'),
    summary: z
      .object({
        total: z.number().int().min(0),
        succeeded: z.number().int().min(0),
        failed: z.number().int().min(0),
      })
      .strict()
      .optional(),
  })
  .strict();

export const organicCalendarBatchGenerateStreamEventSchema = z.union([
  organicCalendarProgressEventSchema,
  organicCalendarSlotStartedEventSchema,
  organicCalendarSlotStageEventSchema,
  organicCalendarSlotHeartbeatEventSchema,
  organicCalendarSlotAssetReadyEventSchema,
  organicCalendarSlotTextReadyEventSchema,
  organicCalendarSlotCompletedEventSchema,
  organicCalendarSlotFailedEventSchema,
  organicCalendarErrorEventSchema,
  organicCalendarCompleteEventSchema,
]);

export const organicGenerationRunStartedEventSchema = z
  .object({
    type: z.literal('run_started'),
    mode: z.enum(['batch', 'retry']),
    totalPlacements: z.number().int().min(0),
    protocolVersion: z.string().min(1),
    includeDiagnostics: z.boolean(),
  })
  .strict();

export const organicGenerationRunPlanEventSchema = z
  .object({
    type: z.literal('run_plan'),
    totalPlacements: z.number().int().min(0),
    totalWaves: z.number().int().min(0),
    waves: z.array(
      z
        .object({
          waveIndex: z.number().int().min(1),
          objectiveIds: z.array(z.string().min(1)),
          placementIds: z.array(z.string().min(1)),
          platforms: z.array(organicPipelinePlatformSchema),
        })
        .strict(),
    ),
  })
  .strict();

export const organicGenerationRunProgressEventSchema = z
  .object({
    type: z.literal('run_progress'),
    completed: z.number().int().min(0),
    total: z.number().int().min(0),
    stage: organicPipelineStageSchema.optional(),
    message: z.string().optional(),
  })
  .strict();

export const organicGenerationRunSlotStartedEventSchema = z
  .object({
    type: z.literal('slot_started'),
    placementId: z.string().min(1),
    message: z.string().optional(),
  })
  .strict();

export const organicGenerationRunSlotStageEventSchema = z
  .object({
    type: z.literal('slot_stage'),
    placementId: z.string().min(1),
    stage: organicSlotStageSchema,
    agentName: z.string().min(1),
    message: z.string().optional(),
  })
  .strict();

// V2 mirror of the generator-family `slot_text_ready` checkpoint. Emitted on the
// V2/bulk path so the calendar surfaces the cheap text checkpoint (caption +
// hashtags + concept) immediately, before the gated media realization runs. The
// placement here is text-only (mediaSuggestion.mediaStatus = 'pending').
export const organicGenerationRunSlotTextReadyEventSchema = z
  .object({
    type: z.literal('slot_text_ready'),
    placement: organicCalendarPlacementSchema,
  })
  .strict();

export const organicGenerationRunSlotCompletedEventSchema = z
  .object({
    type: z.literal('slot_completed'),
    placement: organicCalendarPlacementSchema,
  })
  .strict();

export const organicGenerationRunSlotFailedEventSchema = z
  .object({
    type: z.literal('slot_failed'),
    placementId: z.string().min(1),
    code: z.string().optional(),
    message: z.string().min(1),
    retryable: z.boolean().optional(),
    attempts: z.number().int().min(0).optional(),
  })
  .strict();

export const organicGenerationRunWarningEventSchema = z
  .object({
    type: z.literal('run_warning'),
    code: z.string().optional(),
    message: z.string().min(1),
    placementId: z.string().optional(),
  })
  .strict();

export const organicGenerationRunFailedEventSchema = z
  .object({
    type: z.literal('run_failed'),
    code: z.string().optional(),
    message: z.string().min(1),
  })
  .strict();

export const organicGenerationRunCompletedEventSchema = z
  .object({
    type: z.literal('run_completed'),
    summary: z
      .object({
        total: z.number().int().min(0),
        succeeded: z.number().int().min(0),
        failed: z.number().int().min(0),
        // Completed but media not verified durable (base64-only mockup). Optional
        // for back-compat with summaries persisted before this field existed.
        degraded: z.number().int().min(0).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const organicGenerationRunEventSchema = z.discriminatedUnion('type', [
  organicGenerationRunStartedEventSchema,
  organicGenerationRunPlanEventSchema,
  organicGenerationRunProgressEventSchema,
  organicGenerationRunSlotStartedEventSchema,
  organicGenerationRunSlotStageEventSchema,
  organicGenerationRunSlotTextReadyEventSchema,
  organicGenerationRunSlotCompletedEventSchema,
  organicGenerationRunSlotFailedEventSchema,
  organicGenerationRunWarningEventSchema,
  organicGenerationRunFailedEventSchema,
  organicGenerationRunCompletedEventSchema,
]);

export const organicGenerationRunEventEnvelopeSchema = z
  .object({
    streamVersion: z.literal('v2'),
    runId: z.string().min(1),
    sequence: z.number().int().min(1),
    timestamp: z.string().datetime(),
    event: organicGenerationRunEventSchema,
  })
  .strict();

export type OrganicPipelinePlatform = z.infer<typeof organicPipelinePlatformSchema>;
export type OrganicMediaGenerationContext = z.infer<typeof organicMediaGenerationContextSchema>;
export type OrganicReelSceneAsset = z.infer<typeof organicReelSceneAssetSchema>;
export type OrganicReelAsset = z.infer<typeof organicReelAssetSchema>;
export type OrganicHyperframeAsset = z.infer<typeof organicHyperframeAssetSchema>;
export type OrganicHyperframeStylePreset = z.infer<typeof organicHyperframeStylePresetSchema>;
export type OrganicHyperframeTone = z.infer<typeof organicHyperframeToneSchema>;
export type OrganicHyperframeAspectRatio = z.infer<typeof organicHyperframeAspectRatioSchema>;
export type OrganicDraftMediaStatus = z.infer<typeof organicDraftMediaStatusSchema>;
export type OrganicMediaStage = z.infer<typeof organicMediaStageSchema>;
export type OrganicBrandTreatment = z.infer<typeof organicBrandTreatmentSchema>;
export type OrganicBrandReference = z.infer<typeof organicBrandReferenceSchema>;
export type OrganicMediaBrandGrounding = z.infer<typeof organicMediaBrandGroundingSchema>;
export type OrganicMediaAudioConcept = z.infer<typeof organicMediaAudioConceptSchema>;
export type OrganicMediaCheckpointContext = z.infer<typeof organicMediaCheckpointContextSchema>;
export type OrganicMediaSuggestion = z.infer<typeof organicMediaSuggestionSchema>;
export type OrganicStoryboardPreview = z.infer<typeof organicStoryboardPreviewSchema>;
export type OrganicPublishingAsset = z.infer<typeof organicPublishingAssetSchema>;
export type OrganicCalendarPlacement = z.infer<typeof organicCalendarPlacementSchema>;
export type OrganicCalendarProgressEvent = z.infer<typeof organicCalendarProgressEventSchema>;
export type OrganicCalendarSlotStartedEvent = z.infer<typeof organicCalendarSlotStartedEventSchema>;
export type OrganicCalendarSlotStageEvent = z.infer<typeof organicCalendarSlotStageEventSchema>;
export type OrganicCalendarSlotHeartbeatEvent = z.infer<
  typeof organicCalendarSlotHeartbeatEventSchema
>;
export type OrganicCalendarSlotAssetReadyEvent = z.infer<
  typeof organicCalendarSlotAssetReadyEventSchema
>;
export type OrganicCalendarSlotTextReadyEvent = z.infer<
  typeof organicCalendarSlotTextReadyEventSchema
>;
export type OrganicCalendarSlotCompletedEvent = z.infer<
  typeof organicCalendarSlotCompletedEventSchema
>;
export type OrganicCalendarSlotFailedEvent = z.infer<typeof organicCalendarSlotFailedEventSchema>;
export type OrganicCalendarErrorEvent = z.infer<typeof organicCalendarErrorEventSchema>;
export type OrganicCalendarCompleteEvent = z.infer<typeof organicCalendarCompleteEventSchema>;
export type OrganicCalendarBatchGenerateStreamEvent = z.infer<
  typeof organicCalendarBatchGenerateStreamEventSchema
>;
export type OrganicGenerationRunSlotTextReadyEvent = z.infer<
  typeof organicGenerationRunSlotTextReadyEventSchema
>;
export type OrganicGenerationRunEvent = z.infer<typeof organicGenerationRunEventSchema>;
export type OrganicGenerationRunEventEnvelope = z.infer<
  typeof organicGenerationRunEventEnvelopeSchema
>;

export function assertNeverOrganicCalendarEvent(event: never): never {
  throw new Error(`Unhandled OrganicCalendarBatchGenerateStreamEvent: ${JSON.stringify(event)}`);
}

export function assertNeverOrganicRunEvent(event: never): never {
  throw new Error(`Unhandled OrganicGenerationRunEvent: ${JSON.stringify(event)}`);
}

// platform_strategist/editorial (run-level) and carousel_builder are retired —
// strategy is dispatcher-owned and carousels fold into creative_orchestrator's
// single pass. angle_strategist/hook_format_architect remain as the sequential
// fallback when the combined angle_hook_architect pass fails.
const KNOWN_AGENT_PROGRESS: Record<string, number> = {
  angle_strategist: 15,
  hook_format_architect: 20,
  angle_hook_architect: 20,
  creative_orchestrator: 36,
  audio_technical: 45,
  visual_technical: 50,
  production_technical: 50,
  copywriting_technical: 55,
  hashtag_technical: 60,
  asset_producer: 75,
  quality_reviewer: 90,
  placement_reviser: 95,
};

const KNOWN_SLOT_STAGE_PROGRESS: Record<string, number> = {
  strategizing: 10,
  concepting: 25,
  drafting: 45,
  generating_assets: 70,
  reviewing: 85,
  revising: 92,
  merging: 96,
};

export function derivePlacementProgressPercent(input: {
  agentName?: string;
  stage?: string;
}): number {
  if (input.agentName && KNOWN_AGENT_PROGRESS[input.agentName] !== undefined) {
    return KNOWN_AGENT_PROGRESS[input.agentName];
  }
  if (input.stage && KNOWN_SLOT_STAGE_PROGRESS[input.stage] !== undefined) {
    return KNOWN_SLOT_STAGE_PROGRESS[input.stage];
  }
  return 0;
}
