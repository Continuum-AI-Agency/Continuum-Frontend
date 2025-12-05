// Shared types for chat-based image/video generation in AI Studio.

export type SupportedModel = "nano-banana" | "gemini-3-pro-image-preview" | "veo-3-1" | "veo-3-1-fast" | "sora-2";

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
  weight?: number;
  referenceType?: "asset" | "style"; // Veo reference_images
};

export type RefVideo = {
  id: string;
  name?: string;
  mime: string;
  base64: string;
  filename?: string;
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
  error?: string;
  lastEvent?: StreamEvent;
};
