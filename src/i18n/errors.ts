'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { uiErrorMessage } from './errorMessages';

export { LocalizedUiError, type UiErrorKey, uiErrorKey, uiErrorMessage } from './errorMessages';

export function useUiErrorMessage() {
  const t = useTranslations('common');
  return useCallback((error: unknown) => uiErrorMessage(error, t), [t]);
}
