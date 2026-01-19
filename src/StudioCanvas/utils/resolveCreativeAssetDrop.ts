import {
  IMAGE_REFERENCE_MAX_BYTES,
  VIDEO_REFERENCE_MAX_BYTES,
  AUDIO_REFERENCE_MAX_BYTES,
  DOCUMENT_REFERENCE_MAX_BYTES,
  estimateBase64DecodedBytes,
  formatMiB,
  parseReferenceDropPayload,
  resolveReferenceMimeType,
  type ParsedReferenceDropPayload,
} from "@/lib/ai-studio/referenceDrop";
import { buildDataUrl } from "./dataUrl";

export type CreativeAssetDropSuccess = {
  status: "success";
  nodeType: "image" | "video" | "audio" | "document";
  dataUrl: string;
  mimeType: string;
  fileName?: string;
};

export type CreativeAssetDropError = {
  status: "error";
  title: string;
  description?: string;
  variant?: "warning" | "error";
};

export type CreativeAssetDropResult = CreativeAssetDropSuccess | CreativeAssetDropError;

export type Base64Resolver = (
  parsed: ParsedReferenceDropPayload,
  maxBytes: number
) => Promise<{ base64: string; sourceName?: string; byteLength?: number }>;

export async function resolveCreativeAssetDrop(
  rawPayload: string,
  resolveBase64: Base64Resolver
): Promise<CreativeAssetDropResult> {
  if (!rawPayload) {
    return {
      status: "error",
      title: "Drop ignored",
      description: "No asset data detected in drop.",
      variant: "warning",
    };
  }

  const parsed = parseReferenceDropPayload(rawPayload);
  if (!parsed) {
    return {
      status: "error",
      title: "Drop failed",
      description: "Unrecognized asset payload.",
      variant: "error",
    };
  }

  const mimeType = resolveReferenceMimeType(parsed);
  const isImage = /^image\//i.test(mimeType);
  const isVideo = /^video\//i.test(mimeType);
  const isAudio = /^audio\//i.test(mimeType);
  const isPDF = mimeType === "application/pdf";
  const isText = mimeType === "text/plain";

  if (!isImage && !isVideo && !isAudio && !isPDF && !isText) {
    return {
      status: "error",
      title: "Unsupported asset",
      description: "Only image, video, audio, or text/PDF assets are supported.",
      variant: "warning",
    };
  }

  const nodeType = isVideo ? "video" : isAudio ? "audio" : (isPDF || isText) ? "document" : "image";
  
  const maxBytes = isVideo 
    ? VIDEO_REFERENCE_MAX_BYTES 
    : isAudio 
      ? AUDIO_REFERENCE_MAX_BYTES 
      : (isPDF || isText) 
        ? DOCUMENT_REFERENCE_MAX_BYTES 
        : IMAGE_REFERENCE_MAX_BYTES;

  const label = isVideo ? "Video" : isAudio ? "Audio" : (isPDF || isText) ? "Document" : "Image";

  if (parsed.kind === "data-url") {
    const estimatedBytes = estimateBase64DecodedBytes(parsed.base64);
    if (estimatedBytes > maxBytes) {
      return {
        status: "error",
        title: `${label} too large`,
        description: `${label} is ${formatMiB(estimatedBytes)} (max ${formatMiB(maxBytes)}).`,
        variant: "error",
      };
    }

    return {
      status: "success",
      nodeType,
      dataUrl: buildDataUrl(mimeType, parsed.base64),
      mimeType,
    };
  }

  if (typeof parsed.sizeBytes === "number" && parsed.sizeBytes > maxBytes) {
    return {
      status: "error",
      title: `${label} too large`,
      description: `${label} is ${formatMiB(parsed.sizeBytes)} (max ${formatMiB(maxBytes)}).`,
      variant: "error",
    };
  }

  try {
    const { base64, sourceName, byteLength } = await resolveBase64(parsed, maxBytes);
    if (typeof byteLength === "number" && byteLength > maxBytes) {
      return {
        status: "error",
        title: `${label} too large`,
        description: `${label} is ${formatMiB(byteLength)} (max ${formatMiB(maxBytes)}).`,
        variant: "error",
      };
    }

    return {
      status: "success",
      nodeType,
      dataUrl: buildDataUrl(mimeType, base64),
      mimeType,
      fileName: sourceName && sourceName !== "data-url" ? sourceName : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve asset";
    return {
      status: "error",
      title: "Drop failed",
      description: message,
      variant: "error",
    };
  }
}
