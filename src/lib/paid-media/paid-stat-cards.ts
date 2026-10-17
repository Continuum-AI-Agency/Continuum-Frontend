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
    cpa?: number;
    purchases?: number;
    purchase_value?: number;
  };
  comparison?: Record<
    string,
    { previous?: number | null; percentageChange?: number | null } | undefined
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

// Maps a Meta account-overview response into the three headline paid KPIs
// (spend / ROAS / CTR) — each with its period-over-period delta, daily bar
// series, and a hover detail of the prior window plus secondary metrics.
// Money is labelled with the payload's own currency first, the account record's
// second, and prints bare when neither is known — never a `$` by default.
export function buildPaidStatCards(
  overview: PaidOverviewInput,
  accountCurrency: string | null,
): PaidStatCardModel[] {
  const m = overview.metrics;
  const cmp = overview.comparison ?? {};
  const trends = overview.trends ?? [];
  const currency = overview.currency ?? accountCurrency ?? null;
  const maybe = (value: number | undefined, unit: Unit): string =>
    typeof value === 'number' ? formatKpiValue(value, unit, currency) : '—';

  const deltaOf = (key: string): number | undefined => {
    const change = cmp[key]?.percentageChange;
    return typeof change === 'number' ? change : undefined;
  };
  const prevOf = (key: string, unit: Unit): string => {
    const previous = cmp[key]?.previous;
    return typeof previous === 'number' ? formatKpiValue(previous, unit, currency) : '—';
  };

  return [
    {
      id: 'spend',
      label: 'Spend',
      value: formatKpiValue(m.spend, 'currency', currency),
      raw: m.spend,
      unit: 'currency',
      currency,
      deltaPct: deltaOf('spend'),
      series: trends.map((point) => point.spend ?? 0),
      detail: [
        { label: 'Prev 7d', value: prevOf('spend', 'currency') },
        { label: 'Impressions', value: maybe(m.impressions, 'number') },
        { label: 'Clicks', value: maybe(m.clicks, 'number') },
        { label: 'CPC', value: maybe(m.cpc, 'currency') },
      ],
    },
    {
      id: 'roas',
      label: 'ROAS',
      value: formatKpiValue(m.roas, 'multiplier'),
      raw: m.roas,
      unit: 'multiplier',
      currency: null,
      deltaPct: deltaOf('roas'),
      series: trends.map((point) => point.roas ?? 0),
      detail: [
        { label: 'Prev 7d', value: prevOf('roas', 'multiplier') },
        { label: 'Conv. value', value: maybe(m.purchase_value, 'currency') },
        { label: 'Conversions', value: maybe(m.purchases, 'number') },
        { label: 'CPA', value: maybe(m.cpa, 'currency') },
      ],
    },
    {
      id: 'ctr',
      label: 'CTR',
      value: formatKpiValue(m.ctr, 'percent'),
      raw: m.ctr,
      unit: 'percent',
      currency: null,
      deltaPct: deltaOf('ctr'),
      series: trends.map((point) => point.ctr ?? 0),
      detail: [
        { label: 'Prev 7d', value: prevOf('ctr', 'percent') },
        { label: 'Impressions', value: maybe(m.impressions, 'number') },
        { label: 'Clicks', value: maybe(m.clicks, 'number') },
        { label: 'CPC', value: maybe(m.cpc, 'currency') },
      ],
    },
  ];
}
