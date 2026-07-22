// Resolves an optimizer read into the status the shared DataState switch expects.
//
// Why this exists: useOptimizerRead always hands back a renderable `data` (it
// falls back to an EMPTY_* constant), which is ergonomic for rendering and
// disastrous for honesty — a failed read and a genuinely empty portfolio arrive
// at the chart as the same empty array. The charts then render their own "…appears
// after a few scored cycles" message, which asserts a CAUSE the chart cannot know
// and quietly reassures the operator that nothing is wrong.
//
// Deliberately resolves only loading / error / ready. Empty stays the chart's own
// call: each chart knows its real threshold (a timeline needs two points, a funnel
// needs one stage) and words it specifically. This layer only stops loading and
// error from wearing that message.

import type { DataStateStatus } from '@/components/shared/state/DataState';

type OptimizerReadLike = {
  isLoading?: boolean;
  isError?: boolean;
};

export function chartStatus(query: OptimizerReadLike): DataStateStatus {
  if (query.isError) return 'error';
  if (query.isLoading) return 'loading';
  return 'ready';
}

/** Worst status across several reads feeding one chart: any error wins, then any
 *  load. A funnel summed from two reads is not "ready" while half of it is still
 *  in flight. */
export function combinedChartStatus(...queries: OptimizerReadLike[]): DataStateStatus {
  if (queries.some((query) => query.isError)) return 'error';
  if (queries.some((query) => query.isLoading)) return 'loading';
  return 'ready';
}
