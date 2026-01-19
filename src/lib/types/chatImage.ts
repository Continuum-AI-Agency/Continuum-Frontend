// Shared types for chat-based image/video generation in AI Studio.

export type SupportedModel = "nano-banana" | "gemini-3-pro-image-preview" | "veo-3-1" | "veo-3-1-fast" | "sora-2";

// Models accepted by the backend generation services (may include provider-specific aliases).
export type SupportedBackendModel =
  | SupportedModel
  | "veo-3.1-generate-preview"
  | "veo-3.1-fast-generate-preview"
  | "gemini-2.5-flash-image";

export const modelMediumMap: Record<SupportedModel, "image" | "video"> = {
  "nano-banana": "image",
  "gemini-3-pro-image-preview": "image",
  "veo-3-1": "video",
  "veo-3-1-fast": "video",
  "sora-2": "video",
};

export type RefImage = {
  id: string;
  name?: string;
  path: string;
  mime: string;
  base64: string;
  originalBase64?: string;
  originalMime?: string;
  weight?: number;
  referenceType?: "asset" | "style"; // Veo reference_images
};

export type RefVideo = {
  id: string;
  name?: string;
  mime: string;
  base64: string;
  filename?: string;
  startTime?: number;
  endTime?: number;
};

export type ChatImageRequestPayload = {
  brandProfileId: string;
  model: SupportedModel;
  medium: "image" | "video";
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  resolution?: string;
  imageSize?: "1K" | "2K" | "4K"; // Pro only
  referenceVideo?: RefVideo;
  durationSeconds?: 4 | 6 | 8;
  seed?: number;
  cfgScale?: number;
  steps?: number;
  refs?: RefImage[];
  firstFrame?: RefImage;
  lastFrame?: RefImage;
};

export type ChatImageHistoryItem = {
  id: string;
  model: SupportedModel;
  medium: "image" | "video";
  prompt: string;
  aspectRatio: string;
  createdAt: string;
  thumbBase64: string;
  fullBase64?: string;
  videoUrl?: string;
  posterBase64?: string;
  meta?: Record<string, unknown>;
};

export type StreamEvent =
  | { type: "status"; status: "queued" | "processing" | "completed" | "failed" }
  | { type: "progress"; pct: number; etaMs?: number }
  | { type: "chunk"; base64: string }
  | { type: "thumbnail"; base64: string }
  | { type: "done"; base64?: string; videoUrl?: string; posterBase64?: string; meta?: Record<string, unknown> }
  | { type: "error"; message: string };

export type StreamState = {
  status: "idle" | "starting" | "streaming" | "done" | "error";
  progressPct?: number;
  etaMs?: number;
  currentBase64?: string;
  posterBase64?: string;
  thumbBase64?: string;
  videoUrl?: string;
  error?: string;
  lastEvent?: StreamEvent;
};

export type ChatConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type BackendGeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

// Payload we send to the backend generation endpoints (snake_case; model may use provider-specific aliases).
export type BackendChatImageRequestPayload = {
  brand_id: string;
  model: SupportedBackendModel;
  medium: "image" | "video";
  prompt: string;
  aspect_ratio: string;
  resolution?: string;
  duration_seconds?: "4" | "6" | "8";
  image_size?: "1K" | "2K" | "4K";
  reference_images?: { data: string; mime_type: string; filename?: string; weight?: number; referenceType?: "asset" | "style" }[];
  first_frame?: { data: string; mime_type: string; filename?: string };
  last_frame?: { data: string; mime_type: string; filename?: string };
  reference_video?: {
    data: string;
    mime_type: string;
    filename?: string;
    start_time?: number;
    end_time?: number;
  };
  negative_prompt?: string;
  seed?: number;
  cfg_scale?: number;
  steps?: number;
  continue_from?: { data: string; mime_type: string }[];
  history?: { role: "user" | "assistant"; content: string }[];
  reset?: boolean;
};

export type BackendExtendVideoRequestPayload = {
  service: string;
  model: SupportedBackendModel | string;
  prompt: string;
  brand_id: string;
  aspect_ratio?: string;
  resolution?: string;
  video: { data: string; mime_type: string; filename?: string } | { uri: string };
};
