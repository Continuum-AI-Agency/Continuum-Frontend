'use client';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { createChartFormatters } from './chart-formatters';
export function useChartFormatters() {
  const locale = useLocale();
  return useMemo(() => createChartFormatters(locale), [locale]);
}
