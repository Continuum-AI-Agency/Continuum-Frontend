import {
  API_RENDER_ADVISORIES_PROFILE,
  API_RENDER_BATCH_PREFLIGHT_ROUTE,
  API_RENDER_BATCHES_ROUTE,
  API_RENDER_JOBS_ROUTE,
  API_RENDER_PREFLIGHT_ROUTE,
  API_RENDER_SETS_ROUTE,
  type ApiRenderBatch,
  type ApiRenderBatchPreflightRequest,
  type ApiRenderBatchPreflightResponse,
  apiRenderBatchPreflightResponseSchema,
  apiRenderBatchSchema,
  type ApiRenderCreateJobRequest,
  type ApiRenderJob,
  type ApiRenderJobListResponse,
  apiRenderJobListResponseSchema,
  apiRenderJobSchema,
  type ApiRenderPreflightRequest,
  type ApiRenderPreflightResponse,
  apiRenderPreflightResponseSchema,
  type ForgeRenderSet,
  forgeRenderSetListResponseSchema,
  type ForgeRenderSetRevision,
  forgeRenderSetRevisionListResponseSchema,
  forgeRenderSetSchema,
} from '@continuum/contracts';
import { ApiError, hasBackendError, isFetchFailure, markRetried } from '@/lib/api/errors';
import type { http } from '@/lib/api/http';

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
 * same token is the same jobs. An error that outlasted these retries, or came after one, is marked, so React Query's
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
      // After a retry, any answer is marked: an earlier attempt may have reached the server.
      if (!isTransientRenderError(error)) throw attempt > 0 ? markRetried(error) : error;
      const delay = delaysMs[attempt];
      if (delay === undefined) throw markRetried(error);
      await wait(delay);
    }
  }
}

export const query = (input: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])).toString();

/**
 * The render calls that ride out a deploy cut, on the client given (apiRendersApi hands it
 * `http`). A factory so their wiring is tested here: confirm, preflight, the job reads and the
 * render-set reads each go through retryTransient.
 */
export function renderCallsThrough(
  client: Pick<typeof http, 'request'>,
  options: Parameters<typeof retryTransient>[1] = {},
) {
  const retried = <T>(run: () => Promise<T>) => retryTransient(run, options);
  return {
    /** `retry: false` asks once: a check fanned out over many rows must not multiply its own retries. */
    preflight(input: ApiRenderPreflightRequest, { retry = true }: { retry?: boolean } = {}) {
      const ask = () =>
        client.request<ApiRenderPreflightResponse>({
          path: API_RENDER_PREFLIGHT_ROUTE,
          method: 'POST',
          body: input,
          headers: { Accept: `application/json; profile="${API_RENDER_ADVISORIES_PROFILE}"` },
          schema: apiRenderPreflightResponseSchema,
        });
      return retry ? retried(ask) : ask();
    },
    createJob(input: ApiRenderCreateJobRequest) {
      return retried(() =>
        client.request<ApiRenderJob>({
          path: API_RENDER_JOBS_ROUTE,
          method: 'POST',
          body: input,
          schema: apiRenderJobSchema,
          headers: { Accept: `application/json; profile="${API_RENDER_ADVISORIES_PROFILE}"` },
        }),
      );
    },
    listJobs(
      brandId: string,
      limit = 10,
      options?: {
        cursor?: string;
        renderSetId?: string;
        renderSetRowId?: string;
        templateKey?: string;
        status?: ApiRenderJob['status'];
        batchId?: string;
        variantId?: string;
      },
    ) {
      return retried(() =>
        client.request<ApiRenderJobListResponse>({
          path: `${API_RENDER_JOBS_ROUTE}?${query({
            brandId,
            limit,
            ...(options?.cursor ? { cursor: options.cursor } : {}),
            ...(options?.renderSetId ? { renderSetId: options.renderSetId } : {}),
            ...(options?.renderSetRowId ? { renderSetRowId: options.renderSetRowId } : {}),
            ...(options?.templateKey ? { templateKey: options.templateKey } : {}),
            ...(options?.status ? { status: options.status } : {}),
            ...(options?.batchId ? { batchId: options.batchId } : {}),
            ...(options?.variantId ? { variantId: options.variantId } : {}),
          })}`,
          schema: apiRenderJobListResponseSchema,
          headers: { Accept: `application/json; profile="${API_RENDER_ADVISORIES_PROFILE}"` },
        }),
      );
    },
    getJob(brandId: string, jobId: string) {
      return retried(() =>
        client.request<ApiRenderJob>({
          path: `${API_RENDER_JOBS_ROUTE}/${encodeURIComponent(jobId)}?${query({ brandId })}`,
          schema: apiRenderJobSchema,
          headers: { Accept: `application/json; profile="${API_RENDER_ADVISORIES_PROFILE}"` },
        }),
      );
    },
    listRenderSets(brandId: string, templateKey?: string) {
      return retried(() =>
        client.request<{ items: ForgeRenderSet[]; nextCursor: null }>({
          path: `${API_RENDER_SETS_ROUTE}?${query(
            templateKey ? { brandId, templateKey } : { brandId },
          )}`,
          schema: forgeRenderSetListResponseSchema,
        }),
      );
    },
    getRenderSet(brandId: string, setId: string) {
      return retried(() =>
        client.request<ForgeRenderSet>({
          path: `${API_RENDER_SETS_ROUTE}/${encodeURIComponent(setId)}?${query({ brandId })}`,
          schema: forgeRenderSetSchema,
        }),
      );
    },
    /** The states the set was left in, newest first, for Version history. */
    listRenderSetRevisions(brandId: string, setId: string) {
      return retried(() =>
        client.request<{ items: ForgeRenderSetRevision[] }>({
          path: `${API_RENDER_SETS_ROUTE}/${encodeURIComponent(setId)}/revisions?${query({ brandId })}`,
          schema: forgeRenderSetRevisionListResponseSchema,
        }),
      );
    },
    // Batches. One token wraps N per-record tokens; every job createBatch makes carries its
    // `batchId`, so `listJobs({ batchId })` reads the whole batch back later.
    batchPreflight(input: ApiRenderBatchPreflightRequest) {
      return retried(() =>
        client.request<ApiRenderBatchPreflightResponse>({
          path: API_RENDER_BATCH_PREFLIGHT_ROUTE,
          method: 'POST',
          body: input,
          headers: { Accept: `application/json; profile="${API_RENDER_ADVISORIES_PROFILE}"` },
          schema: apiRenderBatchPreflightResponseSchema,
        }),
      );
    },
    createBatch(input: ApiRenderCreateJobRequest) {
      return retried(() =>
        client.request<ApiRenderBatch>({
          path: API_RENDER_BATCHES_ROUTE,
          method: 'POST',
          body: input,
          schema: apiRenderBatchSchema,
          headers: { Accept: `application/json; profile="${API_RENDER_ADVISORIES_PROFILE}"` },
        }),
      );
    },
  };
}
