'use client';

import {
  type AssetPreviewState,
  classifyLibraryFile,
  type SignAssetRenditionOperation,
  signAssetRenditionResponseSchema,
} from '@continuum/contracts';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { generateVideoPoster } from './videoPoster';

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

const PREVIEW_MAX_EDGE = 1600;
const PREVIEW_WEBP_QUALITY = 0.86;

export type PersistedPreview = {
  renditionId: string;
  state: 'ready';
  signedUrl: string | null;
};

async function invokeCreativeOperation(
  client: SupabaseBrowserClient,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.functions.invoke('library-creative-operations', { body });
  if (error) throw new Error(error.message ?? 'Creative Operations request failed');
  return data;
}

function extensionForMime(mimeType: string): SignAssetRenditionOperation['extension'] {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'video/mp4') return 'mp4';
  return 'webp';
}

export async function persistAssetRendition(params: {
  client: SupabaseBrowserClient;
  brandId: string;
  assetId: string;
  assetVersionId: string;
  role: SignAssetRenditionOperation['role'];
  blob: Blob;
  mimeType: SignAssetRenditionOperation['mimeType'];
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  renderer: string;
}): Promise<PersistedPreview> {
  const signed = signAssetRenditionResponseSchema.parse(
    await invokeCreativeOperation(params.client, {
      action: 'sign_asset_rendition',
      brandId: params.brandId,
      assetId: params.assetId,
      assetVersionId: params.assetVersionId,
      role: params.role,
      mimeType: params.mimeType,
      extension: extensionForMime(params.mimeType),
    }),
  );
  const { error: uploadError } = await params.client.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, params.blob, { contentType: params.mimeType });
  if (uploadError) throw new Error(`Preview upload failed: ${uploadError.message}`);
  const completed = (await invokeCreativeOperation(params.client, {
    action: 'complete_asset_rendition',
    brandId: params.brandId,
    assetId: params.assetId,
    assetVersionId: params.assetVersionId,
    renditionId: signed.renditionId,
    mimeType: params.mimeType,
    sizeBytes: params.blob.size,
    width: params.width ?? null,
    height: params.height ?? null,
    durationMs: params.durationMs ?? null,
    renderer: params.renderer,
    rendererVersion: '1',
  })) as { signedUrl?: unknown } | null;
  return {
    renditionId: signed.renditionId,
    state: 'ready',
    signedUrl: typeof completed?.signedUrl === 'string' ? completed.signedUrl : null,
  };
}

async function markPreviewState(params: {
  client: SupabaseBrowserClient;
  brandId: string;
  assetId: string;
  assetVersionId: string;
  state: Extract<AssetPreviewState, 'awaiting_companion' | 'unsupported' | 'failed'>;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  await invokeCreativeOperation(params.client, {
    action: 'mark_asset_preview_state',
    brandId: params.brandId,
    assetId: params.assetId,
    assetVersionId: params.assetVersionId,
    state: params.state,
    ...(params.errorCode ? { errorCode: params.errorCode } : {}),
    ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
  });
}

async function canvasBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: PREVIEW_WEBP_QUALITY });
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', PREVIEW_WEBP_QUALITY));
}

export async function rasterizeBrowserImage(file: Blob): Promise<{
  blob: Blob;
  width: number;
  height: number;
} | null> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      // Per-branch getContext so TS keeps the concrete 2d context type — the union
      // HTMLCanvasElement.getContext(string) overload widens to RenderingContext,
      // which includes bitmap-renderer contexts without drawImage.
      const canvas =
        typeof OffscreenCanvas === 'function'
          ? new OffscreenCanvas(width, height)
          : Object.assign(document.createElement('canvas'), { width, height });
      const context =
        canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasBlob(canvas);
      return blob ? { blob, width, height } : null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

export async function attachAssetPreview(params: {
  file: File;
  brandId: string;
  assetId: string;
  assetVersionId: string;
  client?: SupabaseBrowserClient;
}): Promise<AssetPreviewState> {
  const client = params.client ?? createSupabaseBrowserClient();
  const format = classifyLibraryFile({ fileName: params.file.name, mimeType: params.file.type });
  if (!format.accepted) return 'unsupported';
  if (format.previewStrategy === 'native') return 'ready';

  if (format.previewStrategy === 'browser_video') {
    const poster = await generateVideoPoster(params.file);
    if (!poster) {
      await markPreviewState({
        ...params,
        client,
        state: 'failed',
        errorCode: 'browser_decode_failed',
        errorMessage: 'This browser could not decode a representative video frame.',
      });
      return 'failed';
    }
    await persistAssetRendition({
      ...params,
      client,
      role: 'poster',
      blob: poster.blob,
      mimeType: poster.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
      width: poster.width,
      height: poster.height,
      renderer: 'mediabunny-browser-poster',
    });
    return 'ready';
  }

  if (format.previewStrategy === 'browser_raster') {
    const preview = await rasterizeBrowserImage(params.file);
    if (preview) {
      await persistAssetRendition({
        ...params,
        client,
        role: 'preview_image',
        blob: preview.blob,
        mimeType: 'image/webp',
        width: preview.width,
        height: preview.height,
        renderer: 'browser-image-decoder',
      });
      return 'ready';
    }
  }

  await markPreviewState({
    ...params,
    client,
    state: 'awaiting_companion',
    errorCode: 'companion_preview_required',
    errorMessage: 'Upload a PNG, JPEG, WebP, or MP4 companion preview.',
  });
  return 'awaiting_companion';
}

export async function uploadCompanionPreview(params: {
  file: File;
  brandId: string;
  assetId: string;
  assetVersionId: string;
  client?: SupabaseBrowserClient;
}): Promise<void> {
  const client = params.client ?? createSupabaseBrowserClient();
  if (params.file.type === 'video/mp4') {
    await persistAssetRendition({
      ...params,
      client,
      role: 'preview_video',
      blob: params.file,
      mimeType: 'video/mp4',
      renderer: 'user-companion',
    });
    const poster = await generateVideoPoster(params.file);
    if (poster) {
      await persistAssetRendition({
        ...params,
        client,
        role: 'poster',
        blob: poster.blob,
        mimeType: poster.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
        width: poster.width,
        height: poster.height,
        renderer: 'mediabunny-companion-poster',
      });
    }
    return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(params.file.type)) {
    throw new Error('Companion previews must be PNG, JPEG, WebP, or MP4.');
  }
  const rasterized = await rasterizeBrowserImage(params.file);
  if (!rasterized) throw new Error('The companion image could not be decoded.');
  await persistAssetRendition({
    ...params,
    client,
    role: 'preview_image',
    blob: rasterized.blob,
    mimeType: 'image/webp',
    width: rasterized.width,
    height: rasterized.height,
    renderer: 'user-companion',
  });
}
