// ---------------------------------------------------------------------------
// Ingest mapping — Meta Ads Manager / Marketing API column names to the
// engine's WindowMetrics fields. The engine never sees Meta's column names;
// callers map a raw export row to WindowMetrics at the boundary.
// ---------------------------------------------------------------------------

import type { WindowMetrics } from './types';

/** A raw row from a Meta export / API response, keyed by Meta's field names. */
export type MetaMetricRow = Record<string, number | string | null | undefined>;

/** Meta export / API field name -> WindowMetrics field. */
export const META_FIELD_MAP: Record<string, keyof WindowMetrics> = {
  'Amount spent': 'spend',
  Purchases: 'purchases',
  Leads: 'leads',
  'App installs': 'appInstalls',
  'Checkouts initiated': 'signups',
  'Landing page views': 'landingPageViews',
  'Adds to cart': 'addToCarts',
  'Link clicks': 'clicks',
  Impressions: 'impressions',
  Reach: 'reach',
};

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    // Meta exports money/counts with thousands separators and currency symbols.
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Map one Meta export / API row to WindowMetrics. Unmapped columns are ignored;
 * the required base fields default to 0 so a partial row is always valid.
 */
export function mapMetaRowToWindowMetrics(row: MetaMetricRow): WindowMetrics {
  const metrics: WindowMetrics = {
    spend: 0,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
  };
  for (const [metaField, target] of Object.entries(META_FIELD_MAP)) {
    if (row[metaField] !== undefined) {
      metrics[target] = toNumber(row[metaField]);
    }
  }
  return metrics;
}
