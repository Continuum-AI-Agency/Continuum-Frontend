'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { BUILT_IN_CARD_FIELDS, CARD_ASPECTS, CARD_SIZES } from './cardOptions';
import { BUILT_IN_LIST_COLUMNS } from './listSort';

/** Display copy stays separate from stable preference and sort keys. */
export function useLibraryFieldOptions() {
  const t = useTranslations('library');
  return useMemo(
    () => ({
      fields: BUILT_IN_CARD_FIELDS.map((field) => ({ ...field, label: t(field.labelKey) })),
      aspects: CARD_ASPECTS.map((option) => ({ ...option, label: t(option.labelKey) })),
      sizes: CARD_SIZES.map((option) => ({ ...option, label: t(option.labelKey) })),
      columns: BUILT_IN_LIST_COLUMNS.map((column) => ({ ...column, label: t(column.labelKey) })),
    }),
    [t],
  );
}

/** Locale and translated application terms for pure card-value formatters. */
export function useCardFieldDisplay() {
  const locale = useLocale();
  const translate = useTranslations('library');
  return useMemo(() => ({ locale, translate }), [locale, translate]);
}
