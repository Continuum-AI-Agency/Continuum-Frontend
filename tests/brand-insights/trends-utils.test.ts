import assert from "node:assert/strict";
import test from "node:test";

import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";
import { filterAndSortTrends, getUniqueSources } from "@/components/brand-insights/trends-utils.ts";

const trends: BrandInsightsTrend[] = [
  {
    id: "t1",
    title: "AI Personalization",
    description: "Hyper-tailored content",
    relevanceToBrand: "Matches current push",
    source: "Forrester",
    isSelected: true,
    timesUsed: 2,
  },
  {
    id: "t2",
    title: "Sustainability",
    description: "Green ops",
    relevanceToBrand: "",
    source: "mcKinsey",
    isSelected: false,
    timesUsed: 5,
  },
  {
    id: "t3",
    title: "AI personalization abroad",
    description: "EMEA pilots",
    relevanceToBrand: "",
    source: "FORRESTER",
    isSelected: false,
    timesUsed: 1,
  },
];

test("getUniqueSources preserves first casing while deduping", () => {
  const sources = getUniqueSources(trends);
  assert.deepEqual(sources, ["Forrester", "mcKinsey"]);
});

test("filterAndSortTrends filters by query, selection, and source case-insensitively", () => {
  const result = filterAndSortTrends(trends, {
    query: "personalization",
    onlySelected: false,
    sourceFilter: "forrester",
  });

  assert.equal(result.length, 2);
  assert.ok(result.every((trend) => trend.id !== "t2"));
});

test("filterAndSortTrends sorts selected first then usage then title", () => {
  const result = filterAndSortTrends(trends, { query: "", sourceFilter: "all", onlySelected: false });

  assert.equal(result[0].id, "t1", "selected trend should rank first");
  assert.equal(result[1].id, "t2", "higher timesUsed should come next");
  assert.equal(result[2].id, "t3");
});

test("filterAndSortTrends respects selected-only toggle", () => {
  const result = filterAndSortTrends(trends, { onlySelected: true, query: "", sourceFilter: "all" });
  assert.deepEqual(result.map((t) => t.id), ["t1"]);
});

