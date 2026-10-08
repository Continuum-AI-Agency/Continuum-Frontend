// Number formatting for the Home overview. Money is printed in the ad account's own currency;
// when the currency is unknown the figure goes out without a symbol rather than a guessed "$".

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatCount(value: number): string {
  return Math.abs(value) >= 10_000 ? compact.format(value) : whole.format(value);
}

export function formatMoney(value: number, currency: string | null): string {
  const big = Math.abs(value) >= 10_000;
  if (!currency) return big ? compact.format(value) : value.toFixed(value >= 100 ? 0 : 2);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      notation: big ? 'compact' : 'standard',
      maximumFractionDigits: big ? 1 : value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `${big ? compact.format(value) : value.toFixed(2)} ${currency}`;
  }
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
