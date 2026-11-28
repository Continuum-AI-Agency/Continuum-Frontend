import { type Stat, StatGrid, type StatTone } from '@/components/ui/stat-grid';
import type { FrontendCheckpointReport } from '@/lib/jaina/schemas';

type MetricItem = FrontendCheckpointReport['performance_snapshot'][number];

type JainaReportMetricsProps = {
  metrics: FrontendCheckpointReport['performance_snapshot'];
};

// The legacy snapshot carries scalar changes only, never a series, so no stat gets a sparkline.
export function JainaReportMetrics({ metrics }: JainaReportMetricsProps) {
  if (!metrics || metrics.length === 0) return null;

  return (
    <StatGrid
      title="Performance Snapshot"
      data={metrics.map(toStat)}
      className="max-w-none"
    />
  );
}

const LOWER_IS_BETTER_LABEL = /\b(cpa|cpc|cpm|cpl|cpr|cac|cost|frequency|bounce)\b/i;

const TONE_BY_STATUS_VARIANT: Record<ReturnType<typeof resolveMetricStatusColor>, StatTone | undefined> = {
  success: 'positive',
  destructive: 'negative',
  warning: 'warning',
  teal: 'neutral',
  muted: undefined,
};

export function toStat(item: MetricItem, index: number): Stat {
  const metric = (item ?? {}) as Record<string, unknown>;
  const label = String(metric.metric ?? metric.label ?? 'Metric');
  const change = getMetricChange(item);
  const numericChange =
    typeof change === 'number' ? change : Number.parseFloat(String(change ?? ''));
  const hasChange = !Number.isNaN(numericChange);
  const hasStatus = typeof metric.status === 'string' && metric.status.trim().length > 0;
  const hint = [metric.sub_label, metric.context].find(
    (text): text is string => typeof text === 'string' && text.trim().length > 0,
  );

  return {
    id: buildMetricKey(item, index),
    label,
    value: formatMetricValue(item),
    delta: hasChange ? numericChange : undefined,
    higherIsBetter: !LOWER_IS_BETTER_LABEL.test(label),
    // A recognised status is the report's own verdict and outranks the sign of the change.
    tone: hasStatus ? TONE_BY_STATUS_VARIANT[resolveMetricStatusColor(metric.status, 0, false)] : undefined,
    status: hasStatus ? formatMetricStatusLabel(metric.status) : undefined,
    hint,
  };
}

function buildMetricKey(item: MetricItem, index: number) {
  const metric = (item ?? {}) as Record<string, unknown>;
  return [
    String(metric.metric ?? metric.label ?? 'metric'),
    String(metric.context ?? ''),
    String(metric.sub_label ?? ''),
    String(index),
  ].join('|');
}

export function getMetricChange(item: MetricItem): unknown {
  const metric = (item ?? {}) as Record<string, unknown>;
  return metric.change ?? metric.trend;
}

export function resolveMetricStatusColor(
  status: unknown,
  numericChange: number,
  hasChange: boolean,
): 'success' | 'destructive' | 'muted' | 'teal' | 'warning' {
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase().trim() : '';

  if (normalizedStatus === 'positive' || normalizedStatus === 'success') return 'success';
  if (
    normalizedStatus === 'risk' ||
    normalizedStatus === 'error' ||
    normalizedStatus === 'critical'
  ) {
    return 'destructive';
  }
  if (normalizedStatus === 'warning' || normalizedStatus === 'watch') return 'warning';
  if (normalizedStatus === 'neutral') return 'teal';
  if (hasChange) {
    if (numericChange > 0) return 'success';
    if (numericChange < 0) return 'destructive';
    return 'teal';
  }
  return 'muted';
}

function formatMetricStatusLabel(status: unknown): string {
  if (typeof status !== 'string' || status.trim().length === 0) return 'neutral';
  const raw = status.trim().toLowerCase();
  if (raw === 'risk') return 'risk';
  if (raw === 'warning') return 'warning';
  if (raw === 'positive' || raw === 'success') return 'positive';
  if (raw === 'neutral') return 'neutral';
  return raw;
}

function formatMetricValue(item: MetricItem) {
  const metric = (item ?? {}) as Record<string, unknown>;
  const value = metric.value;
  const format = typeof metric.format === 'string' ? metric.format : undefined;
  const prefix = typeof metric.prefix === 'string' ? metric.prefix : undefined;
  const suffix = typeof metric.suffix === 'string' ? metric.suffix : undefined;
  if (typeof value !== 'number') {
    return String(value ?? '—');
  }

  const resolvedFormat =
    format ||
    (prefix === '$' ? 'currency' : undefined) ||
    (suffix === '%' ? 'percentage' : undefined);

  let rendered: string;
  if (resolvedFormat === 'currency') {
    rendered = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  } else if (resolvedFormat === 'percentage') {
    rendered = `${value}%`;
  } else {
    rendered = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  if (prefix && resolvedFormat !== 'currency') {
    rendered = `${prefix}${rendered}`;
  }
  if (suffix && !(resolvedFormat === 'percentage' && suffix === '%')) {
    rendered = `${rendered}${suffix}`;
  }

  return rendered;
}
