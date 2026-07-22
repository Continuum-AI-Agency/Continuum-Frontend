import { type OrganicJobRetryResponse, organicJobRetryResponseSchema } from '@continuum/contracts';
import { http } from '@/lib/api/http';

type RetryRequestFn = typeof http.request;

/**
 * POST the deterministic in-place retry for a FAILED organic generation job. The
 * Backend resets the existing row to 'queued' so the durable worker re-runs it
 * from its already-persisted context; the response is validated against the shared
 * contract so a drifted shape throws at the boundary. `request` is injectable for
 * tests — production always uses the auth-attaching `http.request`.
 */
export async function requestOrganicJobRetry(
  input: { jobId: string; brandId: string },
  request: RetryRequestFn = http.request,
): Promise<OrganicJobRetryResponse> {
  return request<OrganicJobRetryResponse>({
    path: `/api/organic/agent/jobs/${encodeURIComponent(input.jobId)}/retry`,
    method: 'POST',
    body: { brandId: input.brandId },
    schema: organicJobRetryResponseSchema,
  });
}

/**
 * Optimistically flip a failed job to 'queued', fire the retry, and roll back on
 * failure. Mirrors cancelOrganicJobOptimistically: `patch` applies the optimistic
 * transition, `revert` restores the prior failed state, `notifyFailure` surfaces
 * the reason. Returns whether the retry was accepted.
 */
export async function retryOrganicJobOptimistically<
  TJob extends { jobId: string; brandId: string },
>(input: {
  job: TJob;
  patch: () => void;
  revert: () => void;
  notifyFailure: (message: string) => void;
  request?: (job: TJob) => Promise<unknown>;
}): Promise<boolean> {
  input.patch();
  try {
    await (input.request ?? ((job) => requestOrganicJobRetry(job)))(input.job);
    return true;
  } catch (error) {
    input.revert();
    input.notifyFailure(
      error instanceof Error ? error.message : 'Could not retry the failed generation.',
    );
    return false;
  }
}
