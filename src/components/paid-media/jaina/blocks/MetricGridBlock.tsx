"use client";

import type { MetricGridBlockV2 } from "@/lib/jaina/schemas";
import { MetricCard } from "./MetricCard";

type MetricGridBlockProps = { block: MetricGridBlockV2; isStreaming: boolean };

export default function MetricGridBlock({ block }: MetricGridBlockProps) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-foreground">{block.title}</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {block.metrics.map((metric, index) => (
          <MetricCard key={`${metric.label}-${index}`} metric={metric} />
        ))}
      </div>
    </div>
  );
}
