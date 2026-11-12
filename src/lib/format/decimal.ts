import type { UiLocale } from '@/i18n/config';

let formatters: Map<string, Intl.NumberFormat> | undefined;

/** Keep the existing toFixed rounding and precision, changing only the decimal presentation. */
export function formatDecimal(value: number, digits: number, locale: UiLocale = 'en'): string {
  const precision = Number.isNaN(digits) ? 0 : Math.trunc(digits);
  const rounded = Number(value.toFixed(precision));
  const key = `${locale}:${precision}`;
  let formatter = formatters?.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      useGrouping: false,
    });
    (formatters ??= new Map()).set(key, formatter);
  }
  return formatter.format(rounded);
}
