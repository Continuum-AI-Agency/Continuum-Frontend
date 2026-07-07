// Gemini Omni Flash (gemini-omni-flash-preview) — request contract for the
// canvas Omni node's edge function (supabase/functions/gemini-omni-flash).
// One "turn" per call: a fresh generate, or an edit that threads the prior
// interaction id (previous_interaction_id) so the model preserves the parts of
// the video the instruction does not mention. FE<->edge stays camelCase;
// snake_case is applied only at the Gemini wire boundary inside the edge fn.

import { z } from 'zod';

// Canvas node model id (routing keys off this string — do NOT rename).
export const OMNI_GEN_MODEL_ID = 'gemini-omni-flash' as const;
// The actual Interactions API model the edge fn calls.
export const OMNI_GEN_BACKEND_MODEL = 'gemini-omni-flash-preview' as const;

export const omniAspectRatioSchema = z.enum(['16:9', '9:16']);
export type OmniAspectRatio = z.infer<typeof omniAspectRatioSchema>;

export const omniGenTurnSchema = z.enum(['generate', 'edit']);
export type OmniGenTurn = z.infer<typeof omniGenTurnSchema>;

export const omniReferenceImageSchema = z
  .object({
    data: z.string().min(1), // base64, no data: prefix
    mimeType: z.string().min(1),
  })
  .strict();
export type OmniReferenceImage = z.infer<typeof omniReferenceImageSchema>;

export const omniGenRequestSchema = z
  .object({
    brandId: z.string().min(1),
    turn: omniGenTurnSchema,
    prompt: z.string().min(1),
    aspectRatio: omniAspectRatioSchema.optional(),
    // Reference images seed the FIRST generate only (v1); edits are text-only.
    references: z.array(omniReferenceImageSchema).max(6).optional(),
    // Grounding inputs from the node (resolved server-side into the prompt).
    skillIds: z.array(z.string().min(1)).optional(),
    brandBookPieces: z.array(z.string().min(1)).optional(),
    // Required for edit turns — the interaction id of the clip being edited.
    previousInteractionId: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => value.turn !== 'edit' || Boolean(value.previousInteractionId), {
    message: 'previousInteractionId is required for edit turns',
    path: ['previousInteractionId'],
  });
export type OmniGenRequest = z.infer<typeof omniGenRequestSchema>;
