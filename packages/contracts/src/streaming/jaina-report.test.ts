import { describe, expect, it } from "bun:test";

import {
  checkpointBlockV2LenientSchema,
  checkpointBlockV2Schema,
  chartBlockSchema,
  dataTableBlockSchema,
  degradeToNarrativeBlockV2,
  narrativeBlockSchema,
} from "./jaina-report";

describe("checkpointBlockV2LenientSchema", () => {
  it("accepts a partial chart block that the strict schema rejects", () => {
    // Missing chart_config / category_key not on rows — violates the strict
    // chart-renderability invariants, so the strict schema must reject it.
    const partialChart = {
      block_id: "b1",
      category: "chart",
      scope: "account",
      title: "Spend over time",
      chart_type: "line",
      data: [{ day: "Mon", spend: 10 }],
      category_key: "date",
    };

    expect(checkpointBlockV2Schema.safeParse(partialChart).success).toBe(false);
    expect(checkpointBlockV2LenientSchema.safeParse(partialChart).success).toBe(true);
  });

  it("rejects an object without a valid V2 category", () => {
    expect(checkpointBlockV2LenientSchema.safeParse({ category: "legacy_graph" }).success).toBe(
      false,
    );
    expect(checkpointBlockV2LenientSchema.safeParse({ title: "no category" }).success).toBe(false);
  });
});

describe("dataset-ref additive fields", () => {
  const validChart = {
    block_id: "c1",
    category: "chart",
    scope: "account",
    title: "Spend over time",
    chart_type: "line",
    data: [
      { date: "2026-05-11", spend: 100 },
      { date: "2026-05-12", spend: 120 },
    ],
    chart_config: { spend: { label: "Spend", color: "#000" } },
    category_key: "date",
  };

  it("defaults dataset_id and data_meta to null when absent (back-compat)", () => {
    const parsed = chartBlockSchema.parse(validChart);
    expect(parsed.dataset_id).toBeNull();
    expect(parsed.data_meta).toBeNull();
  });

  it("carries dataset_id + per-point data_meta on a chart block", () => {
    const parsed = chartBlockSchema.parse({
      ...validChart,
      dataset_id: "ds_spend_acct_30d",
      data_meta: [
        { date: "2026-05-11", campaign_id: "c1" },
        { date: "2026-05-12", campaign_id: "c1" },
      ],
    });
    expect(parsed.dataset_id).toBe("ds_spend_acct_30d");
    expect(parsed.data_meta?.[0]).toMatchObject({ campaign_id: "c1" });
  });

  it("accepts a data_table column with format 'creative' + dataset_id + row_meta", () => {
    const parsed = dataTableBlockSchema.parse({
      block_id: "t1",
      category: "data_table",
      scope: "campaign",
      title: "Top creatives",
      columns: [
        { key: "creative", label: "Creative", format: "creative" },
        { key: "spend", label: "Spend", format: "currency" },
      ],
      rows: [{ creative: "Ad 1", spend: 1000 }],
      dataset_id: "ds_creatives",
      row_meta: [{ creative: { creative_id: "cr1", ad_id: "ad9" }, entity_id: "c1" }],
    });
    expect(parsed.dataset_id).toBe("ds_creatives");
    expect(parsed.columns[0].format).toBe("creative");
    expect(parsed.row_meta?.[0]).toMatchObject({ entity_id: "c1" });
  });
});

describe("degradeToNarrativeBlockV2", () => {
  it("turns an unsalvageable block into a valid narrative placeholder", () => {
    const degraded = degradeToNarrativeBlockV2({
      block_id: "chart_7",
      category: "chart",
      scope: "campaign",
      title: "Broken chart",
      data: "not an array",
    });

    expect(narrativeBlockSchema.safeParse(degraded).success).toBe(true);
    expect(degraded.category).toBe("narrative");
    expect(degraded.block_id).toBe("chart_7");
    expect(degraded.scope).toBe("campaign");
    expect(degraded.title).toBe("Broken chart");
    expect(degraded.body).toContain("could not be rendered");
  });

  it("fills sane defaults when fields are missing", () => {
    const degraded = degradeToNarrativeBlockV2(null);
    expect(narrativeBlockSchema.safeParse(degraded).success).toBe(true);
    expect(degraded.scope).toBe("account");
    expect(degraded.title).toBe("Section unavailable");
  });
});
