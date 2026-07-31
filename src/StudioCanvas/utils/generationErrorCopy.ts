import { isStudioGenerationErrorCode, type StudioGenerationErrorCode } from '@continuum/contracts';

// What the person at the canvas is told when a generation fails, keyed on the code
// the Backend stamps on the SSE error frame.
//
// The raw provider message is accurate but unusable — "No image returned by Gemini
// (finishReason=IMAGE_SAFETY). Retry only after changing the prompt or references."
// names a finish reason nobody outside the codebase can act on, and it arrived only
// in a toast that auto-dismissed after five seconds. One map, read by both the toast
// and the node panel, so the two can never say different things.

export type GenerationErrorCopy = {
  title: string;
  guidance: string;
};

const COPY: Record<StudioGenerationErrorCode, GenerationErrorCopy> = {
  image_blocked: {
    title: 'This image was blocked',
    guidance:
      "The prompt or one of the reference images tripped the model's safety filters. Change the prompt or swap the references, then run this node again.",
  },
  image_empty_response: {
    title: 'No image came back',
    guidance:
      'Running this node again with the same input will fail the same way. Change the prompt or the reference images first.',
  },
};

const FALLBACK_TITLE = 'Generation failed';

export const generationErrorCopy = (
  code: unknown,
  fallbackMessage?: string,
): GenerationErrorCopy => {
  if (isStudioGenerationErrorCode(code)) return COPY[code];
  return {
    title: FALLBACK_TITLE,
    guidance: fallbackMessage?.trim() || 'Something went wrong while generating. Try again.',
  };
};
