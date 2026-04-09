const PURCHASE_ACTION_TYPES = new Set(["purchase", "omni_purchase"]);

export type InsightRow = Record<string, unknown>;

export type PlacementBreakdown = {
  publisher_platform: string;
  platform_position: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversion_value: number;
  roas: number;
};

export type DemographicBreakdown = {
  age: string;
  gender: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
};

export type FormatBreakdown = {
  format: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversion_value: number;
  roas: number;
};

export type DeviceBreakdown = {
  device_platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

export type DailyDataPoint = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversion_value: number;
  roas: number;
};

export type CampaignMetrics = {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversion_value: number;
  roas: number;
};

export type ObjectiveBreakdown = {
  objective: string;
  campaign_count: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversion_value: number;
  roas: number;
};

export type BreakdownData = {
  placements: PlacementBreakdown[];
  demographics: DemographicBreakdown[];
  formats: FormatBreakdown[];
  devices: DeviceBreakdown[];
};

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

function parseMetrics(row: InsightRow) {
  const spend = toNumber(row.spend);
  const impressions = toNumber(row.impressions);
  const clicks = toNumber(row.clicks);
  const purchaseValue = extractActionMetric(
    row.action_values,
    PURCHASE_ACTION_TYPES
  );
  const purchases = extractActionMetric(row.actions, PURCHASE_ACTION_TYPES);

  return {
    spend: round(spend),
    impressions: Math.round(impressions),
    clicks: Math.round(clicks),
    ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
    cpc: clicks > 0 ? round(spend / clicks) : 0,
    conversions: round(purchases),
    conversion_value: round(purchaseValue),
    roas: spend > 0 ? round(purchaseValue / spend) : 0,
  };
}

async function fetchInsightsWithBreakdowns(args: {
  adAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  breakdowns: string;
  level?: string;
  campaignFilter?: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<InsightRow[]> {
  const rawId = args.adAccountId.replace(/^act_/, "");
  const url = `https://graph.facebook.com/v23.0/act_${rawId}/insights`;
  const params = new URLSearchParams({
    fields:
      "spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type",
    time_range: JSON.stringify({ since: args.since, until: args.until }),
    breakdowns: args.breakdowns,
    level: args.level ?? "account",
    access_token: args.accessToken,
    limit: "500",
  });

  if (args.campaignFilter) {
    params.set(
      "filtering",
      JSON.stringify([
        { field: "campaign.id", operator: "EQUAL", value: args.campaignFilter },
      ])
    );
  }

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    args.log(`Meta API error for breakdowns=${args.breakdowns}`, {
      status: response.status,
      error: errorData,
    });
    return [];
  }

  const data = await response.json().catch(() => ({}));
  const rows: InsightRow[] = [];

  if (Array.isArray(data?.data)) {
    rows.push(...data.data);
  }

  let nextUrl = data?.paging?.next;
  let pages = 1;
  while (nextUrl && pages < 10) {
    const nextResponse = await fetch(nextUrl);
    if (!nextResponse.ok) break;
    const nextData = await nextResponse.json().catch(() => ({}));
    if (Array.isArray(nextData?.data)) {
      rows.push(...nextData.data);
    }
    nextUrl = nextData?.paging?.next;
    pages += 1;
  }

  return rows;
}

export async function fetchDailyTimeSeries(args: {
  adAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  campaignFilter?: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<DailyDataPoint[]> {
  const rawId = args.adAccountId.replace(/^act_/, "");
  const url = `https://graph.facebook.com/v23.0/act_${rawId}/insights`;
  const params = new URLSearchParams({
    fields: "spend,impressions,clicks,actions,action_values",
    time_range: JSON.stringify({ since: args.since, until: args.until }),
    time_increment: "1",
    level: "account",
    access_token: args.accessToken,
    limit: "500",
  });

  if (args.campaignFilter) {
    params.set(
      "filtering",
      JSON.stringify([
        { field: "campaign.id", operator: "EQUAL", value: args.campaignFilter },
      ])
    );
  }

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    args.log("Meta API error for daily time series", {
      status: response.status,
      error: errorData,
    });
    return [];
  }

  const data = await response.json().catch(() => ({}));
  const rows: InsightRow[] = Array.isArray(data?.data) ? data.data : [];

  return rows.map((row) => {
    const metrics = parseMetrics(row);
    return {
      date: String(row.date_start ?? ""),
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      conversions: metrics.conversions,
      conversion_value: metrics.conversion_value,
      roas: metrics.roas,
    };
  });
}

export async function fetchCampaignMetrics(args: {
  adAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<CampaignMetrics[]> {
  const rawId = args.adAccountId.replace(/^act_/, "");
  const url = `https://graph.facebook.com/v23.0/act_${rawId}/insights`;
  const params = new URLSearchParams({
    fields:
      "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
    time_range: JSON.stringify({ since: args.since, until: args.until }),
    level: "campaign",
    access_token: args.accessToken,
    limit: "500",
  });

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    args.log("Meta API error for campaign metrics", {
      status: response.status,
      error: errorData,
    });
    return [];
  }

  const data = await response.json().catch(() => ({}));
  const rows: InsightRow[] = Array.isArray(data?.data) ? data.data : [];

  let nextUrl = data?.paging?.next;
  let pages = 1;
  while (nextUrl && pages < 10) {
    const nextResponse = await fetch(nextUrl);
    if (!nextResponse.ok) break;
    const nextData = await nextResponse.json().catch(() => ({}));
    if (Array.isArray(nextData?.data)) {
      rows.push(...nextData.data);
    }
    nextUrl = nextData?.paging?.next;
    pages += 1;
  }

  return rows.map((row) => {
    const metrics = parseMetrics(row);
    return {
      campaign_id: String(row.campaign_id ?? ""),
      campaign_name: String(row.campaign_name ?? ""),
      ...metrics,
    };
  });
}

export function buildObjectiveBreakdowns(
  campaignMetrics: CampaignMetrics[],
  objectiveMap: Map<string, string>
): ObjectiveBreakdown[] {
  const grouped = new Map<
    string,
    {
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversion_value: number;
      count: number;
    }
  >();

  for (const cm of campaignMetrics) {
    const objective = objectiveMap.get(cm.campaign_id) ?? "unknown";
    const existing = grouped.get(objective) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversion_value: 0,
      count: 0,
    };
    existing.spend += cm.spend;
    existing.impressions += cm.impressions;
    existing.clicks += cm.clicks;
    existing.conversions += cm.conversions;
    existing.conversion_value += cm.conversion_value;
    existing.count += 1;
    grouped.set(objective, existing);
  }

  return Array.from(grouped.entries()).map(([objective, t]) => ({
    objective,
    campaign_count: t.count,
    spend: Math.round(t.spend * 100) / 100,
    impressions: Math.round(t.impressions),
    clicks: Math.round(t.clicks),
    ctr:
      t.impressions > 0
        ? Math.round((t.clicks / t.impressions) * 10000) / 100
        : 0,
    conversions: Math.round(t.conversions * 100) / 100,
    conversion_value: Math.round(t.conversion_value * 100) / 100,
    roas:
      t.spend > 0
        ? Math.round((t.conversion_value / t.spend) * 100) / 100
        : 0,
  }));
}

function inferFormat(row: InsightRow): string {
  const formatAsset = String(row.ad_format_asset ?? "").toLowerCase();

  if (formatAsset === "video" || formatAsset.includes("video")) return "video";
  if (formatAsset === "carousel_container" || formatAsset.includes("carousel")) return "carousel";
  if (formatAsset === "collection" || formatAsset.includes("collection")) return "collection";
  if (formatAsset === "ig_reel" || formatAsset === "fb_reel") return "video";
  if (formatAsset.length > 0 && formatAsset !== "unknown") return formatAsset;

  return "image";
}

function buildPlacementBreakdowns(rows: InsightRow[]): PlacementBreakdown[] {
  return rows.map((row) => ({
    publisher_platform: String(row.publisher_platform ?? "unknown"),
    platform_position: String(
      row.platform_position ?? row.impression_device ?? "unknown"
    ),
    ...parseMetrics(row),
  }));
}

function buildDemographicBreakdowns(
  rows: InsightRow[]
): DemographicBreakdown[] {
  return rows.map((row) => {
    const metrics = parseMetrics(row);
    return {
      age: String(row.age ?? "unknown"),
      gender: String(row.gender ?? "unknown"),
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions: metrics.conversions,
      conversion_value: metrics.conversion_value,
    };
  });
}

function buildDeviceBreakdowns(rows: InsightRow[]): DeviceBreakdown[] {
  return rows.map((row) => {
    const metrics = parseMetrics(row);
    return {
      device_platform: String(row.device_platform ?? "unknown"),
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions: metrics.conversions,
    };
  });
}

function buildFormatBreakdowns(adRows: InsightRow[]): FormatBreakdown[] {
  const formatMap = new Map<
    string,
    {
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversion_value: number;
    }
  >();

  for (const row of adRows) {
    const format = inferFormat(row);
    const existing = formatMap.get(format) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversion_value: 0,
    };

    const metrics = parseMetrics(row);
    existing.spend += metrics.spend;
    existing.impressions += metrics.impressions;
    existing.clicks += metrics.clicks;
    existing.conversions += metrics.conversions;
    existing.conversion_value += metrics.conversion_value;
    formatMap.set(format, existing);
  }

  return Array.from(formatMap.entries()).map(([format, totals]) => ({
    format,
    spend: round(totals.spend),
    impressions: Math.round(totals.impressions),
    clicks: Math.round(totals.clicks),
    ctr:
      totals.impressions > 0
        ? round((totals.clicks / totals.impressions) * 100)
        : 0,
    cpc: totals.clicks > 0 ? round(totals.spend / totals.clicks) : 0,
    conversions: round(totals.conversions),
    conversion_value: round(totals.conversion_value),
    roas:
      totals.spend > 0 ? round(totals.conversion_value / totals.spend) : 0,
  }));
}

export async function fetchAllBreakdowns(args: {
  adAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  campaignFilter?: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<BreakdownData> {
  const [placementRows, demographicRows, adRows, deviceRows] =
    await Promise.all([
      fetchInsightsWithBreakdowns({
        ...args,
        breakdowns: "publisher_platform,platform_position",
      }),
      fetchInsightsWithBreakdowns({
        ...args,
        breakdowns: "age,gender",
      }),
      fetchInsightsWithBreakdowns({
        ...args,
        breakdowns: "ad_format_asset",
      }),
      fetchInsightsWithBreakdowns({
        ...args,
        breakdowns: "device_platform",
      }),
    ]);

  return {
    placements: buildPlacementBreakdowns(placementRows),
    demographics: buildDemographicBreakdowns(demographicRows),
    formats: buildFormatBreakdowns(adRows),
    devices: buildDeviceBreakdowns(deviceRows),
  };
}
