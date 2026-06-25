"use client";

import type { MetricGridBlockV2, MetricItemV2 } from "@/lib/jaina/schemas";
import { formatValue, resolveMetricDisplayFormat } from "@/lib/jaina/formatValue";
import { MetricStrip, type MetricStripItem } from "@/components/shared/MetricStrip";

type MetricGridBlockProps = { block: MetricGridBlockV2; isStreaming: boolean };

// Maps a report metric's signed change onto MetricStrip's deltaPct, which derives
// direction from the value's sign. A "down" change is rendered as a negative delta.
function resolveDeltaPct(metric: MetricItemV2): number | undefined {
  if (metric.change === null || metric.change === undefined) return undefined;
  return metric.change_direction === "down" ? -Math.abs(metric.change) : Math.abs(metric.change);
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
      <h4 className="mb-2 text-sm font-semibold text-foreground">{block.title}</h4>
      <MetricStrip items={block.metrics.map(toStripItem)} />
    </div>
  );
}
