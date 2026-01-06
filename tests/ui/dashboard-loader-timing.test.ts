import { expect, test } from "bun:test";

import { DEFAULT_LOADING_PHRASES } from "@/lib/ui/loadingPhrases";
import {
  DASHBOARD_LOADER_TOTAL_DURATION_MS,
  getDashboardLoaderCycleDurationMs,
} from "@/lib/ui/dashboardLoaderTiming";

test("Dashboard loader cycle duration matches total duration across phrases", () => {
  const cycleDuration = getDashboardLoaderCycleDurationMs(DEFAULT_LOADING_PHRASES.length);
  expect(cycleDuration * DEFAULT_LOADING_PHRASES.length).toBe(DASHBOARD_LOADER_TOTAL_DURATION_MS);
});

test("Dashboard loader cycle duration falls back to total duration with no phrases", () => {
  expect(getDashboardLoaderCycleDurationMs(0)).toBe(DASHBOARD_LOADER_TOTAL_DURATION_MS);
});

test("Dashboard loader cycle duration floors evenly", () => {
  expect(getDashboardLoaderCycleDurationMs(4, 3000)).toBe(750);
});
