// Number formatting for the Home overview. Money is printed in the ad account's own currency
// under the product's money rule (M1, `@/lib/money/display`): "$30.5K MXN", "$966 USD"; when
// the currency is unknown the figure goes out bare rather than with a guessed "$".

import { joinMoney, moneyParts } from '@/lib/money/display';

const compactFor = (locale: string) =>
  new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
const wholeFor = (locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

export function formatCount(value: number, locale = 'en'): string {
  return Math.abs(value) >= 10_000
    ? compactFor(locale).format(value)
    : wholeFor(locale).format(value);
}

export function formatMoney(value: number, currency: string | null, locale = 'en'): string {
  const magnitude = Math.abs(value);
  const body =
    magnitude >= 10_000
      ? compactFor(locale).format(magnitude)
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: magnitude >= 100 ? 0 : 2,
          maximumFractionDigits: magnitude >= 100 ? 0 : 2,
        }).format(magnitude);
  return joinMoney(moneyParts(value < 0, body, currency));
}

export function formatRatio(value: number, locale = 'en'): string {
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`;
}

export function formatFigure(
  value: number,
  unit: 'count' | 'currency',
  currency: string | null,
  locale = 'en',
): string {
  return unit === 'currency' ? formatMoney(value, currency, locale) : formatCount(value, locale);
}
