import { ApiError, hasBackendError, isFetchFailure, markRetried } from '@/lib/api/errors';

// Render calls through a deploy cut. Its own module, not apiRendersApi's, so it is tested where
// it lives: tests that mock apiRendersApi (mock.module is process-wide) cannot swap it out.

/** Waits before each retry, sized to a backend deploy cut. */
export const RENDER_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 8_000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 429, a gateway or closing 502/503 that carries no backend error, or `fetch` itself failing. A
 *  504 may still be running, a timeout already waited its bound, and a TypeError thrown while
 *  building the request would only repeat, so none of those is retried. */
export function isTransientRenderError(error: unknown): boolean {
  if (isFetchFailure(error)) return true;
  if (!(error instanceof ApiError)) return false;
  if (error.status === 429) return true;
  if (error.status !== 502 && error.status !== 503) return false;
  return !hasBackendError(error);
}

/**
 * Repeats `run` (same body, same confirmationToken) through a transient failure. Repeating a
 * confirm is safe because of the backend's database rows, not the fleet (which does not dedupe
 * `request_id`): createBatch → createJob → jobForRequest(request_id) returns a row that already
 * exists before any insert, and `ad_render_jobs` is unique on (brand_id, idempotency_key). The
 * same token is the same jobs. An error that outlasted these retries is marked, so React Query's
 * own retry does not pay for the same cut again.
 */
export async function retryTransient<T>(
  run: () => Promise<T>,
  { delaysMs = RENDER_RETRY_DELAYS_MS, wait = sleep } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isTransientRenderError(error)) throw error;
      const delay = delaysMs[attempt];
      if (delay === undefined) throw markRetried(error);
      await wait(delay);
    }
  }
}
