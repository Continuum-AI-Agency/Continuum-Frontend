// Number formatting for the Home overview. Money is printed in the ad account's own currency
// under the product's money rule (M1, `@/lib/money/display`): "$30.5K MXN", "$966 USD"; when
// the currency is unknown the figure goes out bare rather than with a guessed "$".

import { joinMoney, moneyParts } from '@/lib/money/display';

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatCount(value: number): string {
  return Math.abs(value) >= 10_000 ? compact.format(value) : whole.format(value);
}

export function formatMoney(value: number, currency: string | null): string {
  const magnitude = Math.abs(value);
  const body =
    magnitude >= 10_000
      ? compact.format(magnitude)
      : new Intl.NumberFormat('en-US', {
          minimumFractionDigits: magnitude >= 100 ? 0 : 2,
          maximumFractionDigits: magnitude >= 100 ? 0 : 2,
        }).format(magnitude);
  return joinMoney(moneyParts(value < 0, body, currency));
}

export function formatRatio(value: number): string {
  return `${value.toFixed(2)}x`;
}

export function formatFigure(
  value: number,
  unit: 'count' | 'currency',
  currency: string | null,
): string {
  return unit === 'currency' ? formatMoney(value, currency) : formatCount(value);
}
