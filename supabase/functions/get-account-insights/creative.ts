import type { InsightRow } from "./breakdowns.ts";
import {
  extractActionMetric,
  extractPurchaseRoas,
  PURCHASE_ACTION_TYPES,
  toNumber,
} from "./metrics.ts";

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

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

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
      "ad_id,ad_name,spend,impressions,clicks,actions,action_values,purchase_roas,frequency",
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
      const purchaseRoas = extractPurchaseRoas(row.purchase_roas);

      return {
        ad_id: String(row.ad_id ?? ""),
        ad_name: String(row.ad_name ?? ""),
        spend: round(spend),
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
        conversions: round(purchases),
        conversion_value: round(purchaseValue),
        roas:
          purchaseRoas > 0
            ? round(purchaseRoas)
            : spend > 0
              ? round(purchaseValue / spend)
              : 0,
        frequency: round(toNumber(row.frequency), 2),
      };
    })
    .filter((ad) => ad.spend > 0);
}
