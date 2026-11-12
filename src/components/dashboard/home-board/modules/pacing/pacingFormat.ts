import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type PacingCopy = ReturnType<typeof useTranslations<'dashboard'>>;

// The words the pacing tile and its module share: a day as the Optimizer names it ("Nov 2") and
// the gap against what the plan expected, in words — never a bare minus sign.
import type { FlightPacingStatus } from '@/components/paid-media/optimizer/charts/flightPacingModel';
import { formatMoney } from '@/lib/home/format';

let dayFormats: Map<UiLocale, Intl.DateTimeFormat> | undefined;

export function dayLabel(day: string, locale: UiLocale = 'en'): string {
  let format = dayFormats?.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    (dayFormats ??= new Map()).set(locale, format);
  }
  return format.format(new Date(`${day}T00:00:00Z`));
}

/** "$4,459 MXN behind (74%)", "$5 USD ahead (3%)"; "Nothing expected yet" on day one. */
export function gapLabel(
  gap: number,
  gapPct: number | null,
  currency: string | null,
  t?: PacingCopy,
  locale: UiLocale = 'en',
): string {
  if (t) {
    if (gapPct === null) return t('pacingNothingExpected');
    if (gap === 0) return t('pacingExact');
    return t('pacingGap', {
      money: formatMoney(Math.abs(gap), currency, locale),
      side: gap > 0 ? 'ahead' : 'behind',
      percent: new Intl.NumberFormat(locale, {
        maximumFractionDigits: 20,
      }).format(Math.abs(gapPct)),
    });
  }
  if (gapPct === null) return 'Nothing expected yet';
  if (gap === 0) return 'Exactly on plan';
  const side = gap > 0 ? 'ahead' : 'behind';
  return `${formatMoney(Math.abs(gap), currency)} ${side} (${Math.abs(gapPct)}%)`;
}

export const PACE_TONE: Record<FlightPacingStatus, string> = {
  on_track: 'text-emerald-600 dark:text-emerald-400',
  underpacing: 'text-amber-600 dark:text-amber-400',
  overpacing: 'text-amber-600 dark:text-amber-400',
};
