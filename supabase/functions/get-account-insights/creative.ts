import type { InsightRow } from "./breakdowns.ts";

export type AdCreativeBreakdown = {
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversion_value: number;
  roas: number;
  frequency: number;
};

const PURCHASE_ACTION_TYPES = new Set(["omni_purchase"]);

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const extractActionMetric = (
  values: unknown,
  actionTypes: Set<string>
): number =>
  asArray(values)
    .map((item) => {
      if (!item || typeof item !== "object") return 0;
      const record = item as Record<string, unknown>;
      const actionType =
        typeof record.action_type === "string" ? record.action_type : "";
      if (!actionTypes.has(actionType)) return 0;
      return toNumber(record.value);
    })
    .reduce((sum, value) => sum + value, 0);

export async function fetchAdLevelInsights(args: {
  adAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<AdCreativeBreakdown[]> {
  const rawId = args.adAccountId.replace(/^act_/, "");
  const url = `https://graph.facebook.com/v23.0/act_${rawId}/insights`;
  const params = new URLSearchParams({
    fields:
      "ad_id,ad_name,spend,impressions,clicks,actions,action_values,frequency",
    time_range: JSON.stringify({ since: args.since, until: args.until }),
    level: "ad",
    access_token: args.accessToken,
    limit: "200",
  });

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    args.log("Meta API error for ad-level insights", {
      status: response.status,
      error: errorData,
    });
    return [];
  }

  const data = await response.json().catch(() => ({}));
  const rows: InsightRow[] = Array.isArray(data?.data) ? data.data : [];

  return rows
    .map((row): AdCreativeBreakdown => {
      const spend = toNumber(row.spend);
      const impressions = toNumber(row.impressions);
      const clicks = toNumber(row.clicks);
      const purchaseValue = extractActionMetric(
        row.action_values,
        PURCHASE_ACTION_TYPES
      );
      const purchases = extractActionMetric(row.actions, PURCHASE_ACTION_TYPES);

      return {
        ad_id: String(row.ad_id ?? ""),
        ad_name: String(row.ad_name ?? ""),
        spend: round(spend),
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
        conversions: round(purchases),
        conversion_value: round(purchaseValue),
        roas: spend > 0 ? round(purchaseValue / spend) : 0,
        frequency: round(toNumber(row.frequency), 2),
      };
    })
    .filter((ad) => ad.spend > 0);
}
