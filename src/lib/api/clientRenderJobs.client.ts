import {
  type ClientRenderCapabilities,
  type ClientRenderExecutionSpec,
  type ClientRenderJob,
  type ClientRenderJobInputManifest,
  claimedClientRenderJobResponseSchema,
  clientRenderMutationResponseSchema,
  listClientRenderJobsResponseSchema,
} from '@continuum/contracts';
import type { z } from 'zod';
import { http } from './http';

type ClaimedResponse = z.infer<typeof claimedClientRenderJobResponseSchema>;
type MutationResponse = z.infer<typeof clientRenderMutationResponseSchema>;

const base = (jobId?: string): string =>
  jobId
    ? `/api/media/client-render-jobs/${encodeURIComponent(jobId)}`
    : '/api/media/client-render-jobs';

/**
 * The whole account's render queue, not the selected brand's.
 *
 * The bell badge counts every brand the caller can operate; omitting `brandId` is what
 * asks the route for that. Pass one only to inspect a single brand deliberately.
 */
export function listClientRenderJobs(
  brandId?: string,
  clientId?: string,
): Promise<{ jobs: ClientRenderJob[] }> {
  // The client id is what lets the server hide a job ADDRESSED to another session.
  // Filtering there rather than here keeps one reader of the rule.
  const params = new URLSearchParams();
  if (brandId) params.set('brandId', brandId);
  if (clientId) params.set('clientId', clientId);
  const query = params.size > 0 ? `?${params}` : '';
  return http.request({
    path: `${base()}${query}`,
    schema: listClientRenderJobsResponseSchema,
    cache: 'no-store',
  });
}

export function createClientRenderJob(input: {
  brandId: string;
  sourceId: string;
  sourceRevision: string;
  title: string;
  executionSpec: ClientRenderExecutionSpec;
  inputs: ClientRenderJobInputManifest;
}): Promise<MutationResponse> {
  return http.request({
    path: base(),
    method: 'POST',
    body: input,
    schema: clientRenderMutationResponseSchema,
    cache: 'no-store',
  });
}

export function claimClientRenderJob(input: {
  jobId: string;
  brandId: string;
  clientId: string;
  capabilities: ClientRenderCapabilities;
}): Promise<ClaimedResponse> {
  return http.request({
    path: `${base(input.jobId)}/claim?${new URLSearchParams({ brandId: input.brandId })}`,
    method: 'POST',
    body: { clientId: input.clientId, capabilities: input.capabilities },
    schema: claimedClientRenderJobResponseSchema,
    cache: 'no-store',
  });
}

export function updateClientRenderJob(
  jobId: string,
  body: {
    leaseToken: string;
    state?: 'claimed' | 'rendering' | 'saving';
    progress?: number;
    phase?: string;
  },
): Promise<MutationResponse> {
  return http.request({
    path: base(jobId),
    method: 'PATCH',
    body,
    schema: clientRenderMutationResponseSchema,
    cache: 'no-store',
  });
}

export function completeClientRenderJob(
  jobId: string,
  leaseToken: string,
  resultAssetIds: string[],
): Promise<MutationResponse> {
  return http.request({
    path: `${base(jobId)}/complete`,
    method: 'POST',
    body: { leaseToken, resultAssetIds },
    schema: clientRenderMutationResponseSchema,
    cache: 'no-store',
  });
}

export function failClientRenderJob(
  jobId: string,
  leaseToken: string,
  errorMessage: string,
): Promise<MutationResponse> {
  return http.request({
    path: `${base(jobId)}/fail`,
    method: 'POST',
    body: { leaseToken, errorCode: 'render_failed', errorMessage },
    schema: clientRenderMutationResponseSchema,
    cache: 'no-store',
  });
}

export function releaseClientRenderJob(
  jobId: string,
  leaseToken: string,
): Promise<MutationResponse> {
  return http.request({
    path: `${base(jobId)}/release`,
    method: 'POST',
    body: { leaseToken },
    schema: clientRenderMutationResponseSchema,
    cache: 'no-store',
  });
}

export function retryClientRenderJob(jobId: string, brandId: string): Promise<MutationResponse> {
  return http.request({
    path: `${base(jobId)}/retry?${new URLSearchParams({ brandId })}`,
    method: 'POST',
    schema: clientRenderMutationResponseSchema,
    cache: 'no-store',
  });
}
