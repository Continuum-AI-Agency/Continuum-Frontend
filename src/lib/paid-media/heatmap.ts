import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';
import type { CampaignPerformanceMetricKey } from '@/lib/paid-media/performance-types';

export type MatrixMetricDirection = 'higher' | 'lower' | 'neutral';

export type MatrixMetric = {
  key: CampaignPerformanceMetricKey;
  label: string;
  shortLabel: string;
  direction: MatrixMetricDirection;
};

export const MATRIX_METRICS: MatrixMetric[] = [
  { key: 'spend', label: 'Spend', shortLabel: 'Spend', direction: 'neutral' },
  { key: 'roas', label: 'ROAS', shortLabel: 'ROAS', direction: 'higher' },
  { key: 'ctr', label: 'CTR', shortLabel: 'CTR', direction: 'higher' },
  { key: 'cpc', label: 'CPC', shortLabel: 'CPC', direction: 'lower' },
  { key: 'cpa', label: 'CPA', shortLabel: 'CPA', direction: 'lower' },
  { key: 'impressions', label: 'Impressions', shortLabel: 'Impr.', direction: 'neutral' },
  { key: 'clicks', label: 'Clicks', shortLabel: 'Clicks', direction: 'neutral' },
];

const metricLabelKeys = {
  Spend: 'spend_85f3d55',
  Impressions: 'impressions_c6310e9',
  Clicks: 'clicks_921fc98',
} as const;

export function localizeHeatmapLabel(
  source: string,
  translate: ReturnType<typeof useTranslations<'scale'>>,
): string {
  return Object.hasOwn(metricLabelKeys, source)
    ? translate(metricLabelKeys[source as keyof typeof metricLabelKeys])
    : source;
}

export type HeatmapPaint = { light: string; dark: string };

export function percentile(values: number[], value: number): number {
  const sorted = values.filter(Number.isFinite).toSorted((left, right) => left - right);
  if (sorted.length <= 1) return 0.5;
  const index = sorted.findLastIndex((candidate) => candidate <= value);
  return Math.max(0, Math.min(1, index / (sorted.length - 1)));
}

export function heatmapPaint(metric: MatrixMetric, percentileRank: number): HeatmapPaint {
  if (metric.direction === 'neutral') {
    const lightL = 96 - percentileRank * 16;
    const darkL = 18 + percentileRank * 12;
    return {
      light: `oklch(${lightL}% 0.018 250)`,
      dark: `oklch(${darkL}% 0.025 250)`,
    };
  }

  const score = metric.direction === 'lower' ? 1 - percentileRank : percentileRank;

  if (score >= 0.72) {
    return {
      light: `oklch(${94 - score * 12}% 0.075 154)`,
      dark: `oklch(${24 + score * 14}% 0.11 154)`,
    };
  }
  if (score <= 0.28) {
    return {
      light: `oklch(${96 - (1 - score) * 12}% 0.075 28)`,
      dark: `oklch(${24 + (1 - score) * 14}% 0.11 28)`,
    };
  }
  return {
    light: 'oklch(96% 0.012 95)',
    dark: 'oklch(26% 0.025 95)',
  };
}

export function paintToStyle(paint: HeatmapPaint): {
  '--hm-bg-light': string;
  '--hm-bg-dark': string;
} {
  return { '--hm-bg-light': paint.light, '--hm-bg-dark': paint.dark };
}

const formatters = new Map<string, Intl.NumberFormat>();
function numberFormatter(
  locale: UiLocale,
  kind:
    | 'currency'
    | 'preciseCurrency'
    | 'compact'
    | 'standard'
    | 'percent0'
    | 'percent1'
    | 'percent2',
): Intl.NumberFormat {
  const key = `${locale}:${kind}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    const options: Intl.NumberFormatOptions =
      kind === 'currency' || kind === 'preciseCurrency'
        ? { style: 'currency', currency: 'USD', maximumFractionDigits: kind === 'currency' ? 0 : 2 }
        : kind.startsWith('percent')
          ? {
              style: 'percent',
              minimumFractionDigits: Number(kind.at(-1)),
              maximumFractionDigits: Number(kind.at(-1)),
            }
          : {
              ...(kind === 'compact' ? { notation: 'compact' as const } : {}),
              maximumFractionDigits: 1,
            };
    formatter = new Intl.NumberFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatCurrency(value: number, locale: UiLocale = 'en'): string {
  return numberFormatter(locale, value >= 100 ? 'currency' : 'preciseCurrency').format(value);
}

export function formatCompactNumber(value: number, locale: UiLocale = 'en'): string {
  return value >= 100_000
    ? numberFormatter(locale, 'compact').format(value)
    : numberFormatter(locale, 'standard').format(value);
}

export function formatMetric(
  metric: CampaignPerformanceMetricKey,
  value: number | null | undefined,
  locale: UiLocale = 'en',
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (metric === 'spend' || metric === 'cpc' || metric === 'cpa')
    return formatCurrency(value, locale);
  if (metric === 'roas') return formatDecimal(value, 2, locale);
  if (metric === 'ctr')
    return numberFormatter(locale, 'percent2').format(Number(value.toFixed(2)) / 100);
  return formatCompactNumber(value, locale);
}

export function formatDeltaPct(value: number | undefined, locale: UiLocale = 'en'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${numberFormatter(locale, Math.abs(value) >= 10 ? 'percent0' : 'percent1').format(Number(rounded) / 100)}`;
}

export function getMetric(
  key: CampaignPerformanceMetricKey,
  translateLabel?: (source: string) => string,
): MatrixMetric {
  const found = MATRIX_METRICS.find((metric) => metric.key === key);
  if (!found) {
    return { key, label: key.toUpperCase(), shortLabel: key.toUpperCase(), direction: 'neutral' };
  }
  return translateLabel
    ? { ...found, label: translateLabel(found.label), shortLabel: translateLabel(found.shortLabel) }
    : found;
}

export function deltaTone(
  metric: MatrixMetric,
  deltaPct: number | undefined,
): 'positive' | 'negative' | 'flat' {
  if (typeof deltaPct !== 'number' || !Number.isFinite(deltaPct) || Math.abs(deltaPct) < 0.5) {
    return 'flat';
  }
  if (metric.direction === 'neutral') return deltaPct > 0 ? 'positive' : 'negative';
  const isUp = deltaPct > 0;
  const isHigherBetter = metric.direction === 'higher';
  return isUp === isHigherBetter ? 'positive' : 'negative';
}
