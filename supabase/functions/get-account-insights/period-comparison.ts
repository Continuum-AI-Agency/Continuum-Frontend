type PlacementMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
};

type BreakdownData = {
  placements: PlacementMetrics[];
};

export type PeriodComparison = {
  spend_delta_pct: number;
  roas_delta_pct: number;
  ctr_delta_pct: number;
  conversions_delta_pct: number;
};

const MAX_CACHE_DELTA_PCT = 10000;

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const percentageChange = (current: number, previous: number): number => {
  if (previous <= 0) return 0;
  return round(((current - previous) / previous) * 100);
};

const sumPlacementMetric = (placements: PlacementMetrics[], key: keyof PlacementMetrics): number =>
  placements.reduce((sum, placement) => sum + placement[key], 0);

export function computePeriodComparison(
  current: BreakdownData,
  previous: BreakdownData
): PeriodComparison {
  const curSpend = sumPlacementMetric(current.placements, "spend");
  const prevSpend = sumPlacementMetric(previous.placements, "spend");
  const curConvValue = sumPlacementMetric(current.placements, "conversion_value");
  const prevConvValue = sumPlacementMetric(previous.placements, "conversion_value");
  const curConv = sumPlacementMetric(current.placements, "conversions");
  const prevConv = sumPlacementMetric(previous.placements, "conversions");
  const curClicks = sumPlacementMetric(current.placements, "clicks");
  const prevClicks = sumPlacementMetric(previous.placements, "clicks");
  const curImpressions = sumPlacementMetric(current.placements, "impressions");
  const prevImpressions = sumPlacementMetric(previous.placements, "impressions");

  const curRoas = curSpend > 0 ? curConvValue / curSpend : 0;
  const prevRoas = prevSpend > 0 ? prevConvValue / prevSpend : 0;
  const curCtr = curImpressions > 0 ? (curClicks / curImpressions) * 100 : 0;
  const prevCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;

  return {
    spend_delta_pct: percentageChange(curSpend, prevSpend),
    roas_delta_pct: percentageChange(curRoas, prevRoas),
    ctr_delta_pct: percentageChange(curCtr, prevCtr),
    conversions_delta_pct: percentageChange(curConv, prevConv),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function hasSanePeriodComparison(payload: unknown): boolean {
  if (!isRecord(payload)) return true;

  const comparison = payload.period_comparison;
  if (!isRecord(comparison)) return true;

  for (const value of Object.values(comparison)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return false;
    }

    if (Math.abs(value) > MAX_CACHE_DELTA_PCT) {
      return false;
    }
  }

  return true;
}
