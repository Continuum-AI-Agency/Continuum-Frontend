'use client';

import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import { formatValue, resolveMetricDisplayFormat } from '@/lib/jaina/formatValue';
import type { MetricGridBlockV2, MetricItemV2 } from '@/lib/jaina/schemas';
import { EvidenceTooltip } from './EvidenceTooltip';

type MetricGridBlockProps = { block: MetricGridBlockV2; isStreaming: boolean };

// Maps a report metric's signed change onto MetricStrip's deltaPct, which derives
// direction from the value's sign. A "down" change is rendered as a negative delta.
function resolveDeltaPct(metric: MetricItemV2): number | undefined {
  if (metric.change === null || metric.change === undefined) return undefined;
  return metric.change_direction === 'down' ? -Math.abs(metric.change) : Math.abs(metric.change);
}

function toStripItem(metric: MetricItemV2): MetricStripItem {
  const displayFormat = resolveMetricDisplayFormat({
    label: metric.label,
    format: metric.format,
    unit: metric.unit,
  });
  return {
    label: metric.label,
    value: formatValue(metric.value, displayFormat),
    deltaPct: resolveDeltaPct(metric),
  };
}

export default function MetricGridBlock({ block }: MetricGridBlockProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
        <EvidenceTooltip provenance={block.provenance} datasetId={block.dataset_id} />
      </div>
      <MetricStrip items={block.metrics.map(toStripItem)} />
    </div>
  );
}
