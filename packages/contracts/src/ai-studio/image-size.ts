import { z } from 'zod';
import { isModelSelectable, type ModelStatus } from './model-catalog';

// The image-generation size vocabulary — ONE definition, shared by the canvas, the
// chat surface, the agent write path, and the Backend request schema.
//
// This enum used to be hand-copied into eight files and two of the copies had
// already dropped `512px`, so a value the canvas could legally produce was rejected
// by a sibling validator. Import from here; never re-declare it.

export const IMAGE_SIZES = ['512px', '1K', '2K', '4K'] as const;
export const imageSizeSchema = z.enum(IMAGE_SIZES);
export type ImageSize = z.infer<typeof imageSizeSchema>;

/** The longest edge, in pixels, each size tier renders at (before aspect ratio). */
export const IMAGE_SIZE_PIXELS: Record<ImageSize, number> = {
  '512px': 512,
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

// The values a nanoGen node's `data.model` accepts — the canvas maps them to backend
// model ids at payload time (buildNodePayload). An agent that invents a model id here
// produces a node that 400s the moment the user presses Run.
export const IMAGE_GENERATOR_MODELS = [
  'nano-banana',
  'nano-banana-pro',
  'nano-banana-2',
  'nano-banana-2-lite',
  'gpt-image-2',
  'flux-2-pro',
  'flux-2-max',
] as const;

export type ImageGeneratorModel = (typeof IMAGE_GENERATOR_MODELS)[number];
export const imageGeneratorModelSchema = z.enum(IMAGE_GENERATOR_MODELS);

export const DEFAULT_IMAGE_GENERATOR_MODEL: ImageGeneratorModel = 'nano-banana-2-lite';

export const isImageGeneratorModel = (value: unknown): value is ImageGeneratorModel =>
  typeof value === 'string' && (IMAGE_GENERATOR_MODELS as readonly string[]).includes(value);

/**
 * The sizes each generator actually ACCEPTS.
 *
 * An empty list means the model takes no size parameter at all — it is not that we
 * forgot to wire one, and offering the user a picker for it would be a lie.
 *
 * `gemini-2.5-flash-image` ("Nano Banana") is the one that matters, and it is worse
 * than a rejection: measured against the live API, it ACCEPTS `imageConfig.imageSize:
 * "2K"` with a 200 and then renders 1024x1024 anyway. A silently-ignored size is
 * indistinguishable from one that worked, which is exactly why it was reported as
 * "images create in 1024px". The node therefore offers no size for it and says
 * `1024px (fixed)` on its label instead of implying a choice it does not have.
 *
 * `nano-banana-2-lite` is the honest opposite and was measured the same way: every
 * tier other than `1K` comes back `400 Image size <N> is not supported for this
 * model`, including `512px`. It is genuinely 1K-only, so offering any other tier
 * would ship a guaranteed 400 rather than a silent downgrade.
 *
 * The fal-hosted models (gpt-image-2, flux-2-*) size by aspect ratio alone.
 */
export const IMAGE_MODEL_SIZES: Record<ImageGeneratorModel, readonly ImageSize[]> = {
  'nano-banana': [],
  'nano-banana-pro': ['1K', '2K', '4K'],
  'nano-banana-2': ['512px', '1K', '2K', '4K'],
  'nano-banana-2-lite': ['1K'],
  'gpt-image-2': [],
  'flux-2-pro': [],
  'flux-2-max': [],
};

/** What a size-less model renders at regardless. The node label says so honestly. */
export const FIXED_IMAGE_PIXELS: Partial<Record<ImageGeneratorModel, number>> = {
  'nano-banana': 1024,
};

export const DEFAULT_IMAGE_SIZE: Partial<Record<ImageGeneratorModel, ImageSize>> = {
  'nano-banana-pro': '1K',
  'nano-banana-2': '512px',
  'nano-banana-2-lite': '1K',
};

/**
 * What the picker says about each generator, and whether it can be picked at all.
 *
 * The picker used to be hardcoded JSX with no disabled state: every model was always
 * clickable and the only way to learn a model was out of reach was a red node reading
 * "Generation failed — Forbidden" (Airtable #248).
 *
 * The fal-hosted tier (gpt-image-2, flux-2-*) reaches its provider through FAL_KEY and
 * nothing else, and there is no fallback provider. They stay selectable because a
 * workspace WITH fal credits runs them fine — the note says what they need, and a run
 * that comes back `model_unavailable` disables that model for the rest of the session
 * (see `imageModelOptions`).
 */
export const IMAGE_MODEL_INFO: Record<
  ImageGeneratorModel,
  { label: string; status: ModelStatus; note?: string }
> = {
  'nano-banana': { label: 'Nano Banana', status: 'available' },
  'nano-banana-pro': { label: 'Nano Banana Pro', status: 'available' },
  'nano-banana-2': { label: 'Nano Banana 2', status: 'available' },
  'nano-banana-2-lite': { label: 'Nano Banana 2 Lite', status: 'available' },
  'gpt-image-2': { label: 'GPT Image 2', status: 'beta', note: 'Needs fal credits' },
  'flux-2-pro': { label: 'FLUX.2 Pro', status: 'beta', note: 'Needs fal credits' },
  'flux-2-max': { label: 'FLUX.2 Max', status: 'beta', note: 'Needs fal credits' },
};

export const imageModelLabel = (model: unknown): string =>
  isImageGeneratorModel(model)
    ? IMAGE_MODEL_INFO[model].label
    : IMAGE_MODEL_INFO[DEFAULT_IMAGE_GENERATOR_MODEL].label;

export type ImageModelOption = {
  model: ImageGeneratorModel;
  label: string;
  status: ModelStatus;
  /** One short clause under the label: the ceiling to expect, or why it cannot be picked. */
  note?: string;
  selectable: boolean;
};

/** The single size a model always renders at, when it has exactly one. */
const sizeCeilingNote = (model: ImageGeneratorModel): string | undefined => {
  const fixed = FIXED_IMAGE_PIXELS[model];
  if (fixed) return `${fixed}px only`;
  const sizes = IMAGE_MODEL_SIZES[model];
  return sizes.length === 1 ? `${sizes[0]} only` : undefined;
};

const NOTHING_UNAVAILABLE: ReadonlySet<string> = new Set();

/**
 * Every model the picker offers, in the status it should be drawn in.
 *
 * `unavailableModels` is what the session has LEARNED: a run that came back
 * `model_unavailable` proves this workspace cannot reach that model, so the picker
 * greys it out rather than letting the user retry into the same wall.
 */
export function imageModelOptions(
  unavailableModels: ReadonlySet<string> = NOTHING_UNAVAILABLE,
): readonly ImageModelOption[] {
  return IMAGE_GENERATOR_MODELS.map((model) => {
    const info = IMAGE_MODEL_INFO[model];
    const status: ModelStatus = unavailableModels.has(model) ? 'unavailable' : info.status;
    return {
      model,
      label: info.label,
      status,
      note:
        status === 'unavailable'
          ? 'Not enabled on this workspace'
          : (info.note ?? sizeCeilingNote(model)),
      selectable: isModelSelectable(status),
    };
  });
}

export const supportsImageSize = (model: ImageGeneratorModel): boolean =>
  IMAGE_MODEL_SIZES[model].length > 0;

export const imageSizesForModel = (model: ImageGeneratorModel): readonly ImageSize[] =>
  IMAGE_MODEL_SIZES[model];

// What a model, an agent, or a stale persisted node might plausibly MEAN by a size.
// `1024px` is the one that actually shipped a 400 to every user of the canvas: it is
// not a legal value anywhere in the system, and nothing rejected it until the
// generation endpoint did.
const SIZE_ALIASES: Record<string, ImageSize> = {
  '512': '512px',
  '512px': '512px',
  '0.5k': '512px',
  '1024': '1K',
  '1024px': '1K',
  '1k': '1K',
  '2048': '2K',
  '2048px': '2K',
  '2k': '2K',
  '4096': '4K',
  '4096px': '4K',
  '4k': '4K',
};

/**
 * The size this model will actually be sent, whatever was asked for.
 *
 * `undefined` means the model takes no size at all. Anything unrecognised — or legal
 * but unsupported by this model, like `512px` on Nano Banana Pro — falls back to the
 * model's default rather than travelling on to the provider as a 400.
 */
export function coerceImageSize(model: unknown, value: unknown): ImageSize | undefined {
  if (!isImageGeneratorModel(model)) return undefined;
  const allowed = IMAGE_MODEL_SIZES[model];
  if (allowed.length === 0) return undefined;

  const fallback = DEFAULT_IMAGE_SIZE[model] ?? allowed[0];
  if (typeof value !== 'string') return fallback;

  const alias = SIZE_ALIASES[value.trim().toLowerCase()];
  if (alias && allowed.includes(alias)) return alias;
  return fallback;
}

/** The `resolution` string the Backend's image request carries alongside the size. */
export function imageResolutionFor(model: unknown, size: ImageSize | undefined): string {
  if (isImageGeneratorModel(model) && !supportsImageSize(model)) {
    const fixed = FIXED_IMAGE_PIXELS[model] ?? 1024;
    return `${fixed}x${fixed}`;
  }
  const pixels = size ? IMAGE_SIZE_PIXELS[size] : 1024;
  return `${pixels}x${pixels}`;
}
