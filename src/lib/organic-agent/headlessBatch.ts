// A headless batch from the Organic agent: its live status and its one cast approval
// (contracts organic/headless-batch.ts, artifacts/organic-headless-batch/CONTRACT.md).

import {
  chatMediaItemSchema,
  HEADLESS_BATCH_STATUS_ROUTE,
  HEADLESS_CAST_APPROVE_ROUTE,
  type HeadlessCastApproveResponse,
  headlessBatchCountsSchema,
  headlessBatchItemSchema,
  headlessBatchStatusSchema,
  headlessCastApproveRequestSchema,
  headlessCastApproveResponseSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { request } from '@/lib/api/http';

export const headlessBatchQueryKey = (brandId: string | null | undefined, batchId: string) =>
  ['organic', 'headless-batch', brandId ?? 'none', batchId] as const;

/**
 * The FE's one reader of a batch status, for the stream frame, a restored frame and the route.
 * The contract is strict, so a Backend that ships a field or an item state before this build is
 * promoted would otherwise drop every batch card. This one ignores unknown keys at every level,
 * keeps an unknown item format or state as its raw string, and makes a cover it cannot read a
 * placeholder.
 * A status missing what the card needs (its id, its items) still fails.
 */
export const headlessBatchStatusReader = z.object({
  ...headlessBatchStatusSchema.shape,
  items: z
    .array(
      z.object({
        ...headlessBatchItemSchema.shape,
        format: z.string(),
        state: z.string(),
        cover: z.object(chatMediaItemSchema.shape).nullable().catch(null),
      }),
    )
    .min(1),
  counts: z.object(headlessBatchCountsSchema.shape),
  cast: z.object(headlessBatchStatusSchema.shape.cast.shape),
});
export type ReadHeadlessBatchStatus = z.infer<typeof headlessBatchStatusReader>;
export type ReadHeadlessBatchItem = ReadHeadlessBatchStatus['items'][number];

export function fetchHeadlessBatchStatus({
  brandId,
  batchId,
  signal,
}: {
  brandId: string;
  batchId: string;
  signal?: AbortSignal;
}): Promise<ReadHeadlessBatchStatus> {
  return request({
    path: `${HEADLESS_BATCH_STATUS_ROUTE}?${new URLSearchParams({ brandId, batchId })}`,
    schema: headlessBatchStatusReader,
    signal,
  });
}

/**
 * A bulk plan's batch, by its plan. The Backend makes it after the plan's background run ends,
 * outside any chat turn, so no stream carries its ui.headless_batch frame; it stamps the batch
 * with the plan id instead. Until the batch is made, the route answers 404.
 */
export function fetchBulkPlanBatch({
  brandId,
  planId,
  signal,
}: {
  brandId: string;
  planId: string;
  signal?: AbortSignal;
}): Promise<ReadHeadlessBatchStatus> {
  return request({
    path: `${HEADLESS_BATCH_STATUS_ROUTE}?${new URLSearchParams({ brandId, planId })}`,
    schema: headlessBatchStatusReader,
    signal,
  });
}

export function approveHeadlessBatchCast(input: {
  brandId: string;
  batchId: string;
  draftElementIds: string[];
}): Promise<HeadlessCastApproveResponse> {
  return request({
    path: HEADLESS_CAST_APPROVE_ROUTE,
    method: 'POST',
    body: headlessCastApproveRequestSchema.parse(input),
    schema: headlessCastApproveResponseSchema,
  });
}

// A batch takes minutes per piece. While pieces run or queue, it is asked every 10-15 s; only a
// batch with nothing moving (waiting on the cast) is asked less and less often, up to a minute.
export function headlessBatchRefreshDelayMs(unchangedRefreshes: number, active: boolean): number {
  return Math.min(10_000 * 1.5 ** unchangedRefreshes, active ? 15_000 : 60_000);
}

// An allowlist, never the Backend's text: a reason is a code or an internal sentence, and only
// what is listed here reaches a brand user.
const FAILED_REASONS: ReadonlyArray<readonly [prefix: string, words: string]> = [
  ['nothing_planned', 'The director found nothing to make from this brief.'],
  ['run_failed:run_blocked', 'The run was blocked before it started.'],
  ['run_failed:', 'The run failed before it finished.'],
  ['guided_refused:over_item_cap', 'It would have cost more than its cap.'],
  ['guided_refused:', 'The director turned this brief down.'],
];

/**
 * Why a piece failed, or the one wait worth naming, in words a brand user reads. A waiting piece
 * never repeats its state label, so the other waits say nothing.
 */
export function plainBatchReason(state: string, reason: string | null): string | null {
  const text = reason?.trim() ?? '';
  if (state === 'failed') {
    if (!text) return null;
    return (
      FAILED_REASONS.find(([prefix]) => text.startsWith(prefix))?.[1] ?? 'It could not be made.'
    );
  }
  return text.startsWith("waiting on the first piece's cast")
    ? "Starts once the first piece's cast is approved."
    : null;
}
