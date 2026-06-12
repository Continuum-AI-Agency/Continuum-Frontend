import { describe, expect, it } from "bun:test";

import {
  analysisDatasetSchema,
  datasetCreativeRefSchema,
  jainaCreativePreviewRequestSchema,
  jainaCreativePreviewResponseSchema,
} from "./dataset";

const baseHeader = {
  dataset_id: "ds_spend_acct_30d",
  metric_keys: ["spend", "impressions"],
  entity: { type: "account", id: "act_123", label: "Easy Fit" },
  period: { since: "2026-05-11", until: "2026-06-10" },
  currency: { code: "MXN", symbol: "$" },
  source: { tool: "get_trend_metrics", cache_key: "abc", fetched_at: "2026-06-10T00:00:00Z" },
};

describe("analysisDatasetSchema", () => {
  it("parses a time_series dataset and keeps per-point timestamps + values", () => {
    const parsed = analysisDatasetSchema.parse({
      kind: "time_series",
      ...baseHeader,
      points: [
        { ts: "2026-05-11", values: { spend: 100, impressions: 5000 } },
        { ts: "2026-05-12", values: { spend: 120, impressions: 5200 }, meta: { campaign_id: "c1" } },
      ],
    });

    expect(parsed.kind).toBe("time_series");
    if (parsed.kind === "time_series") {
      expect(parsed.points).toHaveLength(2);
      expect(parsed.points[0].ts).toBe("2026-05-11");
      expect(parsed.points[1].meta).toEqual({ campaign_id: "c1" });
    }
  });

  it("parses a table dataset with per-row metadata", () => {
    const parsed = analysisDatasetSchema.parse({
      kind: "table",
      ...baseHeader,
      columns: [
        { key: "campaign", label: "Campaign", format: "text" },
        { key: "spend", label: "Spend", format: "currency" },
      ],
      rows: [
        { cells: { campaign: "Camacho", spend: 84274 }, meta: { entity_id: "c1", creative: { creative_id: "cr1" } } },
      ],
    });

    expect(parsed.kind).toBe("table");
    if (parsed.kind === "table") {
      expect(parsed.rows[0].cells.spend).toBe(84274);
      expect(parsed.rows[0].meta).toMatchObject({ entity_id: "c1" });
    }
  });

  it("parses a scalar_group dataset", () => {
    const parsed = analysisDatasetSchema.parse({
      kind: "scalar_group",
      ...baseHeader,
      metrics: [{ key: "spend", value: 84274, unit: "MXN", format: "currency" }],
    });
    expect(parsed.kind).toBe("scalar_group");
  });

  it("rejects an unknown dataset kind", () => {
    expect(
      analysisDatasetSchema.safeParse({ kind: "pie_in_the_sky", ...baseHeader }).success,
    ).toBe(false);
  });

  it("requires a dataset_id", () => {
    const { dataset_id: _omit, ...noId } = baseHeader;
    expect(
      analysisDatasetSchema.safeParse({ kind: "time_series", ...noId, points: [] }).success,
    ).toBe(false);
  });
});

describe("datasetCreativeRefSchema", () => {
  it("accepts a partial ref and defaults missing handles to null", () => {
    const ref = datasetCreativeRefSchema.parse({ creative_id: "cr1", ad_id: "ad9" });
    expect(ref.creative_id).toBe("cr1");
    expect(ref.asset_id).toBeNull();
    expect(ref.bucket).toBeNull();
  });

  it("carries brand + account context for lazy preview resolution", () => {
    const ref = datasetCreativeRefSchema.parse({ ad_id: "ad9", ad_account_id: "act_1", brand_id: "b1" });
    expect(ref.ad_account_id).toBe("act_1");
    expect(ref.brand_id).toBe("b1");
    // Default to null when omitted (back-compat with older refs).
    expect(datasetCreativeRefSchema.parse({ ad_id: "ad9" }).ad_account_id).toBeNull();
  });
});

describe("jainaCreativePreview envelope", () => {
  it("requires brand_id + ad_account_id and defaults the creative/ad ids to null", () => {
    const req = jainaCreativePreviewRequestSchema.parse({ brand_id: "b1", ad_account_id: "act_1", ad_id: "ad9" });
    expect(req.ad_id).toBe("ad9");
    expect(req.creative_id).toBeNull();
    expect(req.ad_format).toBe("DESKTOP_FEED_STANDARD");
    expect(jainaCreativePreviewRequestSchema.safeParse({ ad_account_id: "act_1" }).success).toBe(false);
  });

  it("parses a preview response with nullable image fields", () => {
    const res = jainaCreativePreviewResponseSchema.parse({ thumbnail_url: "https://x/t.jpg", creative_id: "cr1" });
    expect(res.thumbnail_url).toBe("https://x/t.jpg");
    expect(res.image_url).toBeNull();
    expect(res.preview_iframe).toBeNull();
  });
});
