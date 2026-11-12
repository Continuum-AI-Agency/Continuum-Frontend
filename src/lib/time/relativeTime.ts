// One canonical "time ago" formatter for the whole app. Replaces the ~8
// hand-rolled formatRelativeTime/formatRelativeDate copies. Pure and now-injectable
// so it is trivially testable and safe in Server Components. (The Kibo
// relative-time component is a live multi-timezone clock — a different job — and
// stays reserved for scheduling / "best time to post" surfaces.)

import type { UiLocale } from '@/i18n/config';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const relativeFormatters = new Map<UiLocale, Intl.RelativeTimeFormat>();

export function toEpochMs(input: string | number | Date): number {
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') return input;
  return new Date(input).getTime();
}

/**
 * Compact relative time: "just now", "5m ago", "3h ago", "2d ago", "3w ago",
 * "in 10m" for the future, and an absolute short date once older than ~4 weeks
 * (year shown only when it differs from the reference year).
 */
export function formatRelativeTime(
  input: string | number | Date,
  now: number = Date.now(),
  locale: UiLocale = 'en',
): string {
  const then = toEpochMs(input);
  if (!Number.isFinite(then)) return { en: 'unknown', 'pt-BR': 'desconhecido', es: 'desconocido' }[locale];

  const diff = now - then;
  const past = diff >= 0;
  const abs = Math.abs(diff);

  if (abs < MINUTE) return { en: 'just now', 'pt-BR': 'agora mesmo', es: 'ahora mismo' }[locale];

  if (locale !== 'en' && abs < 4 * WEEK) {
    const [duration, unit] = abs < HOUR ? [MINUTE, 'minute'] as const
      : abs < DAY ? [HOUR, 'hour'] as const
        : abs < WEEK ? [DAY, 'day'] as const : [WEEK, 'week'] as const;
    let formatter = relativeFormatters.get(locale);
    if (!formatter) {
      formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });
      relativeFormatters.set(locale, formatter);
    }
    return formatter.format((past ? -1 : 1) * Math.round(abs / duration), unit);
  }

  const label = (value: number, unit: string) =>
    past ? `${value}${unit} ago` : `in ${value}${unit}`;

  if (abs < HOUR) return label(Math.round(abs / MINUTE), 'm');
  if (abs < DAY) return label(Math.round(abs / HOUR), 'h');
  if (abs < WEEK) return label(Math.round(abs / DAY), 'd');
  if (abs < 4 * WEEK) return label(Math.round(abs / WEEK), 'w');

  const sameYear = new Date(then).getFullYear() === new Date(now).getFullYear();
  return new Date(then).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}
