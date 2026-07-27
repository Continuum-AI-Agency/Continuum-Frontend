import {
  CANVAS_GRAPH_CHANGE_LIST_ROUTE,
  type CanvasGraphChangeDecision,
  type CanvasGraphChangeDecisionResponse,
  type CanvasGraphChangeListResponse,
  canvasGraphChangeDecisionResponseSchema,
  canvasGraphChangeListResponseSchema,
} from '@continuum/contracts';
import { http } from './http';

export function listCanvasGraphChanges(
  brandProfileId: string,
  roomId: string,
): Promise<CanvasGraphChangeListResponse> {
  const query = new URLSearchParams({ brandProfileId, roomId });
  return http.request({
    path: `${CANVAS_GRAPH_CHANGE_LIST_ROUTE}?${query.toString()}`,
    method: 'GET',
    schema: canvasGraphChangeListResponseSchema,
    cache: 'no-store',
  });
}

export function decideCanvasGraphChange(
  changeSetId: string,
  body: {
    brandProfileId: string;
    roomId: string;
    decision: CanvasGraphChangeDecision;
  },
): Promise<CanvasGraphChangeDecisionResponse> {
  return http.request({
    path: `/api/ai-studio/canvas/graph-changes/${encodeURIComponent(changeSetId)}/decision`,
    method: 'POST',
    body,
    schema: canvasGraphChangeDecisionResponseSchema,
    cache: 'no-store',
  });
}
