import type { OrganicJobRetryResponse } from '@continuum/contracts';
import { requestOrganicJobRetry } from '@/lib/organic/agent-retry';
import type { PanelAction, PanelState } from './useOrganicAgentReducer';

/**
 * The chat's Retry (failed job) and Recreate draft (missing draft): reset the SAME row to
 * queued rather than enqueuing a second job for the concept. For a missing draft the
 * Backend mints a new draft row first and answers with its id, which the card adopts so
 * approve -> job -> draft stays traceable. A refusal puts back exactly what was on screen.
 * `request` is injectable for tests; production uses the auth-attaching client.
 */
export async function retryJobInPlace(input: {
  jobId: string;
  brandId: string;
  state: Pick<PanelState, 'jobs' | 'pipeline'>;
  dispatch: (action: PanelAction) => void;
  notifyFailure: (message: string) => void;
  request?: (job: { jobId: string; brandId: string }) => Promise<OrganicJobRetryResponse>;
}): Promise<boolean> {
  const { jobId, brandId, dispatch } = input;
  const job = input.state.jobs[jobId];
  const card = input.state.pipeline[jobId];
  dispatch({ type: 'JOB_RETRY', jobId });
  try {
    const response = await (input.request ?? requestOrganicJobRetry)({ jobId, brandId });
    dispatch({ type: 'JOB_RETRY', jobId, draftId: response.job.draftId ?? null });
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not retry the failed generation.';
    const wasMissing = Boolean(job?.draftMissing || card?.draftMissing);
    dispatch({
      type: 'JOB_UPDATE',
      job: {
        jobId,
        status: (job?.status ?? card?.status) === 'completed' ? 'completed' : 'failed',
        ...(wasMissing ? { draftMissing: true } : { error: { message } }),
      },
    });
    input.notifyFailure(message);
    return false;
  }
}
