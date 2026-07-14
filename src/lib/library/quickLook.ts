// Client seam for the Library detail modal's AI actions (Brand quick look +
// Smart resize). Wraps the Backend AI Studio image endpoint
// (POST /api/ai-studio/generate, SSE response) with typed request builders,
// zod-narrowed event parsing, blob/File conversion, and the save-as-new-version
// flow. Mirrors the canvas client path (direct fetch to the Fastify backend via
// getApiUrl — no Next proxy); the endpoint takes the asset as a reference image
// via storage coords + signed URL and brand_book_pieces for enforced grounding.

import {
  type BrandBookPieceKind,
  brandBookPieceKindSchema,
  type MediaAsset,
  type RegisterCanvasAssetRequest,
  registerCanvasAssetResponseSchema,
  registerVersionResponseSchema,
  versionSignUploadResponseSchema,
} from '@continuum/contracts';
import { z } from 'zod';

import { getApiUrl } from '@/lib/api/config';
import { readServerSentEvents } from '@/lib/sse/readServerSentEvents';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

export const GENERATE_IMAGE_PATH = '/api/ai-studio/generate';

// Nano Banana flash 3.1: the current image-to-image editing model; honors
// generationConfig.imageConfig (aspectRatio + imageSize) on the Backend.
export const QUICK_LOOK_MODEL = 'gemini-3.1-flash-image-preview';
export const QUICK_LOOK_IMAGE_SIZE = '1K';

export const BRAND_BOOK_PIECE_OPTIONS: readonly BrandBookPieceKind[] =
  brandBookPieceKindSchema.options;

export const QUICK_LOOK_BASE_PROMPT =
  'Edit the provided reference image so it aligns with our brand identity. ' +
  'Keep the original subject, composition, and intent recognizable; change only what is needed to match the brand.';

export type ResizePlatform = 'Instagram' | 'X (Twitter)';

export type ResizePreset = {
  id: string;
  label: string;
  platform: ResizePlatform;
  /** Display ratio, e.g. "1.91:1". */
  ratio: string;
  /** Model-supported integer ratio sent on the wire, e.g. "16:9". */
  apiAspectRatio: string;
  /** File name suffix, e.g. "1x1" -> photo-1x1.png. */
  fileSuffix: string;
};

export const RESIZE_PRESETS: readonly ResizePreset[] = [
  {
    id: 'ig-feed-square',
    label: 'Feed square',
    platform: 'Instagram',
    ratio: '1:1',
    apiAspectRatio: '1:1',
    fileSuffix: '1x1',
  },
  {
    id: 'ig-feed-portrait',
    label: 'Feed portrait',
    platform: 'Instagram',
    ratio: '4:5',
    apiAspectRatio: '4:5',
    fileSuffix: '4x5',
  },
  {
    id: 'ig-feed-landscape',
    label: 'Feed landscape',
    platform: 'Instagram',
    ratio: '1.91:1',
    apiAspectRatio: '16:9',
    fileSuffix: '191x100',
  },
  {
    id: 'ig-story-reel',
    label: 'Story / Reel',
    platform: 'Instagram',
    ratio: '9:16',
    apiAspectRatio: '9:16',
    fileSuffix: '9x16',
  },
  {
    id: 'x-in-stream',
    label: 'In-stream',
    platform: 'X (Twitter)',
    ratio: '16:9',
    apiAspectRatio: '16:9',
    fileSuffix: '16x9',
  },
];

// Request shape narrowed from Continuum-Backend/App/ai-studio/types.ts
// imageRequestSchema — the subset this seam sends.
const studioReferenceImageSchema = z.object({
  storage_bucket: z.string().min(1).optional(),
  storage_path: z.string().min(1).optional(),
  image_url: z.string().min(1).optional(),
  mime_type: z.string().min(1),
  filename: z.string().optional(),
});

export const studioImageGenerateRequestSchema = z.object({
  service: z.literal('nano-banana'),
  prompt: z.string().min(1),
  brand_id: z.string().min(1),
  model: z.literal(QUICK_LOOK_MODEL),
  image_size: z.enum(['512px', '1K', '2K', '4K']),
  aspect_ratio: z
    .string()
    .regex(/^\d+:\d+$/)
    .optional(),
  filename: z.string().optional(),
  reference_images: z.array(studioReferenceImageSchema).min(1).max(14),
  brand_book_pieces: z.array(brandBookPieceKindSchema).max(8).optional(),
});
export type StudioImageGenerateRequest = z.infer<typeof studioImageGenerateRequestSchema>;

type ReferenceAssetLike = Pick<
  MediaAsset,
  'bucket' | 'storagePath' | 'signedUrl' | 'mimeType' | 'fileName'
>;

// Storage coords are the durable reference source (the Backend downloads via
// its service-role client); the signed URL rides along as a fallback.
function assetReferenceImage(asset: ReferenceAssetLike) {
  return {
    storage_bucket: asset.bucket,
    storage_path: asset.storagePath,
    ...(asset.signedUrl ? { image_url: asset.signedUrl } : {}),
    mime_type: asset.mimeType,
    filename: asset.fileName,
  };
}

// Inserts a suffix before the file extension: photo.png + 1x1 -> photo-1x1.png.
export function suffixFileName(fileName: string, suffix: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return `${fileName}-${suffix}`;
  return `${fileName.slice(0, lastDot)}-${suffix}${fileName.slice(lastDot)}`;
}

export function buildQuickLookRequest(params: {
  brandId: string;
  asset: ReferenceAssetLike;
  pieces: readonly BrandBookPieceKind[];
  instruction?: string;
}): StudioImageGenerateRequest {
  const { brandId, asset, pieces, instruction } = params;
  const trimmed = instruction?.trim();
  const dedupedPieces = [...new Set(pieces)];
  return studioImageGenerateRequestSchema.parse({
    service: 'nano-banana',
    prompt: trimmed ? `${QUICK_LOOK_BASE_PROMPT}\n\n${trimmed}` : QUICK_LOOK_BASE_PROMPT,
    brand_id: brandId,
    model: QUICK_LOOK_MODEL,
    image_size: QUICK_LOOK_IMAGE_SIZE,
    filename: suffixFileName(asset.fileName, 'brand'),
    reference_images: [assetReferenceImage(asset)],
    brand_book_pieces: dedupedPieces.length > 0 ? dedupedPieces : ['full'],
  });
}

export function buildResizeRequest(params: {
  brandId: string;
  asset: ReferenceAssetLike;
  preset: ResizePreset;
}): StudioImageGenerateRequest {
  const { brandId, asset, preset } = params;
  return studioImageGenerateRequestSchema.parse({
    service: 'nano-banana',
    prompt:
      `Reframe and extend the provided reference image to a ${preset.ratio} aspect ratio ` +
      `(${preset.platform} ${preset.label}). Keep the main subject centered and fully visible. ` +
      'Extend the scene naturally to fill the new frame — no letterboxing, no borders, no stretching or distortion.',
    brand_id: brandId,
    model: QUICK_LOOK_MODEL,
    image_size: QUICK_LOOK_IMAGE_SIZE,
    aspect_ratio: preset.apiAspectRatio,
    filename: suffixFileName(asset.fileName, preset.fileSuffix),
    reference_images: [assetReferenceImage(asset)],
  });
}

// SSE event payloads narrowed from the Backend controller's emit shapes
// (handleImageGeneration). URL-first mode delivers signed_url on the final
// image event plus a stored event with bucket/path; base64/data_url appear
// only in the legacy/fallback path.
const studioImageEventSchema = z.object({
  mime_type: z.string().optional(),
  signed_url: z.string().optional(),
  bucket: z.string().optional(),
  path: z.string().optional(),
  base64: z.string().optional(),
  data_url: z.string().optional(),
  thought: z.boolean().optional(),
});

const studioStoredEventSchema = z.object({
  bucket: z.string().optional(),
  path: z.string().optional(),
  signed_url: z.string().optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

const studioErrorEventSchema = z.object({ message: z.string() });

export type StudioImageResult = {
  mimeType: string;
  signedUrl?: string;
  base64?: string;
  bucket?: string;
  path?: string;
  sizeBytes?: number;
};

export type GenerateStudioImageOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) return body.error;
  } catch {
    // non-JSON error body; the status is the message
  }
  return `AI Studio request failed (${response.status})`;
}

function parseEventJson(data: string): unknown {
  try {
    return JSON.parse(data.trimStart()) as unknown;
  } catch {
    return null;
  }
}

export async function generateStudioImage(
  request: StudioImageGenerateRequest,
  options: GenerateStudioImageOptions = {},
): Promise<StudioImageResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(getApiUrl(GENERATE_IMAGE_PATH), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(request),
    signal: options.signal,
  });

  if (!response.ok) throw new Error(await readErrorBody(response));
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI Studio returned no response body');

  let image: z.infer<typeof studioImageEventSchema> | null = null;
  let stored: z.infer<typeof studioStoredEventSchema> | null = null;
  let errorMessage: string | null = null;

  await readServerSentEvents({
    reader,
    signal: options.signal,
    onEvent: (eventName, data) => {
      const raw = parseEventJson(data);
      if (raw === null) return;
      if (eventName === 'image') {
        const parsed = studioImageEventSchema.safeParse(raw);
        // Thought images are intermediate sketches; keep the final image only.
        if (parsed.success && parsed.data.thought !== true) image = parsed.data;
      } else if (eventName === 'stored') {
        const parsed = studioStoredEventSchema.safeParse(raw);
        if (parsed.success) stored = parsed.data;
      } else if (eventName === 'error') {
        const parsed = studioErrorEventSchema.safeParse(raw);
        errorMessage = parsed.success ? parsed.data.message : 'AI Studio generation failed';
      }
    },
  });

  if (errorMessage) throw new Error(errorMessage);
  const finalImage = image as z.infer<typeof studioImageEventSchema> | null;
  const finalStored = stored as z.infer<typeof studioStoredEventSchema> | null;
  const signedUrl = finalImage?.signed_url ?? finalStored?.signed_url;
  const base64 = finalImage?.base64 ?? finalImage?.data_url;
  if (!signedUrl && !base64) throw new Error('AI Studio returned no image');

  return {
    mimeType: finalImage?.mime_type ?? 'image/png',
    ...(signedUrl ? { signedUrl } : {}),
    ...(base64 ? { base64 } : {}),
    ...((finalImage?.bucket ?? finalStored?.bucket)
      ? { bucket: finalImage?.bucket ?? finalStored?.bucket }
      : {}),
    ...((finalImage?.path ?? finalStored?.path)
      ? { path: finalImage?.path ?? finalStored?.path }
      : {}),
    ...(typeof finalStored?.size_bytes === 'number' ? { sizeBytes: finalStored.size_bytes } : {}),
  };
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Generated bytes may come back in a different format than the source asset
// (e.g. .jpg in, image/png out) — realign the extension so the saved file name
// matches its contents.
export function ensureExtensionForMime(fileName: string, mimeType: string): string {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) return fileName;
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return `${fileName}.${extension}`;
  return `${fileName.slice(0, lastDot)}.${extension}`;
}

const DATA_URL_PATTERN = /^data:([^;]+);base64,([\s\S]*)$/;

function base64ToBytes(value: string): { buffer: ArrayBuffer; mimeType?: string } {
  const match = DATA_URL_PATTERN.exec(value);
  const base64 = match ? match[2] : value;
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { buffer, mimeType: match ? match[1] : undefined };
}

export async function studioResultToFile(
  result: StudioImageResult,
  fileName: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<File> {
  if (result.signedUrl) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(result.signedUrl);
    if (!response.ok)
      throw new Error(`could not download the generated image (${response.status})`);
    const blob = await response.blob();
    const mimeType = blob.type || result.mimeType;
    return new File([blob], ensureExtensionForMime(fileName, mimeType), { type: mimeType });
  }
  if (result.base64) {
    const { buffer, mimeType } = base64ToBytes(result.base64);
    const resolvedMime = mimeType ?? result.mimeType;
    return new File([buffer], ensureExtensionForMime(fileName, resolvedMime), {
      type: resolvedMime,
    });
  }
  throw new Error('generation result carries no image bytes');
}

// Save-as-new-version flow against the WS3 version routes, coded to the
// @continuum/contracts shapes: sign -> PUT bytes via uploadToSignedUrl ->
// register (archives the head, promotes this file).
export type SaveVersionDeps = {
  createClient?: () => SupabaseBrowserClient;
  fetchImpl?: typeof fetch;
};

async function postJson(
  fetchImpl: typeof fetch,
  path: string,
  body: unknown,
  label: string,
): Promise<unknown> {
  const response = await fetchImpl(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const parsed = (await response.json()) as { error?: string };
      detail = parsed.error ? `: ${parsed.error}` : '';
    } catch {
      // non-JSON error body; status alone is the message
    }
    throw new Error(`${label} request failed (${response.status})${detail}`);
  }
  return response.json();
}

export async function saveFileAsNewVersion(
  params: { brandId: string; assetId: string; file: File; note?: string },
  deps: SaveVersionDeps = {},
): Promise<number> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const supabase = (deps.createClient ?? createSupabaseBrowserClient)();
  const { brandId, assetId, file, note } = params;

  const ticket = versionSignUploadResponseSchema.parse(
    await postJson(
      fetchImpl,
      '/api/library/versions/sign',
      {
        brandId,
        assetId,
        fileName: file.name,
        mimeType: file.type,
      },
      'Version',
    ),
  );

  const { error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) throw new Error(`upload to storage failed: ${error.message}`);

  const registered = registerVersionResponseSchema.parse(
    await postJson(
      fetchImpl,
      '/api/library/versions',
      {
        brandId,
        assetId,
        bucket: ticket.bucket,
        storagePath: ticket.path,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        ...(note ? { note } : {}),
      },
      'Version',
    ),
  );
  return registered.versionNumber;
}

// A Smart resize output is ALREADY in storage — the AI Studio backend uploads it
// before it streams the result — so the Library registers it in place: no download,
// no re-upload, and one row instead of two. The row carries the asset it was
// reframed from, which is the whole point: media_get_asset_usage reads that lineage
// back when someone asks where a creative has been used.
export type ResizeSourceAsset = Pick<MediaAsset, 'id' | 'fileName'>;

export async function registerResizedAsset(
  params: {
    brandId: string;
    asset: ResizeSourceAsset;
    preset: ResizePreset;
    result: StudioImageResult;
  },
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const { brandId, asset, preset, result } = params;
  if (!result.bucket || !result.path) {
    throw new Error('the generated image was not stored, so it cannot be registered');
  }

  const request: RegisterCanvasAssetRequest = {
    brandProfileId: brandId,
    kind: 'image',
    bucket: result.bucket,
    storagePath: result.path,
    fileName: ensureExtensionForMime(
      suffixFileName(asset.fileName, preset.fileSuffix),
      result.mimeType,
    ),
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    originRef: {
      kind: 'resize',
      sourceAssetId: asset.id,
      preset: preset.id,
      aspectRatio: preset.apiAspectRatio,
      model: QUICK_LOOK_MODEL,
    },
  };

  const response = registerCanvasAssetResponseSchema.parse(
    await postJson(deps.fetchImpl ?? fetch, '/api/library/register-canvas', request, 'Register'),
  );
  return response.assetId;
}

// Bounded fan-out for Smart resize: runs tasks with at most `limit` in flight,
// preserving input order in the results. Tasks are expected to catch their own
// errors (a rejection aborts the batch).
export async function runWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, tasks.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}
