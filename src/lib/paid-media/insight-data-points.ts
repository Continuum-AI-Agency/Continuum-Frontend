import type {
  CampaignPerformanceMetricKey,
  CampaignPerformanceRow,
} from "@/lib/paid-media/performance-types";
import type { BudgetPacingResponse } from "@/lib/schemas/budgetPacing";

export type CampaignInsightMetric = CampaignPerformanceMetricKey | "pace";

export type CampaignInsightStatus = "strong" | "watch" | "risk" | "unknown";

export type CampaignInsightDataPoint = {
  campaignId: string;
  campaignName: string;
  metric: CampaignInsightMetric;
  currentValue: number;
  previousValue?: number;
  deltaPct?: number;
  percentileRank: number;
  direction: "higher_is_better" | "lower_is_better" | "neutral";
  status: CampaignInsightStatus;
  evidenceWindow: string;
};

export type GeneratedCampaignInsight = {
  id: string;
  scope: "account" | "campaign" | "index";
  severity: "info" | "opportunity" | "warning" | "critical";
  title: string;
  summary: string;
  recommendation?: string;
  evidence: CampaignInsightDataPoint[];
  source: "matrix" | "budget_pacing" | "timeline" | "action_logs";
};

const METRIC_DIRECTIONS: Record<
  CampaignInsightMetric,
  CampaignInsightDataPoint["direction"]
> = {
  spend: "neutral",
  roas: "higher_is_better",
  impressions: "neutral",
  clicks: "neutral",
  ctr: "higher_is_better",
  cpc: "lower_is_better",
  cpa: "lower_is_better",
  pace: "higher_is_better",
};

const PERFORMANCE_METRICS: CampaignPerformanceMetricKey[] = [
  "spend",
  "roas",
  "ctr",
  "cpc",
  "cpa",
  "impressions",
  "clicks",
];

function percentileRank(values: number[], value: number): number {
  const finiteValues = values.filter(Number.isFinite).toSorted((left, right) => left - right);
  if (finiteValues.length <= 1) return 0.5;
  const lowerOrEqual = finiteValues.filter((candidate) => candidate <= value).length - 1;
  return Math.max(0, Math.min(1, lowerOrEqual / (finiteValues.length - 1)));
}

function statusForPoint(metric: CampaignInsightMetric, percentile: number): CampaignInsightStatus {
  const direction = METRIC_DIRECTIONS[metric];
  if (direction === "neutral") return "unknown";
  const score = direction === "lower_is_better" ? 1 - percentile : percentile;
  if (score >= 0.8) return "strong";
  if (score <= 0.2) return "risk";
  if (score <= 0.4) return "watch";
  return "unknown";
}

export function buildCampaignInsightDataPoints(params: {
  campaigns: CampaignPerformanceRow[];
  budgetPacing?: BudgetPacingResponse;
  evidenceWindow: string;
}): CampaignInsightDataPoint[] {
  const { campaigns, budgetPacing, evidenceWindow } = params;
  const points: CampaignInsightDataPoint[] = [];

  for (const metric of PERFORMANCE_METRICS) {
    const values = campaigns
      .map((campaign) => campaign.metrics?.[metric])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    for (const campaign of campaigns) {
      const currentValue = campaign.metrics?.[metric];
      if (typeof currentValue !== "number" || !Number.isFinite(currentValue)) continue;

      const percentile = percentileRank(values, currentValue);
      const comparison = campaign.comparison?.[metric];
      points.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        metric,
        currentValue,
        previousValue: comparison?.previous,
        deltaPct: comparison?.percentageChange,
        percentileRank: percentile,
        direction: METRIC_DIRECTIONS[metric],
        status: statusForPoint(metric, percentile),
        evidenceWindow,
      });
    }
  }

  const pacingRows = budgetPacing?.campaigns ?? [];
  const paceValues = pacingRows
    .map((campaign) => campaign.pacePct)
    .filter((value) => Number.isFinite(value));

  for (const pacing of pacingRows) {
    const percentile = percentileRank(paceValues, pacing.pacePct);
    points.push({
      campaignId: pacing.campaignId,
      campaignName: pacing.campaignName,
      metric: "pace",
      currentValue: pacing.pacePct,
      percentileRank: percentile,
      direction: "higher_is_better",
      status:
        pacing.paceStatus === "overspending"
          ? "risk"
          : pacing.paceStatus === "underspending"
            ? "watch"
            : "strong",
      evidenceWindow,
    });
  }

  return points;
}

export function buildGeneratedCampaignInsights(
  dataPoints: CampaignInsightDataPoint[]
): GeneratedCampaignInsight[] {
  const byCampaign = new Map<string, CampaignInsightDataPoint[]>();
  for (const point of dataPoints) {
    const existing = byCampaign.get(point.campaignId);
    if (existing) {
      existing.push(point);
      continue;
    }
    byCampaign.set(point.campaignId, [point]);
  }

  const insights: GeneratedCampaignInsight[] = [];
  for (const [campaignId, points] of byCampaign) {
    const riskPoints = points.filter((point) => point.status === "risk");
    const strongPoints = points.filter((point) => point.status === "strong");
    const watchPoints = points.filter((point) => point.status === "watch");
    const campaignName = points[0]?.campaignName ?? "Campaign";

    if (riskPoints.length > 0) {
      const primary = riskPoints.toSorted(
        (left, right) => Math.abs(right.deltaPct ?? 0) - Math.abs(left.deltaPct ?? 0)
      )[0];
      insights.push({
        id: `${campaignId}:risk:${primary.metric}`,
        scope: "campaign",
        severity: primary.metric === "pace" ? "warning" : "critical",
        title: `${campaignName} needs review`,
        summary: `${primary.metric.toUpperCase()} is under relative threshold for the selected peer set.`,
        recommendation: "Inspect the row, compare against top peers, then validate budget and creative changes before reallocating spend.",
        evidence: riskPoints.slice(0, 3),
        source: primary.metric === "pace" ? "budget_pacing" : "matrix",
      });
      continue;
    }

    if (strongPoints.length >= 2) {
      insights.push({
        id: `${campaignId}:opportunity`,
        scope: "campaign",
        severity: "opportunity",
        title: `${campaignName} is leading the peer set`,
        summary: `${strongPoints
          .slice(0, 2)
          .map((point) => point.metric.toUpperCase())
          .join(" and ")} are in the strongest relative band.`,
        recommendation: "Use this campaign as the comparison anchor before scaling or cloning budget strategy.",
        evidence: strongPoints.slice(0, 3),
        source: "matrix",
      });
      continue;
    }

    if (watchPoints.length > 0) {
      insights.push({
        id: `${campaignId}:watch:${watchPoints[0].metric}`,
        scope: "campaign",
        severity: "warning",
        title: `${campaignName} is drifting`,
        summary: `${watchPoints[0].metric.toUpperCase()} is below the healthy relative band.`,
        evidence: watchPoints.slice(0, 2),
        source: watchPoints[0].metric === "pace" ? "budget_pacing" : "matrix",
      });
    }
  }

  return insights.slice(0, 8);
}

