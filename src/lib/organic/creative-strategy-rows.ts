// Pure view-model helpers for the "What's Working" (creative strategy) table.
// A CreativeInsight carries parallel exemplars[] (thumbnail/caption/permalink)
// and evidence[] (measured metric + date) arrays keyed by the same refId. These
// helpers join them so each top creative shows its OWN metric, rank the creatives
// by that metric, and flatten each insight into a sortable table row. No React —
// unit-tested directly.

import type {
  CreativeAudience,
  CreativeEvidenceItem,
  CreativeExemplar,
  CreativeInsight,
  CreativeInsightKind,
  CreativeSurface,
} from '@continuum/contracts';

type EvidenceMetric = NonNullable<CreativeEvidenceItem['metric']>;

export type ExemplarView = {
  refId: string;
  kind: CreativeExemplar['kind'];
  surface: CreativeEvidenceItem['surface'] | null;
  thumbnailUrl: string | null;
  snippet: string | null;
  permalinkUrl: string | null;
  metric: EvidenceMetric | null;
  metricValueLabel: string | null;
  metricName: string | null;
  capturedAt: string | null;
};

export type InsightRowView = {
  id: string;
  kind: CreativeInsightKind;
  surface: CreativeSurface;
  label: string;
  description: string;
  recommendation: string;
  confidence: number;
  audienceNote: string | null;
  avgMetricValue: number | null;
  avgMetricLabel: string | null;
  metricName: string | null;
  exemplars: ExemplarView[];
  topPermalink: string | null;
};

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

// One-line audience descriptor, shared by the section header and each row.
export function audienceLine(audience: CreativeAudience | null | undefined): string | null {
  if (!audience) return null;
  if (audience.note) return audience.note;
  const seg = audience.segments[0];
  return seg ? `${seg.label}${seg.sharePct !== null ? ` (${seg.sharePct}%)` : ''}` : null;
}

export function humanizeMetricName(name: string): string {
  return name.replace(/_/g, ' ').trim();
}

// Formats a measured metric for display, honoring its unit. Rates are stored
// 0..1; ratios are multipliers; pct is already a percentage number; counts get
// compacted (12.3K).
export function formatMetricValue(metric: EvidenceMetric | null): string | null {
  if (!metric || !Number.isFinite(metric.value)) return null;
  const { value, unit } = metric;
  switch (unit) {
    case 'pct':
      return `${Math.round(value * 10) / 10}%`;
    case 'rate':
      return `${Math.round(value * 100)}%`;
    case 'ratio':
      return `${value.toFixed(2)}×`;
    default:
      return compactNumber.format(value);
  }
}

function isHttpUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

// The dominant metric across an insight's evidence: mean value + most-common
// name/unit, used both to sort rows and to label the row's average.
function averageMetric(evidence: CreativeEvidenceItem[]): {
  value: number | null;
  name: string | null;
  unit: EvidenceMetric['unit'] | null;
} {
  const metrics = evidence
    .map((item) => item.metric)
    .filter((metric): metric is EvidenceMetric => metric !== null);
  if (metrics.length === 0) return { value: null, name: null, unit: null };
  const sum = metrics.reduce((acc, metric) => acc + metric.value, 0);
  const counts = new Map<string, number>();
  for (const metric of metrics) counts.set(metric.name, (counts.get(metric.name) ?? 0) + 1);
  const name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const unit = metrics.find((metric) => metric.name === name)?.unit ?? metrics[0].unit;
  return { value: sum / metrics.length, name, unit };
}

// Joins an insight's parallel exemplars[] and evidence[] by refId so each top
// creative carries its own measured metric, then ranks them by that metric
// (highest first) — turning anonymous thumbnails into the actual top performers.
export function buildExemplarViews(insight: CreativeInsight): ExemplarView[] {
  const evidenceByRef = new Map<string, CreativeEvidenceItem>();
  for (const item of insight.evidence) {
    if (!evidenceByRef.has(item.refId)) evidenceByRef.set(item.refId, item);
  }
  const views = insight.exemplars.map((exemplar) => {
    const evidence = evidenceByRef.get(exemplar.refId) ?? null;
    const metric = evidence?.metric ?? null;
    return {
      refId: exemplar.refId,
      kind: exemplar.kind,
      surface: evidence?.surface ?? null,
      thumbnailUrl: isHttpUrl(exemplar.thumbnailRef) ? exemplar.thumbnailRef : null,
      snippet: exemplar.snippet,
      permalinkUrl: isHttpUrl(exemplar.permalinkUrl) ? exemplar.permalinkUrl : null,
      metric,
      metricValueLabel: formatMetricValue(metric),
      metricName: metric ? humanizeMetricName(metric.name) : null,
      capturedAt: evidence?.capturedAt ?? null,
    } satisfies ExemplarView;
  });
  return views.sort((a, b) => (b.metric?.value ?? -Infinity) - (a.metric?.value ?? -Infinity));
}

// Flattens an insight into a single sortable table row, precomputing the ranked
// exemplars, the average metric (numeric for sorting + a formatted label), and
// the best available permalink for row actions.
export function toInsightRow(insight: CreativeInsight): InsightRowView {
  const exemplars = buildExemplarViews(insight);
  const avg = averageMetric(insight.evidence);
  const avgMetricLabel =
    avg.value !== null && avg.unit
      ? formatMetricValue({ name: avg.name ?? '', value: avg.value, unit: avg.unit })
      : null;
  return {
    id: insight.id,
    kind: insight.kind,
    surface: insight.surface,
    label: insight.label,
    description: insight.description,
    recommendation: insight.recommendation,
    confidence: insight.confidence,
    audienceNote: audienceLine(insight.audience),
    avgMetricValue: avg.value,
    avgMetricLabel,
    metricName: avg.name ? humanizeMetricName(avg.name) : null,
    exemplars,
    topPermalink: exemplars.find((view) => view.permalinkUrl)?.permalinkUrl ?? null,
  };
}

export function toInsightRows(insights: CreativeInsight[]): InsightRowView[] {
  return insights.map(toInsightRow);
}
