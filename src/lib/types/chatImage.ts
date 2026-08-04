// Shared types for chat-based image/video generation in AI Studio.
// SupportedModel is kept in sync with MODEL_CATALOG in @continuum/contracts.

import type { BrandBookPieceKind, BrandDirectionPiece, ImageSize } from '@continuum/contracts';

export type SupportedModel =
  | 'nano-banana'
  | 'gemini-3-pro-image'
  | 'veo-3-1'
  | 'veo-3-1-fast'
  | 'veo-3-1-lite'
  | 'kling-omni'
  | 'sora-2';

// Models accepted by the backend generation services (may include provider-specific aliases).
export type SupportedBackendModel =
  | SupportedModel
  | 'veo-3.1-generate-preview'
  | 'veo-3.1-fast-generate-preview'
  | 'veo-3.1-lite-generate-preview'
  | 'kling-omni'
  | 'gemini-2.5-flash-image';

export const modelMediumMap: Record<SupportedModel, 'image' | 'video'> = {
  'nano-banana': 'image',
  'gemini-3-pro-image': 'image',
  'veo-3-1': 'video',
  'veo-3-1-fast': 'video',
  'veo-3-1-lite': 'video',
  'kling-omni': 'video',
  'sora-2': 'video',
};

export type RefImage = {
  id: string;
  name?: string;
  path: string;
  mime: string;
  base64: string;
  originalBase64?: string;
  originalMime?: string;
  markupLayer?: string;
  weight?: number;
  referenceType?: 'asset' | 'style'; // Veo reference_images
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
  medium: 'image' | 'video';
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  resolution?: string;
  imageSize?: ImageSize;
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
  medium: 'image' | 'video';
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
  | { type: 'status'; status: 'queued' | 'processing' | 'completed' | 'failed' }
  | { type: 'progress'; pct: number; etaMs?: number }
  | { type: 'chunk'; base64: string }
  | { type: 'thumbnail'; base64: string }
  | {
      type: 'done';
      base64?: string;
      videoUrl?: string;
      posterBase64?: string;
      meta?: Record<string, unknown>;
    }
  | { type: 'error'; message: string };

export type StreamState = {
  status: 'idle' | 'starting' | 'streaming' | 'done' | 'error';
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
  role: 'user' | 'assistant';
  content: string;
};

export type BackendGeminiContent = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

// Payload we send to the backend generation endpoints (snake_case; model may use provider-specific aliases).
export type BackendChatImageRequestPayload = {
  brand_id: string;
  model: SupportedBackendModel;
  medium: 'image' | 'video';
  prompt: string;
  aspect_ratio: string;
  resolution?: string;
  duration_seconds?: '4' | '6' | '8';
  image_size?: ImageSize;
  reference_images?: {
    data?: string;
    image_url?: string;
    storage_bucket?: string;
    storage_path?: string;
    mime_type: string;
    filename?: string;
    weight?: number;
    referenceType?: 'asset' | 'style';
  }[];
  first_frame?: { data?: string; image_url?: string; mime_type: string; filename?: string };
  last_frame?: { data?: string; image_url?: string; mime_type: string; filename?: string };
  reference_video?: {
    data?: string;
    video_url?: string;
    mime_type: string;
    filename?: string;
  };
  image_references?: { data?: string; image_url?: string; mime_type: string; filename?: string }[];
  negative_prompt?: string;
  num_images?: number;
  // Creative-direction skill ids; the Backend folds their directives into the prompt.
  skill_ids?: string[];
  // Brand-book pieces tagged on the node; the Backend renders them into an
  // authoritative forced block.
  brand_book_pieces?: BrandBookPieceKind[];
  // v2 creative-direction pieces reaching the COMPILER and its gates. A different switch
  // from `brand_book_pieces` above — the two vocabularies share no member. Tri-state:
  // absent = everything the plan admits, [] = no brand direction, a list narrows.
  brand_direction_pieces?: BrandDirectionPiece[];
  // Library ids of the reference creatives; the Backend folds what they earned into
  // the prompt as <asset_performance>.
  reference_asset_ids?: string[];
  seed?: number;
  cfg_scale?: number;
  steps?: number;
  continue_from?: { data: string; mime_type: string }[];
  history?: { role: 'user' | 'assistant'; content: string }[];
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
