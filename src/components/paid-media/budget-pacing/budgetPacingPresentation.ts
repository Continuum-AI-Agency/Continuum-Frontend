import type { UiLocale } from '@/i18n/config';

export type RangeOption = '7d' | '14d' | '30d' | 'all';
export type BudgetRangeOption = Readonly<{
  value: RangeOption;
  label: string;
  seconds: number | null;
}>;

export const RANGE_OPTIONS: ReadonlyArray<BudgetRangeOption> = [
  { value: '7d', label: '7D', seconds: 7 * 86400 },
  { value: '14d', label: '14D', seconds: 14 * 86400 },
  { value: '30d', label: '30D', seconds: 30 * 86400 },
  { value: 'all', label: 'All', seconds: null },
];

const currencyFormatters = new Map<UiLocale, Intl.NumberFormat>();
const percentFormatters = new Map<UiLocale, Intl.NumberFormat>();
const dayFormatters = new Map<UiLocale, Intl.NumberFormat>();

/** Keep USD and the existing whole-dollar rounding policy. */
export function formatBudgetPacingCurrency(value: number, locale: UiLocale = 'en'): string {
  let formatter = currencyFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    currencyFormatters.set(locale, formatter);
  }
  return formatter.format(value);
}

/** Pace values are percentages, not ratios. Preserve toFixed(1) before native formatting. */
export function formatBudgetPacingPercent(value: number, locale: UiLocale = 'en'): string {
  let formatter = percentFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    });
    percentFormatters.set(locale, formatter);
  }
  return formatter.format(Number(value.toFixed(1)) / 100);
}

/** Localized display clones keep the range IDs and chart windows immutable. */
export function getBudgetPacingRangeOptions(
  locale: UiLocale = 'en',
  translateAll?: () => string,
): ReadonlyArray<BudgetRangeOption> {
  let day = locale === 'en' ? undefined : dayFormatters.get(locale);
  if (locale !== 'en' && !day) {
    day = new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'day',
      unitDisplay: 'narrow',
      maximumFractionDigits: 0,
      useGrouping: false,
    });
    dayFormatters.set(locale, day);
  }
  return RANGE_OPTIONS.map((option) => ({
    ...option,
    label:
      option.value === 'all'
        ? (translateAll?.() ?? option.label)
        : day
          ? day.format((option.seconds ?? 0) / 86400)
          : option.label,
  }));
}

export function budgetPacingRangeLabel(
  value: RangeOption,
  locale: UiLocale = 'en',
  translateAll?: () => string,
): string {
  return (
    getBudgetPacingRangeOptions(locale, translateAll).find((option) => option.value === value)
      ?.label ?? value
  );
}

export function budgetPacingColumnLabels(
  value: RangeOption,
  translate?: (field: 'spend' | 'remaining', days: number | null) => string,
): Readonly<{ spend: string; remaining: string }> {
  const days = value === 'all' ? null : Number(value.slice(0, -1));
  return {
    spend: translate ? translate('spend', days) : days === null ? 'Spend' : `${days}D Spend`,
    remaining: translate
      ? translate('remaining', days)
      : days === null
        ? 'Remaining'
        : `${days}D Left`,
  };
}
