// Number formatting for the Home overview. Money is printed in the ad account's own currency
// under the product's money rule (M1, `@/lib/money/display`): "$30.5K MXN", "$966 USD"; when
// the currency is unknown the figure goes out bare rather than with a guessed "$".

import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';
import { joinMoney, moneyParts } from '@/lib/money/display';

let formatters: Map<string, Intl.NumberFormat> | undefined;

function formatter(locale: UiLocale, style: 'compact' | 'whole' | 'money'): Intl.NumberFormat {
  const key = `${locale}:${style}`;
  let value = formatters?.get(key);
  if (!value) {
    value = new Intl.NumberFormat(
      locale,
      style === 'compact'
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : style === 'whole'
          ? { maximumFractionDigits: 0 }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    );
    (formatters ??= new Map()).set(key, value);
  }
  return value;
}

export function formatCount(value: number, locale: UiLocale = 'en'): string {
  return formatter(locale, Math.abs(value) >= 10_000 ? 'compact' : 'whole').format(value);
}

export function formatMoney(
  value: number,
  currency: string | null,
  locale: UiLocale = 'en',
): string {
  const magnitude = Math.abs(value);
  const body =
    magnitude >= 10_000
      ? formatter(locale, 'compact').format(magnitude)
      : formatter(locale, magnitude >= 100 ? 'whole' : 'money').format(magnitude);
  return joinMoney(moneyParts(value < 0, body, currency));
}

export function formatRatio(value: number, locale: UiLocale = 'en'): string {
  return `${formatDecimal(value, 2, locale)}x`;
}

export function formatFigure(
  value: number,
  unit: 'count' | 'currency',
  currency: string | null,
  locale: UiLocale = 'en',
): string {
  return unit === 'currency' ? formatMoney(value, currency, locale) : formatCount(value, locale);
}
