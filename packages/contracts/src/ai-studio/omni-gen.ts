// Gemini Omni 1.1 Flash (gemini-omni-1.1-flash) — request contract for the canvas
// Omni node's Backend route (POST /api/ai-studio/generate-video-omni).
//
// One "turn" per call. A turn is a fresh generate, or an edit/extend against
// either the prior interaction in this node's chain (previousInteractionId, so
// the model preserves what the instruction does not mention) or a clip wired
// into the node (sourceVideo). FE<->BE stays camelCase; snake_case is applied
// only at the Gemini wire boundary inside the adapter.

import { z } from 'zod';

// Canvas node model id (routing keys off this string — do NOT rename).
export const OMNI_GEN_MODEL_ID = 'gemini-omni-flash' as const;
// The actual Interactions API model the Backend calls.
export const OMNI_GEN_BACKEND_MODEL = 'gemini-omni-1.1-flash' as const;

export const omniAspectRatioSchema = z.enum(['16:9', '9:16']);
export type OmniAspectRatio = z.infer<typeof omniAspectRatioSchema>;

// Wire-exact, and deliberately NOT the videoGen family's vocabulary — that one
// is Veo's '2K'/'4K' uppercase and would need translating at the boundary.
// The service enumerates these itself when it rejects anything else.
export const omniResolutionSchema = z.enum(['360p', '720p', '1080p', '4k']);
export type OmniResolution = z.infer<typeof omniResolutionSchema>;
export const OMNI_DEFAULT_RESOLUTION: OmniResolution = '720p';

// 'extend' continues the clip; 'edit' changes it in place. Both need a source:
// a threaded interaction id, or a clip on the node's video input.
export const omniGenTurnSchema = z.enum(['generate', 'edit', 'extend']);
export type OmniGenTurn = z.infer<typeof omniGenTurnSchema>;

export const omniReferenceImageSchema = z
  .object({
    data: z.string().min(1), // base64, no data: prefix
    mimeType: z.string().min(1),
  })
  .strict();
export type OmniReferenceImage = z.infer<typeof omniReferenceImageSchema>;

// A clip to edit or extend. The Interactions API only takes video as inline
// base64, but most clips on the canvas are signed URLs, so a `uri` is accepted
// here and the Backend inlines it — sending megabytes of base64 up from the
// browser to have it sent straight back out again is the wrong trade.
export const omniSourceVideoSchema = z.union([
  z
    .object({
      data: z.string().min(1), // base64, no data: prefix
      mimeType: z.string().min(1),
    })
    .strict(),
  z
    .object({
      uri: z.string().min(1),
      mimeType: z.string().min(1).optional(),
    })
    .strict(),
]);
export type OmniSourceVideo = z.infer<typeof omniSourceVideoSchema>;

export const omniGenRequestSchema = z
  .object({
    brandId: z.string().min(1),
    turn: omniGenTurnSchema,
    prompt: z.string().min(1),
    aspectRatio: omniAspectRatioSchema.optional(),
    resolution: omniResolutionSchema.optional(),
    // Reference images seed the FIRST generate only (v1); edits are text-only.
    references: z.array(omniReferenceImageSchema).max(6).optional(),
    // The clip an edit/extend turn acts on when it is not threading a prior
    // interaction — i.e. a video wired into the node from elsewhere on the canvas.
    sourceVideo: omniSourceVideoSchema.optional(),
    // Grounding inputs from the node (resolved server-side into the prompt).
    skillIds: z.array(z.string().min(1)).optional(),
    brandBookPieces: z.array(z.string().min(1)).optional(),
    // Library asset ids of the reference creatives. The Backend folds what they
    // actually EARNED into the prompt as <asset_performance>, so a variant is made
    // knowing how the original performed rather than blind.
    referenceAssetIds: z.array(z.string().min(1)).max(14).optional(),
    // Sections of the brand's uploaded design system. Same tri-state as the pieces above.
    designSystemSections: z.array(z.string().min(1)).max(12).optional(),
    // The interaction id of the clip being edited, when the turn threads this
    // node's own chain rather than carrying a sourceVideo.
    previousInteractionId: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.turn === 'generate' ||
      Boolean(value.previousInteractionId) ||
      Boolean(value.sourceVideo),
    {
      message: 'edit and extend turns need previousInteractionId or sourceVideo',
      path: ['previousInteractionId'],
    },
  );
export type OmniGenRequest = z.infer<typeof omniGenRequestSchema>;
