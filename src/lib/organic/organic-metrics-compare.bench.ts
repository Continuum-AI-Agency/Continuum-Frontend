// Bench for organic multi-account blend + series modes (no browser).
//
// Drives the REAL pure path behind Compare: fixture accounts shaped like
// loadBrandOrganicSnapshot results → blendMetric / buildSeriesSet. Asserts:
//   1) Default lowest level is account (decompose)
//   2) Single-account Blend is identity (same totals/trends as that account)
//   3) Multi-account platform blend sums summable metrics
//
//   bun run Continuum-Frontend/src/lib/organic/organic-metrics-compare.bench.ts
//
// Headless browser inspection of the mounted UI is a separate Playwright spec:
//   Continuum-Frontend/e2e/organic-metrics-compare.spec.ts

import type { SnapshotAccountResult } from "./brandOrganicSnapshot";
import {
  blendMetric,
  buildSeriesSet,
  platformBlendKey,
  type SeriesMode,
} from "./blendAccounts";

let checks = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  checks += 1;
  if (!condition) failures.push(message);
}

function account(
  id: string,
  platform: SnapshotAccountResult["platform"],
  views: number,
  trends: Array<{ date: string; views: number }>,
  previous = views / 2,
): SnapshotAccountResult {
  return {
    status: "ok",
    platform,
    integrationAccountId: id,
    name: id,
    metrics: { views, reach: views * 0.8 },
    comparison: {
      views: {
        current: views,
        previous,
        percentageChange: previous === 0 ? 100 : ((views - previous) / previous) * 100,
      },
    },
    trends,
    range: { preset: "last_7d", since: "2026-07-01", until: "2026-07-08" },
  };
}

const single = account("ig-only", "instagram", 100, [
  { date: "2026-07-01", views: 40 },
  { date: "2026-07-02", views: 60 },
]);

console.log("\n── 1. Single account: decompose is default mental model ──");
{
  const { series } = buildSeriesSet({
    accounts: [single],
    metricId: "views",
    mode: "decompose",
  });
  assert(series.length === 1, "decompose has one account series");
  assert(series[0]?.kind === "account", "series kind is account");
  assert(series[0]?.points[1]?.value === 60, "account day-2 views = 60");
  console.log(`  decompose series: ${series.map((s) => s.label).join(", ")}`);
}

console.log("\n── 2. Single account: Blend still shows that account's metrics ──");
{
  const { series } = buildSeriesSet({
    accounts: [single],
    metricId: "views",
    mode: "blend",
  });
  assert(series.length >= 1, "blend is not empty for one account");
  const platformBlend = series.find((s) => s.kind === "platform_blend");
  assert(Boolean(platformBlend), "platform_blend identity series present");
  assert(platformBlend?.points[1]?.value === 60, "blend day-2 matches account (identity)");
  const selectionBlend = series.find((s) => s.kind === "selection_blend");
  assert(Boolean(selectionBlend), "selection_blend identity series present");
  assert(selectionBlend?.points[1]?.value === 60, "selection blend day-2 identity");
  console.log(`  blend series: ${series.map((s) => `${s.kind}:${s.label}`).join(" | ")}`);
}

console.log("\n── 3. Three Instagram accounts: platform blend sums ──");
{
  const multi = [
    account("ig-a", "instagram", 100, [
      { date: "2026-07-01", views: 10 },
      { date: "2026-07-02", views: 20 },
    ]),
    account("ig-b", "instagram", 50, [
      { date: "2026-07-01", views: 5 },
      { date: "2026-07-02", views: 15 },
    ]),
    account("ig-c", "instagram", 25, [
      { date: "2026-07-01", views: 1 },
      { date: "2026-07-02", views: 4 },
    ]),
  ];
  const blended = blendMetric(multi, "views");
  assert(blended.kind === "sum", "views are summable");
  if (blended.kind === "sum") {
    assert(blended.total === 175, `total views 175 got ${blended.total}`);
    assert(blended.trends.find((t) => t.date === "2026-07-02")?.value === 39, "day-2 sum 39");
  }

  const both = buildSeriesSet({ accounts: multi, metricId: "views", mode: "both" });
  assert(
    both.series.filter((s) => s.kind === "account").length === 3,
    "both: 3 account lines",
  );
  assert(
    both.series.some((s) => s.kind === "platform_blend"),
    "both: platform blend present",
  );
  const key = platformBlendKey("instagram");
  const day2 = both.chartRows.find((r) => r.date === "2026-07-02");
  assert(day2?.[key] === 39, `chart blend day-2 = 39 got ${String(day2?.[key])}`);
  console.log(
    `  both series: ${both.series.map((s) => s.kind).join(", ")} | day2 blend=${String(day2?.[key])}`,
  );
}

console.log("\n── 4. Mode matrix (one account) never empty ──");
{
  const modes: SeriesMode[] = ["decompose", "blend", "both"];
  for (const mode of modes) {
    const { series } = buildSeriesSet({
      accounts: [single],
      metricId: "views",
      mode,
    });
    assert(series.length >= 1, `mode=${mode} produces ≥1 series`);
    console.log(`  mode=${mode} → ${series.length} series (${series.map((s) => s.kind).join(",")})`);
  }
}

console.log("\n────────────────────────────────────────");
console.log(`checks=${checks} failures=${failures.length}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log("BENCH GREEN — organic metrics compare blend path");
process.exit(0);
