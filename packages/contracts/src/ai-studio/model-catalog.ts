// Single source of truth for AI Studio model catalog.
// Backend routing depends on the id strings — do NOT rename them.

export type ModelMedium = 'image' | 'video' | 'text';

export type ModelStatus = 'available' | 'soon' | 'beta' | 'unavailable';

export type ModelCatalogEntry = {
  id: string;
  label: string;
  provider: string;
  medium: ModelMedium;
  status: ModelStatus;
};

export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  // Image generation models
  {
    id: 'nano-banana',
    label: 'Nano Banana (Gemini 2.5 Flash Image)',
    provider: 'google',
    medium: 'image',
    status: 'available',
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro (Gemini 3 Pro Image Preview)',
    provider: 'google',
    medium: 'image',
    status: 'available',
  },
  // Video generation models
  {
    id: 'veo-3-1',
    label: 'Veo 3.1 (Video)',
    provider: 'google',
    medium: 'video',
    status: 'available',
  },
  {
    id: 'veo-3-1-fast',
    label: 'Veo 3.1 Fast (Video)',
    provider: 'google',
    medium: 'video',
    status: 'available',
  },
  {
    id: 'veo-3-1-lite',
    label: 'Veo 3.1 Lite (Video)',
    provider: 'google',
    medium: 'video',
    status: 'available',
  },
  {
    id: 'kling-omni',
    label: 'Kling Omni (Video)',
    provider: 'kling',
    medium: 'video',
    status: 'available',
  },
  {
    id: 'gemini-omni-flash',
    label: 'Gemini Omni Flash (Video)',
    provider: 'google',
    medium: 'video',
    status: 'beta',
  },
  {
    id: 'sora-2',
    label: 'Sora 2 (Video)',
    provider: 'openai',
    medium: 'video',
    status: 'soon',
  },
  // Text / LLM models (used in the canvas LLM Node)
  {
    id: 'gpt-4',
    label: 'GPT-4',
    provider: 'openai',
    medium: 'text',
    status: 'available',
  },
  {
    id: 'gpt-3.5-turbo',
    label: 'GPT-3.5 Turbo',
    provider: 'openai',
    medium: 'text',
    status: 'available',
  },
  {
    id: 'claude-3-sonnet',
    label: 'Claude 3 Sonnet',
    provider: 'anthropic',
    medium: 'text',
    status: 'available',
  },
  {
    id: 'claude-3-haiku',
    label: 'Claude 3 Haiku',
    provider: 'anthropic',
    medium: 'text',
    status: 'available',
  },
  {
    id: 'gemini-pro',
    label: 'Gemini Pro',
    provider: 'google',
    medium: 'text',
    status: 'available',
  },
  {
    id: 'gemini-pro-vision',
    label: 'Gemini Pro Vision',
    provider: 'google',
    medium: 'text',
    status: 'available',
  },
] as const;

// Subset exposed in the chat generation panel (excludes kling-omni which is canvas-only).
export const CHAT_PANEL_MODEL_IDS = [
  'nano-banana',
  'gemini-3-pro-image-preview',
  'veo-3-1',
  'veo-3-1-fast',
  'sora-2',
] as const;

export type ChatPanelModelId = (typeof CHAT_PANEL_MODEL_IDS)[number];

// Subset exposed in the ModelNode canvas picker (image/video generation models only).
export const MODEL_NODE_MODEL_IDS = ['nano-banana', 'veo-3-1', 'sora-2'] as const;

export type ModelNodeModelId = (typeof MODEL_NODE_MODEL_IDS)[number];

// Derived: full SupportedModel union (all ids present in the catalog that generate image/video).
export const SUPPORTED_IMAGE_VIDEO_MODEL_IDS = MODEL_CATALOG.filter(
  (m) => m.medium === 'image' || m.medium === 'video',
).map((m) => m.id) as string[];

export function getCatalogEntry(id: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function getMediumForCatalogModel(id: string): ModelMedium | undefined {
  return getCatalogEntry(id)?.medium;
}

export function getLlmModelsByProvider(provider: string): readonly ModelCatalogEntry[] {
  return MODEL_CATALOG.filter((m) => m.medium === 'text' && m.provider === provider);
}

export function getStatusBadgeLabel(status: ModelStatus): string {
  switch (status) {
    case 'available':
      return '';
    case 'soon':
      return 'Soon';
    case 'beta':
      return 'Beta';
    case 'unavailable':
      return 'Unavailable';
  }
}

export function isModelSelectable(status: ModelStatus): boolean {
  return status === 'available' || status === 'beta';
}
