'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createValidationErrorMap } from './validationMessages';

export function useValidationErrorMap() {
  const translate = useTranslations('common');
  const locale = useLocale();
  return useMemo(() => createValidationErrorMap(translate, locale), [translate, locale]);
}
