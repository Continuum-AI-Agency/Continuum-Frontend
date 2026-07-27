import {
  type HyperframesAgentTurnRequest,
  type HyperframesAgentTurnResponse,
  type HyperframesBrowserReviewRequest,
  type HyperframesRenderCompleteRequest,
  type HyperframesReviewUploadRequest,
  type HyperframesReviewUploadResponse,
  hyperframesAgentTurnResponseSchema,
  hyperframesClientRenderWorkSchema,
  hyperframesCompositionRevisionSchema,
  hyperframesReviewUploadResponseSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { http } from './http';

const revisionResponseSchema = z.object({
  revision: hyperframesCompositionRevisionSchema,
  compositionUrl: z.string().url(),
  assets: z.array(
    z.object({
      assetId: z.string().min(1),
      kind: z.enum(['image', 'video', 'audio']),
      mimeType: z.string().min(1),
      url: z.string().url(),
    }),
  ),
});

const completeResponseSchema = z.object({ ok: z.boolean(), signedUrl: z.string().url() });
const workResponseSchema = z.object({ work: hyperframesClientRenderWorkSchema }).strict();

export type HyperframesRevisionResponse = z.infer<typeof revisionResponseSchema>;
export type HyperframesClientRenderWorkResponse = z.infer<typeof workResponseSchema>;

const base = (runId?: string): string =>
  runId
    ? `/api/ai-studio/hyperframes-agent/runs/${encodeURIComponent(runId)}`
    : '/api/ai-studio/hyperframes-agent';

const leaseHeaders = (leaseToken?: string): Record<string, string> =>
  leaseToken ? { 'x-client-render-lease': leaseToken } : {};

export function startHyperframesTurn(
  brandId: string,
  turn: HyperframesAgentTurnRequest,
): Promise<HyperframesAgentTurnResponse> {
  return http.request({
    path: `${base()}/turns`,
    method: 'POST',
    body: { brandId, turn },
    schema: hyperframesAgentTurnResponseSchema,
    cache: 'no-store',
  });
}

export function getHyperframesRevision(
  runId: string,
  signal?: AbortSignal,
  leaseToken?: string,
): Promise<HyperframesRevisionResponse> {
  return http.request({
    path: `${base(runId)}/revision`,
    method: 'GET',
    schema: revisionResponseSchema,
    cache: 'no-store',
    signal,
    headers: leaseHeaders(leaseToken),
  });
}

export function getHyperframesClientRenderWork(
  runId: string,
  leaseToken: string,
  signal?: AbortSignal,
): Promise<HyperframesClientRenderWorkResponse> {
  return http.request({
    path: `${base(runId)}/client-render-work`,
    method: 'GET',
    schema: workResponseSchema,
    cache: 'no-store',
    signal,
    headers: leaseHeaders(leaseToken),
  });
}

export function createHyperframesReviewUploads(
  runId: string,
  body: HyperframesReviewUploadRequest,
  signal?: AbortSignal,
  leaseToken?: string,
): Promise<HyperframesReviewUploadResponse> {
  return http.request({
    path: `${base(runId)}/review-uploads`,
    method: 'POST',
    body,
    schema: hyperframesReviewUploadResponseSchema,
    cache: 'no-store',
    signal,
    headers: leaseHeaders(leaseToken),
  });
}

export function submitHyperframesReview(
  runId: string,
  body: HyperframesBrowserReviewRequest,
  signal?: AbortSignal,
  leaseToken?: string,
): Promise<{ ok: boolean }> {
  return http.request({
    path: `${base(runId)}/review`,
    method: 'POST',
    body,
    schema: z.object({ ok: z.boolean() }),
    cache: 'no-store',
    signal,
    headers: leaseHeaders(leaseToken),
  });
}

export function reportHyperframesProgress(
  runId: string,
  body: { revisionId: string; progress: number },
  signal?: AbortSignal,
  leaseToken?: string,
): Promise<{ ok: boolean }> {
  return http.request({
    path: `${base(runId)}/progress`,
    method: 'POST',
    body,
    schema: z.object({ ok: z.boolean() }),
    cache: 'no-store',
    signal,
    headers: leaseHeaders(leaseToken),
  });
}

export function completeHyperframesRender(
  runId: string,
  body: HyperframesRenderCompleteRequest,
  signal?: AbortSignal,
  leaseToken?: string,
): Promise<z.infer<typeof completeResponseSchema>> {
  return http.request({
    path: `${base(runId)}/complete`,
    method: 'POST',
    body,
    schema: completeResponseSchema,
    cache: 'no-store',
    signal,
    headers: leaseHeaders(leaseToken),
  });
}

export function cancelHyperframesRun(runId: string): Promise<{ cancelled: boolean }> {
  return http.request({
    path: `${base(runId)}/cancel`,
    method: 'POST',
    schema: z.object({ cancelled: z.boolean() }),
    cache: 'no-store',
  });
}

export function failHyperframesRun(
  runId: string,
  message: string,
  leaseToken?: string,
): Promise<{ ok: boolean }> {
  return http.request({
    path: `${base(runId)}/fail`,
    method: 'POST',
    body: { message },
    schema: z.object({ ok: z.boolean() }),
    cache: 'no-store',
    headers: leaseHeaders(leaseToken),
  });
}
