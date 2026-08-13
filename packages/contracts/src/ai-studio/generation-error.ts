import { z } from 'zod';

// The `event: error` frame every AI Studio SSE endpoint sends when a generation
// fails. It used to be an ad-hoc object literal at five separate emit sites in the
// Backend controller, so nothing on the canvas could tell a transient failure from
// one the user has to fix — the message was the only signal, and it carried provider
// jargon (`finishReason=IMAGE_SAFETY`) straight into a toast.
//
// `code` stays a plain string on the wire: the credentials branch and the Veo
// branch mint codes from their own vocabularies, and a narrow enum here would
// invalidate frames that are already correct. Narrow on the read side.

/**
 * `model_unavailable` is the provider refusing the workspace, not the request: Azure or
 * fal answers with an auth, deployment, entitlement, or credit error, and the selected
 * external generator has no fallback provider behind it. It reached the canvas as
 * "Generation failed — Forbidden"
 * (Airtable #248). The message names the model; the canvas disables that model for the
 * session on this code.
 */
export const STUDIO_GENERATION_ERROR_CODES = [
  'image_blocked',
  'image_empty_response',
  'model_unavailable',
] as const;

export const studioGenerationErrorCodeSchema = z.enum(STUDIO_GENERATION_ERROR_CODES);
export type StudioGenerationErrorCode = z.infer<typeof studioGenerationErrorCodeSchema>;

export const isStudioGenerationErrorCode = (value: unknown): value is StudioGenerationErrorCode =>
  typeof value === 'string' && (STUDIO_GENERATION_ERROR_CODES as readonly string[]).includes(value);

export const studioStreamErrorSchema = z.object({
  message: z.string().min(1),
  code: z.string().optional(),
  /**
   * False means running the node again unchanged reproduces the same failure —
   * the user has to change the prompt or the reference images first. Absent means
   * the emit site has not classified the failure.
   */
  retryable: z.boolean().optional(),
  provider: z.string().optional(),
  summary: z.unknown().optional(),
});
export type StudioStreamError = z.infer<typeof studioStreamErrorSchema>;
