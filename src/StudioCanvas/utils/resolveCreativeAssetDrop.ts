import { canvasLibrarySource, classifyLibraryFileOrGeneric } from '@continuum/contracts';
import {
  AUDIO_REFERENCE_MAX_BYTES,
  DOCUMENT_REFERENCE_MAX_BYTES,
  estimateBase64DecodedBytes,
  formatMiB,
  IMAGE_REFERENCE_MAX_BYTES,
  type ParsedReferenceDropPayload,
  parseReferenceDropPayload,
  resolveReferenceMimeType,
  VIDEO_REFERENCE_MAX_BYTES,
} from '@/lib/ai-studio/referenceDrop';
import {
  type LibraryCanvasPick,
  pickCanvasLibrarySource,
  readCanvasLibraryContext,
} from '@/lib/creative-assets/canvasLibrarySource';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { buildDataUrl } from './dataUrl';

type DropNodeType = 'image' | 'video' | 'audio' | 'document';

export type CreativeAssetDropSuccess = {
  status: 'success';
  nodeType: DropNodeType;
  dataUrl: string;
  mimeType: string;
  fileName?: string;
  // media.assets id, present when the drop came from the Library (the drag payload
  // carries it). The node keeps it so a generation fed by this reference can be
  // traced back to the asset.
  assetId?: string;
  assetVersionId?: string;
  sourcePath?: string;
  bucket?: string;
  sourceUrl?: string;
  // Library video rows that recorded a duration carry it here so the node keeps it —
  // duration-dependent ops (burn-in windows, trims) then start from a real length
  // instead of a 0.00s clip.
  durationMs?: number;
  // Set when the bytes are a Library RENDITION of the asset (a PSD's preview_image, an
  // MKV's proxy): sourcePath/bucket then point at the rendition, assetId/assetVersionId
  // still at the source. Null when the Library confirmed the original is drawable.
  renditionRole?: string | null;
};

export type CreativeAssetDropError = {
  status: 'error';
  title: string;
  description?: string;
  variant?: 'warning' | 'error';
};

export type CreativeAssetDropResult = CreativeAssetDropSuccess | CreativeAssetDropError;

export type Base64Resolver = (
  parsed: ParsedReferenceDropPayload,
  maxBytes: number,
) => Promise<{ base64: string; sourceName?: string; byteLength?: number; sourceUrl?: string }>;

/** Reads what the canvas should draw for one Library asset (+ pinned version). */
export type LibrarySourceReader = (ref: {
  brandId: string;
  assetId: string;
  assetVersionId?: string;
}) => Promise<LibraryCanvasPick | null>;

type RemotePayload = Extract<ParsedReferenceDropPayload, { kind: 'remote' }>;

export const NO_CANVAS_PREVIEW_YET = 'No canvas preview yet — the Library is still rendering it';
export const NO_CANVAS_PREVIEW = 'This file type has no canvas preview';

const MAX_BYTES: Record<DropNodeType, number> = {
  image: IMAGE_REFERENCE_MAX_BYTES,
  video: VIDEO_REFERENCE_MAX_BYTES,
  audio: AUDIO_REFERENCE_MAX_BYTES,
  document: DOCUMENT_REFERENCE_MAX_BYTES,
};

const LABEL: Record<DropNodeType, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
};

export const readLibraryDropSource: LibrarySourceReader = async (ref) =>
  pickCanvasLibrarySource(
    await readCanvasLibraryContext(createSupabaseBrowserClient(), {
      brandId: ref.brandId,
      assetIds: [ref.assetId],
      versionIds: ref.assetVersionId ? [ref.assetVersionId] : [],
    }),
    ref.assetId,
    ref.assetVersionId,
  );

function nodeTypeForMime(mimeType: string): DropNodeType | null {
  if (/^video\//i.test(mimeType)) return 'video';
  if (/^audio\//i.test(mimeType)) return 'audio';
  if (mimeType === 'application/pdf' || mimeType === 'text/plain') return 'document';
  if (/^image\//i.test(mimeType)) return 'image';
  return null;
}

// Whether the browser can draw this Library original as-is. Asked of the same registry
// the Library uses, so a PSD (image/vnd.adobe.photoshop) or an MKV is never mistaken for
// a drawable image/video just because of its MIME prefix.
function drawsOriginal(parsed: RemotePayload, mimeType: string): boolean {
  const fileName = (parsed.path ?? parsed.publicUrl ?? '').split('?')[0]?.split('/').pop() ?? '';
  const kind = nodeTypeForMime(mimeType);
  return (
    canvasLibrarySource({
      kind: kind === 'image' || kind === 'video' || kind === 'audio' ? kind : 'file',
      fileName,
      mimeType,
      bucket: parsed.bucket ?? '',
      storagePath: parsed.path ?? '',
      renditions: [],
    }) !== null
  );
}

function tooLarge(nodeType: DropNodeType, bytes: number): CreativeAssetDropError {
  const label = LABEL[nodeType];
  return {
    status: 'error',
    title: `${label} too large`,
    description: `${label} is ${formatMiB(bytes)} (max ${formatMiB(MAX_BYTES[nodeType])}).`,
    variant: 'error',
  };
}

function dropFailed(error: unknown): CreativeAssetDropError {
  return {
    status: 'error',
    title: 'Drop failed',
    description: error instanceof Error ? error.message : 'Failed to resolve asset',
    variant: 'error',
  };
}

export async function resolveCreativeAssetDrop(
  rawPayload: string,
  resolveBase64: Base64Resolver,
  readLibrarySource: LibrarySourceReader = readLibraryDropSource,
): Promise<CreativeAssetDropResult> {
  if (!rawPayload) {
    return {
      status: 'error',
      title: 'Drop ignored',
      description: 'No asset data detected in drop.',
      variant: 'warning',
    };
  }

  const parsed = parseReferenceDropPayload(rawPayload);
  if (!parsed) {
    return {
      status: 'error',
      title: 'Drop failed',
      description: 'Unrecognized asset payload.',
      variant: 'error',
    };
  }

  const mimeType = resolveReferenceMimeType(parsed);

  // Native Library files stay on the fast path below (no extra read); anything the
  // browser cannot draw is swapped for the Library's own rendition.
  if (
    parsed.kind === 'remote' &&
    parsed.assetId &&
    parsed.brandId &&
    !drawsOriginal(parsed, mimeType)
  ) {
    return resolveLibraryRenditionDrop(
      parsed,
      { brandId: parsed.brandId, assetId: parsed.assetId },
      resolveBase64,
      readLibrarySource,
    );
  }

  const nodeType = nodeTypeForMime(mimeType);
  if (!nodeType) {
    return {
      status: 'error',
      title: 'Unsupported asset',
      description: 'Only image, video, audio, or text/PDF assets are supported.',
      variant: 'warning',
    };
  }
  return resolveDropBytes(parsed, mimeType, nodeType, resolveBase64);
}

async function resolveLibraryRenditionDrop(
  parsed: RemotePayload,
  ref: { brandId: string; assetId: string },
  resolveBase64: Base64Resolver,
  readLibrarySource: LibrarySourceReader,
): Promise<CreativeAssetDropResult> {
  let pick: LibraryCanvasPick | null;
  try {
    pick = await readLibrarySource({ ...ref, assetVersionId: parsed.assetVersionId });
  } catch (error) {
    return dropFailed(error);
  }
  if (!pick) {
    return {
      status: 'error',
      title: 'Drop failed',
      description: 'That Library asset is no longer available.',
      variant: 'error',
    };
  }

  const { version, source } = pick;
  if (!source) {
    // ponytail: "still rendering" is inferred from the format having a preview strategy;
    // the context lists ready renditions only, so a failed render reads the same.
    const never =
      classifyLibraryFileOrGeneric({ fileName: version.fileName, mimeType: version.mimeType })
        .previewStrategy === 'none';
    return {
      status: 'error',
      title: never ? NO_CANVAS_PREVIEW : NO_CANVAS_PREVIEW_YET,
      description: version.fileName,
      variant: 'warning',
    };
  }

  // A rendition is read from its own coordinates (media-previews, member-readable) and
  // carries no asset id, so the byte resolver signs it in place instead of asking the
  // Library sign route for the ORIGINAL.
  const coordinates: RemotePayload = source.renditionRole
    ? { kind: 'remote', bucket: source.bucket, path: source.storagePath, mimeType: source.mimeType }
    : { ...parsed, mimeType: source.mimeType };
  const result = await resolveDropBytes(
    coordinates,
    source.mimeType,
    source.nodeType,
    resolveBase64,
  );
  if (result.status === 'error') return result;
  return {
    ...result,
    fileName: version.fileName,
    assetId: ref.assetId,
    assetVersionId: version.id,
    renditionRole: source.renditionRole,
    durationMs:
      version.durationMs && version.durationMs > 0 ? version.durationMs : result.durationMs,
  };
}

async function resolveDropBytes(
  parsed: ParsedReferenceDropPayload,
  mimeType: string,
  nodeType: DropNodeType,
  resolveBase64: Base64Resolver,
): Promise<CreativeAssetDropResult> {
  const maxBytes = MAX_BYTES[nodeType];

  if (parsed.kind === 'data-url') {
    const estimatedBytes = estimateBase64DecodedBytes(parsed.base64);
    if (estimatedBytes > maxBytes) return tooLarge(nodeType, estimatedBytes);
    return {
      status: 'success',
      nodeType,
      dataUrl: buildDataUrl(mimeType, parsed.base64),
      mimeType,
    };
  }

  if (typeof parsed.sizeBytes === 'number' && parsed.sizeBytes > maxBytes) {
    return tooLarge(nodeType, parsed.sizeBytes);
  }

  try {
    const { base64, sourceName, byteLength, sourceUrl } = await resolveBase64(parsed, maxBytes);
    if (typeof byteLength === 'number' && byteLength > maxBytes) {
      return tooLarge(nodeType, byteLength);
    }

    return {
      status: 'success',
      nodeType,
      dataUrl: buildDataUrl(mimeType, base64),
      mimeType,
      fileName: sourceName && sourceName !== 'data-url' ? sourceName : undefined,
      assetId: parsed.assetId,
      assetVersionId: parsed.assetVersionId,
      sourcePath: parsed.path,
      bucket: parsed.bucket,
      sourceUrl: sourceUrl ?? parsed.publicUrl,
      durationMs: parsed.durationMs,
    };
  } catch (error) {
    return dropFailed(error);
  }
}
