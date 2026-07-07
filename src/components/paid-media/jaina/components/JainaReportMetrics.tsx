import { Pill } from '@/components/kibo-ui/pill';
import type { FrontendCheckpointReport } from '@/lib/jaina/schemas';

type JainaReportMetricsProps = {
  metrics: FrontendCheckpointReport['performance_snapshot'];
};

export function JainaReportMetrics({ metrics }: JainaReportMetricsProps) {
  if (!metrics || metrics.length === 0) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      <h3 className="text-lg font-semibold text-primary/80">Performance Snapshot</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <MetricCard key={buildMetricKey(metric, index)} item={metric} />
        ))}
      </div>
    </div>
  );
}

function buildMetricKey(
  item: FrontendCheckpointReport['performance_snapshot'][number],
  index: number,
) {
  const metric = (item ?? {}) as Record<string, unknown>;
  return [
    String(metric.metric ?? metric.label ?? 'metric'),
    String(metric.context ?? ''),
    String(metric.sub_label ?? ''),
    String(index),
  ].join('|');
}

function MetricCard({ item }: { item: FrontendCheckpointReport['performance_snapshot'][number] }) {
  const metric = (item ?? {}) as Record<string, unknown>;
  const change = getMetricChange(item);
  const numericChange =
    typeof change === 'number' ? change : Number.parseFloat(String(change ?? ''));
  const hasChange = !isNaN(numericChange);
  const hasStatus = typeof metric.status === 'string' && metric.status.trim().length > 0;
  const statusVariant = resolveMetricStatusColor(metric.status, numericChange, hasChange);

  return (
    <div className="rounded-lg border border-white/5 bg-white/5 p-4 hover:bg-white/10 transition-colors">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          {String(metric.metric ?? metric.label ?? 'Metric')}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold text-primary">{formatMetricValue(item)}</span>
          {hasChange || hasStatus ? (
            <Pill variant={statusVariant} className="text-2xs">
              {hasChange ? (
                <>
                  {numericChange > 0 ? '+' : ''}
                  {numericChange}%
                </>
              ) : (
                formatMetricStatusLabel(metric.status)
              )}
            </Pill>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function getMetricChange(
  item: FrontendCheckpointReport['performance_snapshot'][number],
): unknown {
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

function formatMetricValue(item: FrontendCheckpointReport['performance_snapshot'][number]) {
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
