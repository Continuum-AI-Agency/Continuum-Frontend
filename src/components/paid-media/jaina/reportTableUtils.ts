import type { SoTReport } from "@/lib/jaina/schemas";

type ReportTable = SoTReport["sections"][number]["tables"][number];

const TIMELINE_LABEL_HINTS = [
  "date",
  "time",
  "day",
  "week",
  "month",
  "quarter",
  "year",
  "hour",
];

function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") return value;
  return String(value);
}

function isTimelineLikeValue(value: unknown): boolean {
  if (typeof value === "number") {
    // Likely unix timestamp in seconds or milliseconds.
    return value > 1000000000;
  }

  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (
    /^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed) ||
    /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(trimmed) ||
    /^Q[1-4]\s+\d{4}$/i.test(trimmed)
  ) {
    return true;
  }

  const parsed = Date.parse(trimmed);
  return !Number.isNaN(parsed);
}

function collectReportGraphs(report: SoTReport): any[] {
  const topLevelGraphs = Array.isArray(report.graphs) ? report.graphs : [];
  const sectionGraphs = report.sections.flatMap((section) =>
    Array.isArray(section.graphs) ? section.graphs : []
  );
  return [...topLevelGraphs, ...sectionGraphs];
}

export function hasTimelineCharts(report: SoTReport): boolean {
  const graphs = collectReportGraphs(report);

  return graphs.some((graph) => {
    const type = String(graph?.type ?? "").toLowerCase();
    if (type === "line" || type === "area") {
      return true;
    }

    const xAxisLabel = String(graph?.x_axis_label ?? "").toLowerCase();
    if (TIMELINE_LABEL_HINTS.some((hint) => xAxisLabel.includes(hint))) {
      return true;
    }

    const dataPoints = Array.isArray(graph?.data) ? graph.data : [];
    if (
      dataPoints.some((point: Record<string, unknown>) =>
        isTimelineLikeValue(point?.label ?? point?.x)
      )
    ) {
      return true;
    }

    const series = Array.isArray(graph?.series) ? graph.series : [];
    return series.some((entry: Record<string, unknown>) => {
      const points = Array.isArray(entry?.data) ? entry.data : [];
      return points.some((point: Record<string, unknown>) =>
        isTimelineLikeValue(point?.x)
      );
    });
  });
}

function buildSnapshotMetricsTable(report: SoTReport): ReportTable | null {
  if (!Array.isArray(report.performance_snapshot) || report.performance_snapshot.length === 0) {
    return null;
  }

  const headers = ["Metric", "Value", "Change", "Direction", "Context"];
  const rows = report.performance_snapshot.map((item) => [
    toDisplayString(item.metric),
    toDisplayString(item.value),
    toDisplayString(item.change),
    toDisplayString(item.direction),
    toDisplayString(item.context ?? item.sub_label),
  ]);

  const nonEmptyColumnIndexes = headers
    .map((_, index) => index)
    .filter((index) => rows.some((row) => row[index].trim().length > 0));

  return {
    headers: nonEmptyColumnIndexes.map((index) => headers[index]),
    rows: rows.map((row) => nonEmptyColumnIndexes.map((index) => row[index])),
  };
}

function buildGraphDataTables(report: SoTReport): ReportTable[] {
  const graphs = collectReportGraphs(report);
  const tables: ReportTable[] = [];

  for (const graph of graphs) {
    const title = String(graph?.title ?? "Snapshot");
    const xHeader = String(graph?.x_axis_label ?? "Label");

    if (Array.isArray(graph?.data) && graph.data.length > 0) {
      tables.push({
        headers: ["Chart", xHeader, "Value"],
        rows: graph.data.map((point: Record<string, unknown>) => [
          title,
          toDisplayString(point?.label ?? point?.x),
          toDisplayString(point?.value ?? point?.y),
        ]),
      });
      continue;
    }

    if (Array.isArray(graph?.series) && graph.series.length > 0) {
      const xValues = new Set<string>();
      graph.series.forEach((seriesEntry: Record<string, unknown>) => {
        const points = Array.isArray(seriesEntry?.data) ? seriesEntry.data : [];
        points.forEach((point: Record<string, unknown>) => {
          xValues.add(toDisplayString(point?.x));
        });
      });

      const sortedXValues = Array.from(xValues);
      const seriesNames = graph.series.map((seriesEntry: Record<string, unknown>) =>
        toDisplayString(seriesEntry?.name) || "Series"
      );

      tables.push({
        headers: ["Chart", xHeader, ...seriesNames],
        rows: sortedXValues.map((xValue) => {
          const values = graph.series.map((seriesEntry: Record<string, unknown>) => {
            const points = Array.isArray(seriesEntry?.data) ? seriesEntry.data : [];
            const point = points.find(
              (candidate: Record<string, unknown>) => toDisplayString(candidate?.x) === xValue
            );
            return toDisplayString(point?.y ?? point?.value);
          });
          return [title, xValue, ...values];
        }),
      });
    }
  }

  return tables.filter((table) => table.rows.length > 0);
}

export function buildJitSnapshotFallbackTables(report: SoTReport): ReportTable[] {
  if (hasTimelineCharts(report)) {
    return [];
  }

  const tables: ReportTable[] = [];
  const metricsTable = buildSnapshotMetricsTable(report);
  if (metricsTable && metricsTable.rows.length > 0) {
    tables.push(metricsTable);
  }
  tables.push(...buildGraphDataTables(report));

  const seen = new Set<string>();
  return tables.filter((table) => {
    const key = JSON.stringify(table);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
