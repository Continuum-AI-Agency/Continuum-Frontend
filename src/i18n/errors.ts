'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { uiErrorSentence } from './errorMessages';

export {
  LocalizedUiError,
  type UiErrorKey,
  uiErrorKey,
  uiErrorMessage,
  uiErrorSentence,
} from './errorMessages';

/** `uiErrorSentence` bound to the active locale: the server's own sentence, known codes reworded. */
export function useUiErrorSentence() {
  const t = useTranslations('common');
  return useCallback(
    (error: unknown, fallback?: string) => uiErrorSentence(error, t, fallback),
    [t],
  );
}

export function useUiErrorMessage() {
  const sentence = useUiErrorSentence();
  return useCallback((error: unknown) => sentence(error), [sentence]);
}
