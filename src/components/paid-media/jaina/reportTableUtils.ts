import type { FrontendCheckpointReport } from "@/lib/jaina/schemas";

type ReportTable = {
  headers: string[];
  rows: string[][];
};

type GraphRecord = Record<string, unknown>;

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

function asRecord(value: unknown): GraphRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as GraphRecord)
    : null;
}

function asRecordArray(value: unknown): GraphRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item): item is GraphRecord => Boolean(item));
}

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

function collectReportGraphs(report: FrontendCheckpointReport): GraphRecord[] {
  const topLevelGraphs = Array.isArray(report.graphs)
    ? report.graphs
        .map((graph) => asRecord(graph))
        .filter((graph): graph is GraphRecord => Boolean(graph))
    : [];
  const sectionGraphs = report.sections.flatMap((section) =>
    Array.isArray(section.graphs)
      ? section.graphs
          .map((graph) => asRecord(graph))
          .filter((graph): graph is GraphRecord => Boolean(graph))
      : []
  );
  return [...topLevelGraphs, ...sectionGraphs];
}

function resolveGraphType(graph: GraphRecord): string {
  return toDisplayString(graph.type ?? graph.graph_type ?? graph.chart_type)
    .toLowerCase()
    .trim();
}

function resolveGraphXHeader(graph: GraphRecord): string {
  const explicit = toDisplayString(graph.x_axis_label).trim();
  if (explicit) return explicit;
  const labels = Array.isArray(graph.labels) ? graph.labels : [];
  const hasTimelineLabel = labels.some((label) => isTimelineLikeValue(label));
  return hasTimelineLabel ? "Date" : "Label";
}

function extractGraphLabels(graph: GraphRecord): string[] {
  if (!Array.isArray(graph.labels)) return [];
  return graph.labels.map((label) => toDisplayString(label));
}

function extractTimelineCandidates(graph: GraphRecord): unknown[] {
  const values: unknown[] = [];
  values.push(...extractGraphLabels(graph));

  const dataPoints = asRecordArray(graph.data);
  for (const point of dataPoints) {
    values.push(point.label ?? point.x);
  }

  const series = asRecordArray(graph.series);
  for (const seriesEntry of series) {
    const points = asRecordArray(seriesEntry.data);
    for (const point of points) {
      values.push(point.x ?? point.label);
    }
  }

  return values;
}

export function hasTimelineCharts(report: FrontendCheckpointReport): boolean {
  const graphs = collectReportGraphs(report);

  return graphs.some((graph) => {
    const type = resolveGraphType(graph);
    if (type === "line" || type === "area") {
      return true;
    }

    const xAxisLabel = toDisplayString(graph.x_axis_label).toLowerCase();
    if (TIMELINE_LABEL_HINTS.some((hint) => xAxisLabel.includes(hint))) {
      return true;
    }

    const timelineCandidates = extractTimelineCandidates(graph);
    return timelineCandidates.some((candidate) => isTimelineLikeValue(candidate));
  });
}

function buildSnapshotMetricsTable(report: FrontendCheckpointReport): ReportTable | null {
  if (!Array.isArray(report.performance_snapshot) || report.performance_snapshot.length === 0) {
    return null;
  }

  const headers = ["Metric", "Value", "Change", "Direction", "Context"];
  const rows = report.performance_snapshot.map((item) => {
    const metric = (item ?? {}) as Record<string, unknown>;
    return [
      toDisplayString(metric.metric),
      toDisplayString(metric.value),
      toDisplayString(metric.change),
      toDisplayString(metric.direction),
      toDisplayString(metric.context ?? metric.sub_label),
    ];
  });

  const nonEmptyColumnIndexes = headers
    .map((_, index) => index)
    .filter((index) => rows.some((row) => row[index].trim().length > 0));

  return {
    headers: nonEmptyColumnIndexes.map((index) => headers[index]),
    rows: rows.map((row) => nonEmptyColumnIndexes.map((index) => row[index])),
  };
}

function buildGraphDataTables(report: FrontendCheckpointReport): ReportTable[] {
  const graphs = collectReportGraphs(report);
  const tables: ReportTable[] = [];

  for (const graph of graphs) {
    const title = toDisplayString(graph.title) || "Snapshot";
    const xHeader = resolveGraphXHeader(graph);

    const labels = extractGraphLabels(graph);
    const datasets = asRecordArray(graph.datasets);
    const indexedDatasets = datasets
      .map((entry, index) => {
        const data = Array.isArray(entry.data) ? entry.data : [];
        return {
          name: toDisplayString(entry.label) || `Series ${index + 1}`,
          values: data,
        };
      })
      .filter((entry) => entry.values.length > 0);

    const indexedSeries = asRecordArray(graph.series)
      .map((entry, index) => {
        const values = Array.isArray(entry.values) ? entry.values : [];
        return {
          name: toDisplayString(entry.name) || `Series ${index + 1}`,
          values,
        };
      })
      .filter((entry) => entry.values.length > 0);

    const indexedColumns = indexedDatasets.length > 0 ? indexedDatasets : indexedSeries;
    if (labels.length > 0 && indexedColumns.length > 0) {
      tables.push({
        headers: ["Chart", xHeader, ...indexedColumns.map((entry) => entry.name)],
        rows: labels.map((label, labelIndex) => [
          title,
          label,
          ...indexedColumns.map((entry) => toDisplayString(entry.values[labelIndex])),
        ]),
      });
      continue;
    }

    const dataPoints = asRecordArray(graph.data);
    if (dataPoints.length > 0) {
      tables.push({
        headers: ["Chart", xHeader, "Value"],
        rows: dataPoints.map((point) => [
          title,
          toDisplayString(point.label ?? point.x ?? point.name),
          toDisplayString(point.value ?? point.y),
        ]),
      });
      continue;
    }

    const series = asRecordArray(graph.series).filter((entry) =>
      Array.isArray(entry.data)
    );
    if (series.length > 0) {
      const xValues = new Set<string>();
      series.forEach((seriesEntry) => {
        const points = asRecordArray(seriesEntry.data);
        points.forEach((point) => {
          xValues.add(toDisplayString(point.x));
        });
      });

      const sortedXValues = Array.from(xValues);
      const seriesNames = series.map((seriesEntry) =>
        toDisplayString(seriesEntry.name) || "Series"
      );

      tables.push({
        headers: ["Chart", xHeader, ...seriesNames],
        rows: sortedXValues.map((xValue) => {
          const values = series.map((seriesEntry) => {
            const points = asRecordArray(seriesEntry.data);
            const point = points.find(
              (candidate) => toDisplayString(candidate.x) === xValue
            );
            return toDisplayString(point?.y ?? point?.value ?? point?.x);
          });
          return [title, xValue, ...values];
        }),
      });
    }
  }

  return tables.filter((table) => table.rows.length > 0);
}

export function buildJitSnapshotFallbackTables(report: FrontendCheckpointReport): ReportTable[] {
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
