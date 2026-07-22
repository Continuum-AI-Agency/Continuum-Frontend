import {
  CANVAS_RENDER_COMPLETE_ROUTE,
  CANVAS_RENDER_CONTINUATION_CLAIM_ROUTE,
  CANVAS_RENDER_CONTINUATION_FINISH_ROUTE,
  type CanvasRenderCompleteRequest,
  type CanvasRenderCompleteResponse,
  type CanvasRenderContinuationClaimRequest,
  type CanvasRenderContinuationClaimResponse,
  type CanvasRenderContinuationFinishRequest,
  type CanvasRenderContinuationFinishResponse,
  canvasRenderCompleteResponseSchema,
  canvasRenderContinuationClaimResponseSchema,
  canvasRenderContinuationFinishResponseSchema,
} from '@continuum/contracts';
import { http } from './http';

export function completeCanvasRender(
  body: CanvasRenderCompleteRequest,
  signal?: AbortSignal,
): Promise<CanvasRenderCompleteResponse> {
  return http.request({
    path: CANVAS_RENDER_COMPLETE_ROUTE,
    method: 'POST',
    body,
    schema: canvasRenderCompleteResponseSchema,
    cache: 'no-store',
    signal,
  });
}

export function claimCanvasRenderContinuation(
  body: CanvasRenderContinuationClaimRequest,
): Promise<CanvasRenderContinuationClaimResponse> {
  return http.request({
    path: CANVAS_RENDER_CONTINUATION_CLAIM_ROUTE,
    method: 'POST',
    body,
    schema: canvasRenderContinuationClaimResponseSchema,
    cache: 'no-store',
  });
}

export function finishCanvasRenderContinuation(
  body: CanvasRenderContinuationFinishRequest,
): Promise<CanvasRenderContinuationFinishResponse> {
  return http.request({
    path: CANVAS_RENDER_CONTINUATION_FINISH_ROUTE,
    method: 'POST',
    body,
    schema: canvasRenderContinuationFinishResponseSchema,
    cache: 'no-store',
  });
}
