import type { PaidEntityKpi, PaidEntityKpiUnit, PaidRankedEntity } from '@continuum/contracts';

// The KPIs the dashboard lets you rank/re-sort the top ads by. Order is the
// dropdown order.
export const PAID_KPI_OPTIONS: ReadonlyArray<{ value: PaidEntityKpi; label: string }> = [
  { value: 'roas', label: 'ROAS' },
  { value: 'spend', label: 'Spend' },
  { value: 'ctr', label: 'CTR' },
  { value: 'conversions', label: 'Conversions' },
  { value: 'conversions_value', label: 'Conv. value' },
  { value: 'cpc', label: 'CPC' },
  { value: 'cpm', label: 'CPM' },
  { value: 'cost_per_conversion', label: 'Cost / conv.' },
];

// KPI enum (snake_case wire) → the camelCase key on PaidRankedEntity.metrics.
const KPI_METRIC_KEY: Record<PaidEntityKpi, keyof PaidRankedEntity['metrics']> = {
  spend: 'spend',
  impressions: 'impressions',
  clicks: 'clicks',
  ctr: 'ctr',
  cpc: 'cpc',
  cpm: 'cpm',
  conversions: 'conversions',
  conversions_value: 'conversionValue',
  cost_per_conversion: 'costPerConversion',
  roas: 'roas',
};

const KPI_UNIT: Record<PaidEntityKpi, PaidEntityKpiUnit> = {
  spend: 'currency',
  impressions: 'number',
  clicks: 'number',
  ctr: 'percent',
  cpc: 'currency',
  cpm: 'currency',
  conversions: 'number',
  conversions_value: 'currency',
  cost_per_conversion: 'currency',
  roas: 'multiplier',
};

const KPI_LABEL: Record<PaidEntityKpi, string> = Object.fromEntries(
  PAID_KPI_OPTIONS.map((option) => [option.value, option.label]),
) as Record<PaidEntityKpi, string>;

// Cost-efficiency KPIs where a lower value is better.
const LOWER_IS_BETTER: ReadonlySet<PaidEntityKpi> = new Set<PaidEntityKpi>([
  'cpc',
  'cpm',
  'cost_per_conversion',
]);

export function kpiUnit(kpi: PaidEntityKpi): PaidEntityKpiUnit {
  return KPI_UNIT[kpi];
}

export function kpiLabel(kpi: PaidEntityKpi): string {
  return KPI_LABEL[kpi] ?? kpi;
}

// The numeric value of a KPI for one entity, read from the already-fetched
// metrics (roas falls back to the server-ranked kpi_value). Missing → undefined.
export function metricForKpi(entity: PaidRankedEntity, kpi: PaidEntityKpi): number | undefined {
  const value = entity.metrics[KPI_METRIC_KEY[kpi]];
  if (typeof value === 'number') return value;
  if (kpi === 'roas' && typeof entity.kpi_value === 'number') return entity.kpi_value;
  return undefined;
}

// Re-rank the already-fetched rows by a KPI — descending for higher-is-better,
// ascending for cost KPIs. Entities missing the metric sort last either way.
export function sortEntitiesByKpi(
  entities: PaidRankedEntity[],
  kpi: PaidEntityKpi,
): PaidRankedEntity[] {
  const lowerIsBetter = LOWER_IS_BETTER.has(kpi);
  return [...entities].sort((a, b) => {
    const av = metricForKpi(a, kpi);
    const bv = metricForKpi(b, kpi);
    const aMissing = av === undefined || av <= 0;
    const bMissing = bv === undefined || bv <= 0;
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return lowerIsBetter ? av! - bv! : bv! - av!;
  });
}
