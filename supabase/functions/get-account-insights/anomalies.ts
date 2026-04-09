import type { BreakdownData, DailyDataPoint, ObjectiveBreakdown } from "./breakdowns.ts";

type InsightCategory = "formats" | "placements" | "audiences" | "creative";

export type Anomaly = {
  dimension: string;
  category: InsightCategory;
  metric: string;
  signal: string;
  z_score?: number;
  delta_pct?: number;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function deltaPct(cur: number, prev: number): number {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;
}

export function detectTimeSeriesAnomalies(
  timeSeries: DailyDataPoint[]
): Anomaly[] {
  if (timeSeries.length < 4) return [];

  const anomalies: Anomaly[] = [];
  const metrics: { key: keyof DailyDataPoint; label: string; category: InsightCategory }[] = [
    { key: "roas", label: "ROAS", category: "placements" },
    { key: "ctr", label: "CTR", category: "creative" },
    { key: "spend", label: "Spend", category: "formats" },
    { key: "conversions", label: "Conversions", category: "audiences" },
  ];

  for (const { key, label, category } of metrics) {
    const values = timeSeries.map((d) => d[key] as number);
    const avg = mean(values);
    const sd = stddev(values, avg);
    if (sd === 0) continue;

    for (const day of timeSeries) {
      const value = day[key] as number;
      const z = (value - avg) / sd;
      if (Math.abs(z) < 1.5) continue;

      const direction = z > 0 ? "spiked" : "dropped";
      anomalies.push({
        dimension: `daily:${day.date}`,
        category,
        metric: key as string,
        signal: `${day.date}: ${label} ${direction} ${Math.abs(z).toFixed(1)}σ (${typeof value === "number" && key !== "ctr" ? value.toFixed(0) : (value as number).toFixed(2)} vs ${avg.toFixed(key === "ctr" ? 2 : 0)} avg)`,
        z_score: Math.round(z * 10) / 10,
      });
    }
  }

  return anomalies;
}

export function detectDimensionAnomalies(
  current: BreakdownData,
  previous: BreakdownData
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Account-wide ROAS delta as baseline
  const curTotalSpend = current.placements.reduce((s, p) => s + p.spend, 0);
  const prevTotalSpend = previous.placements.reduce((s, p) => s + p.spend, 0);
  const curTotalConvValue = current.placements.reduce((s, p) => s + p.conversion_value, 0);
  const prevTotalConvValue = previous.placements.reduce((s, p) => s + p.conversion_value, 0);
  const accountRoasDelta = deltaPct(
    curTotalSpend > 0 ? curTotalConvValue / curTotalSpend : 0,
    prevTotalSpend > 0 ? prevTotalConvValue / prevTotalSpend : 0
  );

  // Placement-level anomalies
  const curByPlatform = new Map<string, { spend: number; conversion_value: number; clicks: number; impressions: number }>();
  for (const p of current.placements) {
    const key = `${p.publisher_platform}/${p.platform_position}`;
    const e = curByPlatform.get(key) ?? { spend: 0, conversion_value: 0, clicks: 0, impressions: 0 };
    e.spend += p.spend;
    e.conversion_value += p.conversion_value;
    e.clicks += p.clicks;
    e.impressions += p.impressions;
    curByPlatform.set(key, e);
  }

  const prevByPlatform = new Map<string, { spend: number; conversion_value: number; clicks: number; impressions: number }>();
  for (const p of previous.placements) {
    const key = `${p.publisher_platform}/${p.platform_position}`;
    const e = prevByPlatform.get(key) ?? { spend: 0, conversion_value: 0, clicks: 0, impressions: 0 };
    e.spend += p.spend;
    e.conversion_value += p.conversion_value;
    e.clicks += p.clicks;
    e.impressions += p.impressions;
    prevByPlatform.set(key, e);
  }

  for (const [key, cur] of curByPlatform) {
    const prev = prevByPlatform.get(key);
    if (!prev || prev.spend < 50 || cur.spend < 50) continue;

    const curRoas = cur.spend > 0 ? cur.conversion_value / cur.spend : 0;
    const prevRoas = prev.spend > 0 ? prev.conversion_value / prev.spend : 0;
    const placementRoasDelta = deltaPct(curRoas, prevRoas);

    if (Math.abs(placementRoasDelta - accountRoasDelta) > 20) {
      const divergence = placementRoasDelta - accountRoasDelta;
      anomalies.push({
        dimension: `placement:${key}`,
        category: "placements",
        metric: "roas",
        signal: `${key} ROAS ${placementRoasDelta > 0 ? "+" : ""}${placementRoasDelta}% vs account ${accountRoasDelta}% (${divergence > 0 ? "outpacing" : "lagging"} by ${Math.abs(divergence)}pp)`,
        delta_pct: placementRoasDelta,
      });
    }

    const curCtr = cur.impressions > 0 ? (cur.clicks / cur.impressions) * 100 : 0;
    const prevCtr = prev.impressions > 0 ? (prev.clicks / prev.impressions) * 100 : 0;
    const ctrDelta = deltaPct(curCtr, prevCtr);
    if (Math.abs(ctrDelta) > 25) {
      anomalies.push({
        dimension: `placement:${key}`,
        category: "placements",
        metric: "ctr",
        signal: `${key} CTR ${ctrDelta > 0 ? "+" : ""}${ctrDelta}% period-over-period (${prevCtr.toFixed(2)}% → ${curCtr.toFixed(2)}%)`,
        delta_pct: ctrDelta,
      });
    }
  }

  // Demographic anomalies
  const curByAge = new Map<string, { spend: number; conversions: number; conversion_value: number }>();
  for (const d of current.demographics) {
    const e = curByAge.get(d.age) ?? { spend: 0, conversions: 0, conversion_value: 0 };
    e.spend += d.spend;
    e.conversions += d.conversions;
    e.conversion_value += d.conversion_value;
    curByAge.set(d.age, e);
  }

  const prevByAge = new Map<string, { spend: number; conversions: number; conversion_value: number }>();
  for (const d of previous.demographics) {
    const e = prevByAge.get(d.age) ?? { spend: 0, conversions: 0, conversion_value: 0 };
    e.spend += d.spend;
    e.conversions += d.conversions;
    e.conversion_value += d.conversion_value;
    prevByAge.set(d.age, e);
  }

  for (const [age, cur] of curByAge) {
    const prev = prevByAge.get(age);
    if (!prev || prev.spend < 50 || cur.spend < 50) continue;

    const convDelta = deltaPct(cur.conversions, prev.conversions);
    const totalConvDelta = deltaPct(
      current.demographics.reduce((s, d) => s + d.conversions, 0),
      previous.demographics.reduce((s, d) => s + d.conversions, 0)
    );

    if (Math.abs(convDelta - totalConvDelta) > 20) {
      anomalies.push({
        dimension: `demographic:${age}`,
        category: "audiences",
        metric: "conversions",
        signal: `${age} conversions ${convDelta > 0 ? "+" : ""}${convDelta}% vs account ${totalConvDelta}% (${Math.abs(convDelta - totalConvDelta)}pp divergence)`,
        delta_pct: convDelta,
      });
    }
  }

  return anomalies;
}

export function detectSpendMismatches(
  data: BreakdownData,
  objectives?: ObjectiveBreakdown[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Placement spend mismatches
  const totalPlacementSpend = data.placements.reduce((s, p) => s + p.spend, 0);
  if (totalPlacementSpend > 0) {
    const roasValues = data.placements
      .filter((p) => p.spend > 0)
      .map((p) => p.roas);
    const q25 = roasValues.length > 0
      ? [...roasValues].sort((a, b) => a - b)[Math.floor(roasValues.length * 0.25)]
      : 0;

    for (const p of data.placements) {
      const spendShare = (p.spend / totalPlacementSpend) * 100;
      if (spendShare >= 20 && p.roas <= q25 && p.roas > 0) {
        anomalies.push({
          dimension: `placement:${p.publisher_platform}/${p.platform_position}`,
          category: "placements",
          metric: "spend_mismatch",
          signal: `${p.publisher_platform}/${p.platform_position} gets ${spendShare.toFixed(0)}% of spend but ROAS (${p.roas.toFixed(2)}x) is bottom quartile`,
        });
      }
    }
  }

  // Objective spend mismatches
  if (objectives && objectives.length >= 2) {
    const totalObjSpend = objectives.reduce((s, o) => s + o.spend, 0);
    const objRoasValues = objectives.filter((o) => o.spend > 0).map((o) => o.roas);
    const objQ25 = objRoasValues.length > 0
      ? [...objRoasValues].sort((a, b) => a - b)[Math.floor(objRoasValues.length * 0.25)]
      : 0;

    for (const o of objectives) {
      const spendShare = totalObjSpend > 0 ? (o.spend / totalObjSpend) * 100 : 0;
      if (spendShare >= 20 && o.roas <= objQ25 && o.roas > 0) {
        anomalies.push({
          dimension: `objective:${o.objective}`,
          category: "formats",
          metric: "spend_mismatch",
          signal: `${o.objective} gets ${spendShare.toFixed(0)}% of spend but ROAS (${o.roas.toFixed(2)}x) is bottom quartile across objectives`,
        });
      }
    }
  }

  return anomalies;
}

export function detectAllAnomalies(args: {
  current: BreakdownData;
  previous: BreakdownData;
  timeSeries: DailyDataPoint[];
  objectives?: ObjectiveBreakdown[];
}): Anomaly[] {
  const all = [
    ...detectTimeSeriesAnomalies(args.timeSeries),
    ...detectDimensionAnomalies(args.current, args.previous),
    ...detectSpendMismatches(args.current, args.objectives),
  ];

  // Dedupe by dimension + metric
  const seen = new Set<string>();
  return all.filter((a) => {
    const key = `${a.dimension}:${a.metric}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
