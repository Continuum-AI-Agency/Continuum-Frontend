import type { UiLocale } from '@/i18n/config';
import { formatKpiValue } from '@/lib/paid-media/paid-leaderboard-rows';

// Structural input — the account-overview fields the KPI cards read. Kept local
// (not imported from the client) so this mapping stays pure and unit testable.
export type PaidOverviewInput = {
  /** The account currency the edge labelled the payload with; null when it could not read it. */
  currency?: string | null;
  metrics: {
    spend: number;
    roas: number;
    ctr: number;
    impressions?: number;
    clicks?: number;
    cpc?: number;
    /** Null when Google could not name one result to count (contracts paidAccountOverviewSchema). */
    cpa?: number | null;
    purchases?: number;
    purchase_value?: number;
  };
  comparison?: Record<
    string,
    { previous?: number | null; percentageChange?: number | null } | null | undefined
  >;
  trends?: Array<{ spend?: number; roas?: number; ctr?: number }>;
};

export type PaidStatDetailRow = { label: string; value: string };

export type PaidStatCardModel = {
  id: string;
  label: string;
  value: string;
  /** The figure `value` was formatted from, its unit and its currency — the provenance a
   *  figure node carries so the screen can be graded against the payload. */
  raw: number;
  unit: PaidStatUnit;
  currency: string | null;
  deltaPct?: number;
  series: number[];
  detail: PaidStatDetailRow[];
};

type Unit = Parameters<typeof formatKpiValue>[1];
export type PaidStatUnit = Unit;

const STAT_LABELS = {
  spend: 'Spend',
  roas: 'ROAS',
  ctr: 'CTR',
  previous: 'Prev 7d',
  impressions: 'Impressions',
  clicks: 'Clicks',
  cpc: 'CPC',
  conversionValue: 'Conv. value',
  conversions: 'Conversions',
  cpa: 'CPA',
} as const;
export type PaidStatLabelKey = keyof typeof STAT_LABELS;

// Maps a Meta account-overview response into the three headline paid KPIs
// (spend / ROAS / CTR) — each with its period-over-period delta, daily bar
// series, and a hover detail of the prior window plus secondary metrics.
// Money is labelled with the payload's own currency first, the account record's
// second, and prints bare when neither is known — never a `$` by default.
export function buildPaidStatCards(
  overview: PaidOverviewInput,
  accountCurrency: string | null,
  locale: UiLocale = 'en',
  translate: (key: PaidStatLabelKey) => string = (key) => STAT_LABELS[key],
): PaidStatCardModel[] {
  const m = overview.metrics;
  const cmp = overview.comparison ?? {};
  const trends = overview.trends ?? [];
  const currency = overview.currency ?? accountCurrency ?? null;
  const maybe = (value: number | null | undefined, unit: Unit): string =>
    typeof value === 'number' ? formatKpiValue(value, unit, currency, locale) : '—';

  const deltaOf = (key: string): number | undefined => {
    const change = cmp[key]?.percentageChange;
    return typeof change === 'number' ? change : undefined;
  };
  const prevOf = (key: string, unit: Unit): string => {
    const previous = cmp[key]?.previous;
    return typeof previous === 'number' ? formatKpiValue(previous, unit, currency, locale) : '—';
  };

  return [
    {
      id: 'spend',
      label: translate('spend'),
      value: formatKpiValue(m.spend, 'currency', currency, locale),
      raw: m.spend,
      unit: 'currency',
      currency,
      deltaPct: deltaOf('spend'),
      series: trends.map((point) => point.spend ?? 0),
      detail: [
        { label: translate('previous'), value: prevOf('spend', 'currency') },
        {
          label: translate('impressions'),
          value: maybe(m.impressions, 'number'),
        },
        { label: translate('clicks'), value: maybe(m.clicks, 'number') },
        { label: translate('cpc'), value: maybe(m.cpc, 'currency') },
      ],
    },
    {
      id: 'roas',
      label: translate('roas'),
      value: formatKpiValue(m.roas, 'multiplier', null, locale),
      raw: m.roas,
      unit: 'multiplier',
      currency: null,
      deltaPct: deltaOf('roas'),
      series: trends.map((point) => point.roas ?? 0),
      detail: [
        { label: translate('previous'), value: prevOf('roas', 'multiplier') },
        {
          label: translate('conversionValue'),
          value: maybe(m.purchase_value, 'currency'),
        },
        {
          label: translate('conversions'),
          value: maybe(m.purchases, 'number'),
        },
        { label: translate('cpa'), value: maybe(m.cpa, 'currency') },
      ],
    },
    {
      id: 'ctr',
      label: translate('ctr'),
      value: formatKpiValue(m.ctr, 'percent', null, locale),
      raw: m.ctr,
      unit: 'percent',
      currency: null,
      deltaPct: deltaOf('ctr'),
      series: trends.map((point) => point.ctr ?? 0),
      detail: [
        { label: translate('previous'), value: prevOf('ctr', 'percent') },
        {
          label: translate('impressions'),
          value: maybe(m.impressions, 'number'),
        },
        { label: translate('clicks'), value: maybe(m.clicks, 'number') },
        { label: translate('cpc'), value: maybe(m.cpc, 'currency') },
      ],
    },
  ];
}
