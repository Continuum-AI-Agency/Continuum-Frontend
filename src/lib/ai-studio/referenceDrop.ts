export const MEBIBYTE_BYTES = 1024 * 1024;

export const IMAGE_REFERENCE_MAX_BYTES = 5 * MEBIBYTE_BYTES;
export const VIDEO_REFERENCE_MAX_BYTES = 50 * MEBIBYTE_BYTES;
export const AUDIO_REFERENCE_MAX_BYTES = 10 * MEBIBYTE_BYTES;
export const DOCUMENT_REFERENCE_MAX_BYTES = 10 * MEBIBYTE_BYTES;

export type ParsedReferenceDropPayload =
  | { kind: "data-url"; mimeType: string; base64: string }
  | { kind: "remote"; path?: string; publicUrl?: string; mimeType?: string; sizeBytes?: number };

type LegacyCreativeAssetPayload = { name: string; path: string; contentType?: string | null };
type ReactFlowAssetDropPayload = {
  type?: string;
  payload?: {
    path?: string;
    publicUrl?: string;
    mimeType?: string;
    meta?: { size?: number };
  };
};

export function parseReferenceDropPayload(raw: string): ParsedReferenceDropPayload | null {
  if (!raw) return null;

  if (raw.startsWith("data:")) {
    const [prefix, base64] = raw.split(",", 2);
    const mimeType = prefix?.slice(5).split(";")[0] || "application/octet-stream";
    return { kind: "data-url", mimeType, base64: base64 ?? "" };
  }

  const parsed = tryParseJson(raw);
  if (parsed) {
    if (isLegacyCreativeAssetPayload(parsed)) {
      return { kind: "remote", path: parsed.path, mimeType: parsed.contentType ?? undefined };
    }
    if (isReactFlowAssetDropPayload(parsed)) {
      return {
        kind: "remote",
        path: parsed.payload?.path,
        publicUrl: parsed.payload?.publicUrl,
        mimeType: parsed.payload?.mimeType,
        sizeBytes: parsed.payload?.meta?.size,
      };
    }
  }

  // Plain text drop: treat as URL or path. Try to infer mime from the value.
  return { kind: "remote", publicUrl: raw, mimeType: inferMimeTypeFromPath(raw) ?? undefined };
}

export function resolveReferenceMimeType(parsed: ParsedReferenceDropPayload): string {
  if (parsed.kind === "data-url") return parsed.mimeType;
  return parsed.mimeType ?? inferMimeTypeFromPath(parsed.publicUrl ?? parsed.path ?? "") ?? "image/png";
}

export function inferMimeTypeFromPath(value: string): string | null {
  const lower = value.toLowerCase().split("?")[0]?.split("#")[0] ?? "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return null;
}

export function estimateBase64DecodedBytes(base64: string): number {
  // Base64 encodes 3 bytes into 4 chars; '=' padding indicates missing bytes.
  // We only store raw base64 strings (no data: prefix) in request payloads.
  const trimmed = (base64 ?? "").trim();
  if (trimmed.length === 0) return 0;
  const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0;
  return Math.floor((trimmed.length * 3) / 4) - padding;
}

export function formatMiB(bytes: number): string {
  return `${(bytes / MEBIBYTE_BYTES).toFixed(1)} MiB`;
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isLegacyCreativeAssetPayload(value: unknown): value is LegacyCreativeAssetPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === "string" && typeof v.path === "string";
}

function isReactFlowAssetDropPayload(value: unknown): value is ReactFlowAssetDropPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.type === "string" && v.type !== "asset_drop") return false;
  if (!("payload" in v)) return false;
  return typeof v.payload === "object" && v.payload !== null;
}
