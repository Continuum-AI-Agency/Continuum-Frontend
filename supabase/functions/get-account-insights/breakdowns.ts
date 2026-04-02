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
  log: (msg: string, extra?: unknown) => void;
}): Promise<InsightRow[]> {
  const url = `https://graph.facebook.com/v23.0/act_${args.adAccountId}/insights`;
  const params = new URLSearchParams({
    fields:
      "spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type",
    time_range: JSON.stringify({ since: args.since, until: args.until }),
    breakdowns: args.breakdowns,
    level: args.level ?? "account",
    access_token: args.accessToken,
    limit: "500",
  });

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

function inferFormat(row: InsightRow): string {
  const adName = String(row.ad_name ?? "").toLowerCase();
  const objectType = String(row.object_type ?? "").toLowerCase();
  const formatAsset = String(row.ad_format_asset ?? "").toLowerCase();

  if (formatAsset.includes("video") || objectType === "video" || adName.includes("video") || adName.includes("reel")) {
    return "video";
  }
  if (formatAsset.includes("carousel") || objectType === "carousel" || adName.includes("carousel") || adName.includes("dpa")) {
    return "carousel";
  }
  if (formatAsset.includes("collection") || objectType === "collection" || adName.includes("collection")) {
    return "collection";
  }
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
        level: "ad",
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
