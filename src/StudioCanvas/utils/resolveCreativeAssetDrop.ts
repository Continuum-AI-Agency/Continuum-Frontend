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
import { buildDataUrl } from './dataUrl';

export type CreativeAssetDropSuccess = {
  status: 'success';
  nodeType: 'image' | 'video' | 'audio' | 'document';
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

export async function resolveCreativeAssetDrop(
  rawPayload: string,
  resolveBase64: Base64Resolver,
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
  const isImage = /^image\//i.test(mimeType);
  const isVideo = /^video\//i.test(mimeType);
  const isAudio = /^audio\//i.test(mimeType);
  const isPDF = mimeType === 'application/pdf';
  const isText = mimeType === 'text/plain';

  if (!isImage && !isVideo && !isAudio && !isPDF && !isText) {
    return {
      status: 'error',
      title: 'Unsupported asset',
      description: 'Only image, video, audio, or text/PDF assets are supported.',
      variant: 'warning',
    };
  }

  const nodeType = isVideo ? 'video' : isAudio ? 'audio' : isPDF || isText ? 'document' : 'image';

  const maxBytes = isVideo
    ? VIDEO_REFERENCE_MAX_BYTES
    : isAudio
      ? AUDIO_REFERENCE_MAX_BYTES
      : isPDF || isText
        ? DOCUMENT_REFERENCE_MAX_BYTES
        : IMAGE_REFERENCE_MAX_BYTES;

  const label = isVideo ? 'Video' : isAudio ? 'Audio' : isPDF || isText ? 'Document' : 'Image';

  if (parsed.kind === 'data-url') {
    const estimatedBytes = estimateBase64DecodedBytes(parsed.base64);
    if (estimatedBytes > maxBytes) {
      return {
        status: 'error',
        title: `${label} too large`,
        description: `${label} is ${formatMiB(estimatedBytes)} (max ${formatMiB(maxBytes)}).`,
        variant: 'error',
      };
    }

    return {
      status: 'success',
      nodeType,
      dataUrl: buildDataUrl(mimeType, parsed.base64),
      mimeType,
    };
  }

  if (typeof parsed.sizeBytes === 'number' && parsed.sizeBytes > maxBytes) {
    return {
      status: 'error',
      title: `${label} too large`,
      description: `${label} is ${formatMiB(parsed.sizeBytes)} (max ${formatMiB(maxBytes)}).`,
      variant: 'error',
    };
  }

  try {
    const { base64, sourceName, byteLength, sourceUrl } = await resolveBase64(parsed, maxBytes);
    if (typeof byteLength === 'number' && byteLength > maxBytes) {
      return {
        status: 'error',
        title: `${label} too large`,
        description: `${label} is ${formatMiB(byteLength)} (max ${formatMiB(maxBytes)}).`,
        variant: 'error',
      };
    }

    return {
      status: 'success',
      nodeType,
      dataUrl: buildDataUrl(mimeType, base64),
      mimeType,
      fileName: sourceName && sourceName !== 'data-url' ? sourceName : undefined,
      assetId: parsed.kind === 'remote' ? parsed.assetId : undefined,
      assetVersionId: parsed.kind === 'remote' ? parsed.assetVersionId : undefined,
      sourcePath: parsed.kind === 'remote' ? parsed.path : undefined,
      bucket: parsed.kind === 'remote' ? parsed.bucket : undefined,
      sourceUrl: parsed.kind === 'remote' ? (sourceUrl ?? parsed.publicUrl) : undefined,
      durationMs: parsed.kind === 'remote' ? parsed.durationMs : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve asset';
    return {
      status: 'error',
      title: 'Drop failed',
      description: message,
      variant: 'error',
    };
  }
}
