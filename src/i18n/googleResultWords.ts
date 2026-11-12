import type { useTranslations } from 'next-intl';

type GoogleCopy = ReturnType<typeof useTranslations<'scale'>>;
export function googleUiResultWord(
  kind: string,
  form: 'one' | 'many' | 'column',
  t: GoogleCopy,
): string {
  return t('googleResultWord', { kind, form });
}
