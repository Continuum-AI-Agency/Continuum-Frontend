export const DASHBOARD_LOADER_TOTAL_DURATION_MS = 3000;

export function getDashboardLoaderCycleDurationMs(
  phraseCount: number,
  totalDurationMs: number = DASHBOARD_LOADER_TOTAL_DURATION_MS
): number {
  if (phraseCount <= 0) {
    return totalDurationMs;
  }

  const rawDuration = Math.floor(totalDurationMs / phraseCount);
  return Math.max(1, rawDuration);
}
