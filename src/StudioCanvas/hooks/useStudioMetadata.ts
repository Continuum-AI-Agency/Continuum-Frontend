'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { translateStudioMetadata } from '../utils/studioPresentation';

/** Translate application-owned registry labels while leaving provider and font names intact. */
export function useStudioMetadata() {
  const translate = useTranslations('studio');
  return useCallback((source: string) => translateStudioMetadata(source, translate), [translate]);
}
