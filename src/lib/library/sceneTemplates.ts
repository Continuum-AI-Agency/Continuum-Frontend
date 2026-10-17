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

const REOPEN_IN_BLENDER = 'Open it in a current Blender, save it, and upload it again.';

/** The forge's refusal codes (`blend-library` `Refusal`); it reads Blender 2.80 to 5.2. */
const BLEND_REFUSALS = new Map([
  [
    'too_old',
    'Saved in Blender 2.79 or older. Open it in Blender 2.80 or newer, save it, and upload it again.',
  ],
  [
    'too_new',
    'Saved in a newer Blender than Forge reads yet (5.2). Save it from Blender 5.2 or older and upload it again.',
  ],
  ['big_endian', `Saved by an old 32-bit or big-endian build of Blender. ${REOPEN_IN_BLENDER}`],
  ['pointer_32bit', `Saved by an old 32-bit or big-endian build of Blender. ${REOPEN_IN_BLENDER}`],
  ['not_blend', "This isn't a Blender file."],
  ['too_large', 'This .blend is too large to read.'],
  ['malformed', 'This .blend is damaged or incomplete. Save it again in Blender and re-upload.'],
]);

/**
 * Why a .blend did not parse, for a person. The stored error ends with the forge's code
 * ("ATV_Buggy.blend is not a readable Blender file: too_old"); an unknown one is shown as it is.
 */
export function blendParseProblem(parseError: string | null): string {
  if (!parseError) return 'This .blend could not be read.';
  const code = /([a-z0-9_]+)\s*$/.exec(parseError)?.[1] ?? '';
  return BLEND_REFUSALS.get(code) ?? `This .blend could not be read: ${parseError}`;
}

/** Any family's parse error: a Blender refusal reads as its sentence, anything else as written. */
export function parseErrorSentence(parseError: string): string {
  const code = /readable Blender file: ([a-z0-9_]+)\s*$/.exec(parseError)?.[1];
  return (code && BLEND_REFUSALS.get(code)) || parseError;
}

/** A render's stored error is a code only: `scene_render_failed` reads "Scene render failed". */
export function sceneErrorSentence(code: string): string {
  const words = code.replaceAll('_', ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : code;
}
