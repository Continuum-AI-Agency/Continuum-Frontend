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

export const STUDIO_GENERATION_ERROR_CODES = ['image_blocked', 'image_empty_response'] as const;

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
