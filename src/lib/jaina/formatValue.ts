export type ValueFormat =
  | 'currency'
  | 'percent'
  | 'multiplier'
  | 'number'
  | 'integer'
  | 'compact'
  | 'text'
  | (string & {});

export type PercentBasis = 'fraction' | 'points';

type FormatOptions = {
  currency?: string;
  locale?: string;
  /** For `percent`: how the value is expressed at the source. When given, no guessing:
   *  a fraction is ×100, points print as-is. Absent = the legacy magnitude heuristic,
   *  which reads a 0.918-point CTR as 91.8%. Declare it. */
  percentBasis?: PercentBasis | null;
};

type MetricDisplayFormatInput = {
  label?: string | null;
  format?: ValueFormat | string | null;
  unit?: string | null;
};

function isConversionCountLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  const namesCountMetric = /\b(conversions?|purchases?)\b/.test(normalized);
  const namesRateMetric =
    /\b(rate|cvr|percentage|percent|pct|ratio)\b/.test(normalized) || normalized.includes('%');
  const namesValueMetric = /\b(value|revenue|roas|cost|cpa|cpc|cpm|cac|per)\b/.test(normalized);

  return namesCountMetric && !namesRateMetric && !namesValueMetric;
}

function isPercentUnit(unit?: string | null): boolean {
  if (!unit) return false;
  const normalized = unit.trim().toLowerCase();
  return normalized === '%' || normalized === 'percent' || normalized === 'percentage';
}

export function resolveMetricDisplayFormat({
  label,
  format,
  unit,
}: MetricDisplayFormatInput): ValueFormat | string | undefined {
  const resolvedFormat = format ?? undefined;
  if (
    label &&
    isConversionCountLabel(label) &&
    (resolvedFormat === 'percent' || isPercentUnit(unit))
  ) {
    return 'number';
  }

  return resolvedFormat;
}

export function formatValue(
  value: string | number,
  format?: ValueFormat | string,
  options?: FormatOptions,
): string {
  const locale = options?.locale ?? 'en-US';

  if (typeof value === 'string' && !format) return value;

  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return String(value);

  switch (format) {
    // A missing code is NOT dollars. Every block that renders money already says
    // "N (currency unknown)" when its `currency_code` is null — the backend's dataset
    // materializer names that spelling too — and defaulting to USD here was the one place a
    // peso figure could still reach a reader wearing a dollar sign.
    case 'currency': {
      const code = (options?.currency ?? '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code))
        return `${formatValue(num, 'number', options)} (currency unknown)`;
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 2,
      }).format(num);
    }

    case 'percent': {
      const basis = options?.percentBasis ?? null;
      const fraction =
        basis === 'fraction'
          ? num
          : basis === 'points'
            ? num / 100
            : num < 1 && num > -1
              ? num
              : num / 100;
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: basis ? 2 : 1,
      }).format(fraction);
    }

    case 'multiplier':
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(num)}x`;

    case 'number':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(num);

    case 'integer':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(num);

    case 'compact':
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(num);

    case 'text':
      return String(value);

    default:
      return typeof value === 'number'
        ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(num)
        : String(value);
  }
}
