import type { ActionLog, ActionStatus } from "@/lib/types/dco";
import type {
  ObservabilityChartMarker,
  ObservabilityChartPoint,
} from "./ObservabilityLightweightChart";

export type MarkerResolution = "daily" | "hourly";
export type MarkerViewLayer = "campaign" | "adset" | "ad";

type MarkerMappingOptions = {
  maxMarkers?: number;
  viewLayer?: MarkerViewLayer;
};

function toBucket(timestamp: string, resolution: MarkerResolution): string {
  if (resolution === "daily") {
    return timestamp.slice(0, 10);
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  parsed.setMinutes(0, 0, 0);
  return parsed.toISOString();
}

const ACTION_STATUS_COLOR: Record<ActionStatus, string> = {
  APPROVED: "#0ea5e9",
  FAILED: "#ef4444",
  PENDING: "#f59e0b",
  SUCCESS: "#10b981",
  EXECUTED: "#0ea5e9",
  REJECTED: "#ef4444",
};

const ACTION_STATUS_WEIGHT: Record<ActionStatus, number> = {
  FAILED: 4,
  REJECTED: 3,
  PENDING: 2,
  APPROVED: 1,
  SUCCESS: 0,
  EXECUTED: 0,
};

function toUtcTimestamp(isoDate: string): number | null {
  const ms = Date.parse(isoDate);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

function pointBucket(pointTime: number, resolution: MarkerResolution): string {
  const iso = new Date(Number(pointTime) * 1000).toISOString();
  return toBucket(iso, resolution);
}

function describeActionLog(log: ActionLog): string {
  if (log.error) return log.error;
  if (log.decisionNote) return log.decisionNote;

  const changed = Object.entries(log.paramsChanged ?? {});
  if (changed.length > 0) {
    const [key, value] = changed[0];
    return `${key}: ${String(value)}`;
  }

  return `${log.actionType} on ${log.scopeType.toLowerCase()} scope`;
}

function normalizeMarkerTime(
  log: ActionLog,
  points: ObservabilityChartPoint[],
  resolution: MarkerResolution
): number | null {
  if (points.length === 0) return null;

  const actionTimestamp = toUtcTimestamp(log.occurredAt);
  if (!actionTimestamp) return null;

  const targetBucket = toBucket(log.occurredAt, resolution);
  const bucketPoints = points.filter((point) => pointBucket(point.time, resolution) === targetBucket);
  const candidates = bucketPoints.length > 0 ? bucketPoints : points;

  let nearest: ObservabilityChartPoint | undefined;
  let nearestDelta = Number.POSITIVE_INFINITY;
  candidates.forEach((point) => {
    const delta = Math.abs(Number(point.time) - Number(actionTimestamp));
    if (delta < nearestDelta) {
      nearest = point;
      nearestDelta = delta;
    }
  });

  return nearest?.time ?? null;
}

function strongestStatus(logs: ActionLog[]): ActionStatus {
  return [...logs].sort((left, right) => {
    return ACTION_STATUS_WEIGHT[right.status] - ACTION_STATUS_WEIGHT[left.status];
  })[0]?.status ?? "SUCCESS";
}

function matchesViewLayer(scopeType: ActionLog["scopeType"], viewLayer: MarkerViewLayer): boolean {
  if (viewLayer === "campaign") return scopeType === "CAMPAIGN";
  if (viewLayer === "adset") return scopeType === "ADSET";
  return scopeType === "AD";
}

export function mapActionLogsToTimelineMarkers(
  logs: ActionLog[],
  points: ObservabilityChartPoint[],
  resolution: MarkerResolution,
  options: number | MarkerMappingOptions = {}
): ObservabilityChartMarker[] {
  if (logs.length === 0 || points.length === 0) return [];

  const normalizedOptions = typeof options === "number" ? { maxMarkers: options } : options;
  const maxMarkers = normalizedOptions.maxMarkers ?? 36;
  const viewLayer = normalizedOptions.viewLayer ?? "campaign";

  const grouped = new Map<
    string,
    {
      time: number;
      scopeType: ActionLog["scopeType"];
      position: ObservabilityChartMarker["position"];
      logs: ActionLog[];
    }
  >();

  logs
    .slice()
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
    .forEach((log) => {
      const markerTime = normalizeMarkerTime(log, points, resolution);
      if (!markerTime) return;
      const position = matchesViewLayer(log.scopeType, viewLayer) ? "aboveBar" : "belowBar";

      const key = `${markerTime}:${log.scopeType}:${position}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.logs.push(log);
        return;
      }

      grouped.set(key, {
        time: markerTime,
        scopeType: log.scopeType,
        position,
        logs: [log],
      });
    });

  return Array.from(grouped.values())
    .sort((left, right) => left.time - right.time)
    .slice(-maxMarkers)
    .map((group) => {
      const status = strongestStatus(group.logs);
      const color = ACTION_STATUS_COLOR[status];
      const count = group.logs.length;
      const latest = group.logs[group.logs.length - 1];
      const uniqueActions = Array.from(new Set(group.logs.map((item) => item.actionType)));
      const scopeRef =
        latest.scopeType === "CAMPAIGN"
          ? latest.metaCampaignId ?? latest.scopeId
          : latest.scopeType === "ADSET"
            ? latest.metaAdsetId ?? latest.scopeId
            : latest.scopeType === "AD"
              ? latest.metaAdId ?? latest.scopeId
            : latest.scopeId;
      const campaignId =
        latest.metaCampaignId ??
        (latest.scopeType === "CAMPAIGN" && latest.scopeId ? latest.scopeId : null);
      const adSetId =
        latest.metaAdsetId ??
        (latest.scopeType === "ADSET" && latest.scopeId ? latest.scopeId : null);
      const adId =
        latest.metaAdId ??
        (latest.scopeType === "AD" && latest.scopeId ? latest.scopeId : null);

      return {
        id: `marker:${group.scopeType}:${group.time}`,
        time: group.time as ObservabilityChartMarker["time"],
        label: `${latest.scopeType} · ${count} action${count > 1 ? "s" : ""} · ${status}`,
        detail: `${new Date(latest.occurredAt).toLocaleString("en-US")} · ${scopeRef}\n${uniqueActions
          .slice(0, 3)
          .join(", ")}\n${describeActionLog(latest)}`,
        color,
        shape: "square",
        position: group.position,
        scopeType: latest.scopeType,
        scopeId: latest.scopeId,
        campaignId,
        adSetId,
        adId,
        actionCount: count,
        status,
      };
    });
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
