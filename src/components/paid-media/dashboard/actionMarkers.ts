export type MarkerResolution = "daily" | "hourly";

function toBucket(timestamp: string, resolution: MarkerResolution): string {
  if (resolution === "daily") {
    return timestamp.slice(0, 10);
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  parsed.setMinutes(0, 0, 0);
  return parsed.toISOString();
}

export function calculateImmediateKpiShiftPct(
  rows: Array<{ timestamp: string; value: number }>,
  resolution: MarkerResolution,
  bucket: string
): number | null {
  if (rows.length < 2) return null;

  const markerIndex = rows.findIndex((row) => toBucket(row.timestamp, resolution) === bucket);
  if (markerIndex < 0 || markerIndex + 1 >= rows.length) return null;

  const baseline = rows[markerIndex]?.value;
  const next = rows[markerIndex + 1]?.value;
  if (!Number.isFinite(baseline) || !Number.isFinite(next) || baseline === 0) return null;

  return ((next - baseline) / Math.abs(baseline)) * 100;
}
