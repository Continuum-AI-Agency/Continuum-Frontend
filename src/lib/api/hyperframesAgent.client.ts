import {
  type HyperframesAgentTurnRequest,
  type HyperframesAgentTurnResponse,
  type HyperframesStoryAngle,
  type HyperframesStoryboard,
  type HyperframesStoryPlanRequest,
  hyperframesAgentTurnResponseSchema,
  hyperframesCompositionRevisionSchema,
  hyperframesStoryAnglesSchema,
  hyperframesStoryboardSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { http } from './http';

const revisionResponseSchema = z.object({
  revision: hyperframesCompositionRevisionSchema,
  compositionUrl: z.string().url(),
  assets: z.array(
    z.object({
      assetId: z.string().min(1),
      assetVersionId: z.string().min(1),
      kind: z.enum(['image', 'video', 'audio']),
      mimeType: z.string().min(1),
      url: z.string().url(),
    }),
  ),
});

export type HyperframesRevisionResponse = z.infer<typeof revisionResponseSchema>;

const base = (runId?: string): string =>
  runId
    ? `/api/ai-studio/hyperframes-agent/runs/${encodeURIComponent(runId)}`
    : '/api/ai-studio/hyperframes-agent';

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

export function getHyperframesStoryAngles(
  request: HyperframesStoryPlanRequest,
): Promise<{ angles: HyperframesStoryAngle[] }> {
  return http.request({
    path: `${base()}/story-angles`,
    method: 'POST',
    body: request,
    schema: hyperframesStoryAnglesSchema,
    cache: 'no-store',
  });
}

export function getHyperframesStoryboard(
  request: HyperframesStoryPlanRequest,
): Promise<{ storyboard: HyperframesStoryboard }> {
  return http.request({
    path: `${base()}/storyboard`,
    method: 'POST',
    body: request,
    schema: z.object({ storyboard: hyperframesStoryboardSchema }),
    cache: 'no-store',
  });
}

export function getHyperframesRevision(
  runId: string,
  signal?: AbortSignal,
): Promise<HyperframesRevisionResponse> {
  return http.request({
    path: `${base(runId)}/revision`,
    method: 'GET',
    schema: revisionResponseSchema,
    cache: 'no-store',
    signal,
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
