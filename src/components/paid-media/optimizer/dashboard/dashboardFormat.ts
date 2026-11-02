// Number, money, percent and month formatting for the Easy Fit dashboard. Every formatter
// takes the dashboard locale (useDashboardLocale) so switching language changes separators
// and month names in one move. Money is always MXN — the locale changes the digits'
// grouping, never the currency.

import type { DashboardLocale } from './i18n/useDashboardLocale';

const INTL_LOCALE: Record<DashboardLocale, string> = { es: 'es-MX', en: 'en-US' };

export const EMPTY_VALUE = '—';

export function intlLocale(locale: DashboardLocale): string {
  return INTL_LOCALE[locale];
}

export function formatNumber(
  value: number | null | undefined,
  locale: DashboardLocale,
  digits = 0,
): string {
  if (value == null || !Number.isFinite(value)) return EMPTY_VALUE;
  return value.toLocaleString(INTL_LOCALE[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "$1,234" — pesos without cents, as the pilot reports them. */
export function formatMxn(value: number | null | undefined, locale: DashboardLocale): string {
  const digits = formatNumber(value == null ? value : Math.round(value), locale);
  return digits === EMPTY_VALUE ? digits : `$${digits}`;
}

export function formatPct(
  value: number | null | undefined,
  locale: DashboardLocale,
  digits = 1,
): string {
  const number = formatNumber(value, locale, digits);
  return number === EMPTY_VALUE ? number : `${number}%`;
}

export function formatMultiple(value: number | null | undefined, locale: DashboardLocale): string {
  const number = formatNumber(value, locale, 1);
  return number === EMPTY_VALUE ? number : `${number}x`;
}

function monthDate(month: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

/** "Nov" or "Nov 25" for a `YYYY-MM` month key. Unknown keys pass through untouched. */
export function formatMonth(
  month: string,
  locale: DashboardLocale,
  options: { withYear?: boolean; long?: boolean } = {},
): string {
  const date = monthDate(month);
  if (!date) return month;
  const name = date.toLocaleString(INTL_LOCALE[locale], {
    month: options.long ? 'long' : 'short',
    timeZone: 'UTC',
  });
  const cleaned = name.replace('.', '');
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!options.withYear) return capitalized;
  return `${capitalized} ${String(date.getUTCFullYear()).slice(2)}`;
}

/** Month labels for a chart axis: the year is shown on the first label, on every January, and
 *  on any month name that appears twice, so a series crossing a year never reads ambiguously. */
export function axisMonthLabels(months: readonly string[], locale: DashboardLocale): string[] {
  const names = months.map((month) => formatMonth(month, locale));
  return months.map((month, index) => {
    const repeated = names.indexOf(names[index] ?? '') !== names.lastIndexOf(names[index] ?? '');
    const withYear = index === 0 || month.endsWith('-01') || repeated;
    return formatMonth(month, locale, { withYear });
  });
}

/** "1 nov" / "Nov 1" for an ISO date. */
export function formatDay(isoDate: string, locale: DashboardLocale): string {
  const date = new Date(isoDate.length === 10 ? `${isoDate}T12:00:00Z` : isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date
    .toLocaleDateString(INTL_LOCALE[locale], { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '');
}

/** "1 nov, 07:40" in Mexico City time, for the last-update stamp. */
export function formatTimestamp(iso: string, locale: DashboardLocale, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date
    .toLocaleString(INTL_LOCALE[locale], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    })
    .replace('.', '');
}
