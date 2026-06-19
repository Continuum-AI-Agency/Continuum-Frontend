import { describe, expect, it } from "bun:test";
import type { PaidRankedEntity } from "@continuum/contracts";

import { kpiLabel, kpiUnit, metricForKpi, sortEntitiesByKpi } from "./paid-kpi";

function entity(id: string, metrics: Partial<PaidRankedEntity["metrics"]>, kpiValue = 0): PaidRankedEntity {
  return {
    id,
    name: id,
    metrics: metrics as PaidRankedEntity["metrics"],
    rank: 0,
    kpi: "roas",
    kpi_value: kpiValue,
    kpi_unit: "multiplier",
  };
}

const rows: PaidRankedEntity[] = [
  entity("a", { spend: 100, ctr: 2.0, cpc: 0.9, conversionValue: 500 }, 3.0),
  entity("b", { spend: 300, ctr: 1.0, cpc: 0.4, conversionValue: 200 }, 2.0),
  entity("c", { spend: 50, ctr: 3.5, cpc: 1.8, conversionValue: 900 }, 5.0),
];

describe("metricForKpi", () => {
  it("reads the camelCase metric for a snake_case KPI", () => {
    expect(metricForKpi(rows[0], "conversions_value")).toBe(500);
    expect(metricForKpi(rows[1], "cpc")).toBe(0.4);
  });

  it("falls back to kpi_value for roas when metrics.roas is absent", () => {
    expect(metricForKpi(rows[2], "roas")).toBe(5.0);
  });

  it("returns undefined for a missing metric", () => {
    expect(metricForKpi(rows[0], "cpm")).toBeUndefined();
  });
});

describe("sortEntitiesByKpi", () => {
  it("sorts higher-is-better KPIs descending", () => {
    expect(sortEntitiesByKpi(rows, "spend").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortEntitiesByKpi(rows, "roas").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts cost KPIs ascending (lower is better)", () => {
    expect(sortEntitiesByKpi(rows, "cpc").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("pushes entities missing the metric to the end", () => {
    const withMissing = [entity("x", {}), entity("y", { spend: 10 })];
    expect(sortEntitiesByKpi(withMissing, "spend").map((r) => r.id)).toEqual(["y", "x"]);
  });

  it("does not mutate the input array", () => {
    const input = [...rows];
    sortEntitiesByKpi(input, "spend");
    expect(input.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("kpi metadata", () => {
  it("maps unit and label", () => {
    expect(kpiUnit("roas")).toBe("multiplier");
    expect(kpiUnit("spend")).toBe("currency");
    expect(kpiLabel("conversions_value")).toBe("Conv. value");
  });
});
