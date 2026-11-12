'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatCount, formatMoney, formatMultiple, formatRate } from './performance';

export function usePerformanceDisplay() {
  const locale = useLocale();
  const t = useTranslations('library');
  return useMemo(
    () => ({
      t,
      formatCount: (value: number | null | undefined) => formatCount(value, locale),
      formatMoney: (value: number | null | undefined) => formatMoney(value, locale),
      formatRate: (value: number | null | undefined) => formatRate(value, locale),
      formatMultiple: (value: number | null | undefined) => formatMultiple(value, locale),
      versionLabel: (number: number | null | undefined) =>
        typeof number === 'number' ? t('performanceVersion', { number }) : t('performanceUnknown'),
      WINDOW_LABEL: {
        d7: t('performanceWindow', { days: 7 }),
        d14: t('performanceWindow', { days: 14 }),
        d30: t('performanceWindow', { days: 30 }),
      },
      TRUST_FLAG_LABEL: {
        low_evidence: t('performanceLowEvidence'),
        inferred_link: t('performanceInferred'),
        unknown_version: t('performanceUnknownVersion'),
      },
      TRUST_FLAG_TITLE: {
        low_evidence: t('performanceLowEvidenceTitle'),
        inferred_link: t('performanceInferredTitle'),
        unknown_version: t('performanceUnknownVersionTitle'),
      },
      LINK_METHOD_LABEL: {
        declared: t('performanceLinkDeclared'),
        import: t('performanceLinkImport'),
        storage_path: t('performanceLinkStorage'),
        byte_hash: t('performanceLinkHash'),
        visual_embedding: t('performanceLinkVisual'),
      },
      VERDICT_LABEL: {
        kill: t('performanceKill'),
        scale: t('performanceScale'),
        iterate: t('performanceIterate'),
        watch: t('performanceWatch'),
      },
    }),
    [locale, t],
  );
}
