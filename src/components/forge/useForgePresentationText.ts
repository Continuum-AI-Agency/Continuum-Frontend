'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { presentForgeMetadata } from './forgePresentation';

export function useForgePresentationText() {
  const translate = useTranslations('forge');
  return useCallback((source: string) => presentForgeMetadata(source, translate), [translate]);
}
