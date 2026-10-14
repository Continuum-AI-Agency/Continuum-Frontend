import {
  type ScenePreview,
  type ScenePreviewRequest,
  type SceneRenderHistory,
  type SceneRenderRequest,
  type SceneRenderStatus,
  type SceneTemplateView,
  scenePreviewRequestSchema,
  scenePreviewSchema,
  sceneRenderHistorySchema,
  sceneRenderRequestSchema,
  sceneRenderStatusSchema,
  sceneTemplateViewSchema,
} from '@continuum/contracts';
import { ApiError } from '@/lib/api/errors';
import { request } from '@/lib/api/http';

// A Blender scene template on the Backend: what the .blend exposes, draft previews while editing,
// and final renders into the Library. Every body is parsed against the shared contract on the way
// out and every answer on the way in, so a drifted field fails here, not inside a render.

const scenePath = (assetId: string) =>
  `/api/ai-studio/templates/${encodeURIComponent(assetId)}/scene`;
const brandQuery = (brandId: string) => `?brandId=${encodeURIComponent(brandId)}`;

/** The 202 answer. Derived from the status contract so the id keeps one definition. */
const sceneRenderAcceptedSchema = sceneRenderStatusSchema.pick({ jobId: true });

export function fetchSceneTemplate(
  brandId: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<SceneTemplateView> {
  return request({
    path: `${scenePath(assetId)}${brandQuery(brandId)}`,
    schema: sceneTemplateViewSchema,
    signal,
  });
}

export async function requestScenePreview(
  assetId: string,
  body: ScenePreviewRequest,
  signal?: AbortSignal,
): Promise<ScenePreview> {
  return request({
    path: `${scenePath(assetId)}/previews`,
    method: 'POST',
    body: scenePreviewRequestSchema.parse(body),
    schema: scenePreviewSchema,
    signal,
  });
}

export async function requestSceneRender(
  assetId: string,
  body: SceneRenderRequest,
): Promise<{ jobId: string }> {
  return request({
    path: `${scenePath(assetId)}/renders`,
    method: 'POST',
    body: sceneRenderRequestSchema.parse(body),
    schema: sceneRenderAcceptedSchema,
  });
}

export function fetchSceneRender(
  brandId: string,
  assetId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<SceneRenderStatus> {
  return request({
    path: `${scenePath(assetId)}/renders/${encodeURIComponent(jobId)}${brandQuery(brandId)}`,
    schema: sceneRenderStatusSchema,
    signal,
  });
}

export function listSceneRenders(
  brandId: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<SceneRenderHistory> {
  return request({
    path: `${scenePath(assetId)}/renders${brandQuery(brandId)}`,
    schema: sceneRenderHistorySchema,
    signal,
  });
}

const TERMINAL_RENDER_STATES = new Set(['completed', 'failed', 'cancelled', 'superseded']);
export const isTerminalSceneRender = (state: string) => TERMINAL_RENDER_STATES.has(state);

/**
 * The scene routes answer `{ error: <code>, detail: <sentence> }`, so `ApiError.code` is empty and
 * `message` is the bare code. `detail` is a fixed sentence the Backend writes for people (never
 * renderer output), so it is what the editor shows; a proxy error with no body falls back to the
 * status line.
 */
export function sceneProblem(error: unknown): { code: string | null; message: string } {
  if (!(error instanceof ApiError)) {
    return { code: null, message: error instanceof Error ? error.message : String(error) };
  }
  const code =
    typeof error.payload?.error === 'string' ? error.payload.error : (error.code ?? null);
  const detail = typeof error.payload?.detail === 'string' ? error.payload.detail : null;
  return { code, message: detail ?? error.message };
}

/** A render's stored error is a code only: `scene_render_failed` reads "Scene render failed". */
export function sceneErrorSentence(code: string): string {
  const words = code.replaceAll('_', ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : code;
}
