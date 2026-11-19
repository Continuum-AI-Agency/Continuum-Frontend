import type { UiLocale } from '@/i18n/config';

const formats = new Map<string, Intl.DateTimeFormat>();
export function uiDateFormat(
  locale: UiLocale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = formats.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formats.set(key, formatter);
  }
  return formatter;
}
