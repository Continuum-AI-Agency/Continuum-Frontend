import type { useTranslations } from 'next-intl';

const keys = {
  tracked: 'm_903f50e21f',
  promoted: 'm_dd0bbf2e8c',
  unresolved: 'm_da5c8b5de0',
  resolved: 'm_df82cc1a00',
  needsReview: 'm_219ded73d6',
  competitors: 'm_ceaea6ae42',
  inserted: 'm_6b27407bb3',
  updated: 'm_a11b2be402',
  errors: 'm_377dd3a8aa',
  stored: 'm_eb1f64d1fb',
  analyzed: 'm_6432577198',
  extracted: 'm_570c24d13b',
  tagged: 'm_59b4037db3',
  relabeled: 'm_22533560ca',
  processed: 'm_c98a35cbf4',
  joined: 'm_4fb1b398da',
  created: 'm_136c4cce2b',
  rows: 'm_c1d7737f9e',
  gaps: 'm_7b6051d631',
} as const;
/** Counts come from scan-stage codes; unknown codes remain exact diagnostics. */
export function scanCountLabel(
  code: string,
  count: number,
  t: ReturnType<typeof useTranslations<'competitor'>>,
  locale: string,
): string {
  return Object.hasOwn(keys, code)
    ? t(keys[code as keyof typeof keys], { count })
    : new Intl.NumberFormat(locale, { maximumSignificantDigits: 21 }).format(count) + ' ' + code;
}
