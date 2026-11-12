import { isStudioGenerationErrorCode, type StudioGenerationErrorCode } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';

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
  model_unavailable: {
    title: "This model isn't available",
    guidance: 'Pick another model from the node menu — Nano Banana 2 is the closest match.',
  },
  credits_exhausted: {
    title: 'Out of Canvas credits',
    guidance: 'Top up, then run this node again — its prompt and settings are kept.',
  },
  product_required: {
    title: "AI Canvas isn't on this brand's plan",
    guidance: 'Choose a plan in Settings → Billing to generate on the canvas.',
  },
};

const FALLBACK_TITLE = 'Generation failed';

// The Backend names the refused model and whether it is credits or entitlement; only
// the canvas knows which model to point at instead.
const MODEL_UNAVAILABLE_SUGGESTION = 'Nano Banana 2 is the closest match.';

export const generationErrorCopy = (
  code: unknown,
  fallbackMessage?: string,
  translate?: ReturnType<typeof useTranslations<'studio'>>,
): GenerationErrorCopy => {
  if (translate) {
    const keys = isStudioGenerationErrorCode(code)
      ? GENERATION_ERROR_KEYS[code]
      : GENERATION_FALLBACK_KEYS;
    return { title: translate(keys.title), guidance: translate(keys.guidance) };
  }
  if (isStudioGenerationErrorCode(code)) {
    const copy = COPY[code];
    const message = fallbackMessage?.trim();
    if (code === 'model_unavailable' && message) {
      return {
        title: copy.title,
        guidance: `${message} ${MODEL_UNAVAILABLE_SUGGESTION}`,
      };
    }
    return copy;
  }
  return {
    title: FALLBACK_TITLE,
    guidance: fallbackMessage?.trim() || 'Something went wrong while generating. Try again.',
  };
};

const GENERATION_FALLBACK_KEYS = {
  title: 'generationFailedTitle',
  guidance: 'generationFailedGuidance',
} as const;
const GENERATION_ERROR_KEYS = {
  image_blocked: {
    title: 'generationImageBlockedTitle',
    guidance: 'generationImageBlockedGuidance',
  },
  image_empty_response: {
    title: 'generationEmptyTitle',
    guidance: 'generationEmptyGuidance',
  },
  model_unavailable: {
    title: 'generationModelTitle',
    guidance: 'generationModelGuidance',
  },
  credits_exhausted: {
    title: 'generationCreditsTitle',
    guidance: 'generationCreditsGuidance',
  },
  product_required: {
    title: 'generationPlanTitle',
    guidance: 'generationPlanGuidance',
  },
} as const satisfies Record<StudioGenerationErrorCode, { title: string; guidance: string }>;
