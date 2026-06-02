import { describe, expect, it } from "bun:test";

import {
  checkpointBlockV2LenientSchema,
  checkpointBlockV2Schema,
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
