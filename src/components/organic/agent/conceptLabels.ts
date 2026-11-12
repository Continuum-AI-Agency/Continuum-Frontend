import type { useTranslations } from 'next-intl';

export function conceptFormatLabel(
  format: string,
  translate: ReturnType<typeof useTranslations<'organic'>>,
): string {
  const keys = {
    reel: 'publishFormatREEL',
    post: 'publishFormatPOST',
    carousel: 'publishFormatCAROUSEL',
    story: 'publishFormatSTORY',
  } as const;
  return Object.hasOwn(keys, format) ? translate(keys[format as keyof typeof keys]) : format;
}
