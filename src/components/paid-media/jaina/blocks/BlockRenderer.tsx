'use client';

import { lazy, Suspense } from 'react';
import type { CheckpointBlockV2 } from '@/lib/jaina/schemas';
import { BlockSkeleton } from './BlockSkeleton';

type BlockRendererProps = {
  block: CheckpointBlockV2;
  isStreaming: boolean;
};

const NarrativeBlock = lazy(() => import('./NarrativeBlock'));
const MetricGridBlock = lazy(() => import('./MetricGridBlock'));
const ChartBlock = lazy(() => import('./ChartBlock'));
const DataTableBlock = lazy(() => import('./DataTableBlock'));
const InsightListBlock = lazy(() => import('./InsightListBlock'));
const ComparisonBlock = lazy(() => import('./ComparisonBlock'));

const BLOCK_REGISTRY: Record<
  string,
  React.LazyExoticComponent<React.ComponentType<{ block: never; isStreaming: boolean }>>
> = {
  narrative: NarrativeBlock,
  metric_grid: MetricGridBlock,
  chart: ChartBlock,
  data_table: DataTableBlock,
  insight_list: InsightListBlock,
  comparison: ComparisonBlock,
} as Record<
  string,
  React.LazyExoticComponent<React.ComponentType<{ block: never; isStreaming: boolean }>>
>;

export function BlockRenderer({ block, isStreaming }: BlockRendererProps) {
  const Component = BLOCK_REGISTRY[block.category];
  if (!Component) return null;

  return (
    <Suspense fallback={<BlockSkeleton />}>
      <Component block={block as never} isStreaming={isStreaming} />
    </Suspense>
  );
}
