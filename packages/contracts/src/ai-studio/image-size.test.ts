import { describe, expect, it } from 'bun:test';
import {
  coerceImageSize,
  DEFAULT_IMAGE_GENERATOR_MODEL,
  FIXED_IMAGE_PIXELS,
  IMAGE_GENERATOR_MODELS,
  IMAGE_MODEL_SIZES,
  IMAGE_SIZES,
  imageModelLabel,
  imageModelOptions,
  imageResolutionFor,
  imageSizeSchema,
  imageSizesForModel,
  supportsImageSize,
} from './image-size';

describe('imageSizeSchema', () => {
  it('is the one enum every layer validates against', () => {
    expect(IMAGE_SIZES).toEqual(['512px', '1K', '2K', '4K']);
    for (const size of IMAGE_SIZES) {
      expect(imageSizeSchema.safeParse(size).success).toBe(true);
    }
    expect(imageSizeSchema.safeParse('1024px').success).toBe(false);
  });
});

describe('coerceImageSize', () => {
  it('maps the agent-invented "1024px" onto the legal 1K (the bug that 400d every run)', () => {
    expect(coerceImageSize('nano-banana-2', '1024px')).toBe('1K');
    expect(coerceImageSize('nano-banana-pro', '1024px')).toBe('1K');
  });

  it('keeps a size the model already supports', () => {
    expect(coerceImageSize('nano-banana-2', '512px')).toBe('512px');
    expect(coerceImageSize('nano-banana-2', '4K')).toBe('4K');
    expect(coerceImageSize('nano-banana-pro', '2K')).toBe('2K');
  });

  it('falls back to the model default for a size that model cannot render', () => {
    expect(coerceImageSize('nano-banana-pro', '512px')).toBe('1K');
  });

  it('falls back to the model default for junk, and for a missing value', () => {
    expect(coerceImageSize('nano-banana-2', 'enormous')).toBe('512px');
    expect(coerceImageSize('nano-banana-2', undefined)).toBe('512px');
    expect(coerceImageSize('nano-banana-2', 42)).toBe('512px');
    expect(coerceImageSize('nano-banana-pro', undefined)).toBe('1K');
  });

  it('returns undefined for models that take no size parameter at all', () => {
    expect(coerceImageSize('nano-banana', '1K')).toBeUndefined();
    expect(coerceImageSize('gpt-image-2', '2K')).toBeUndefined();
    expect(coerceImageSize('flux-2-pro', '4K')).toBeUndefined();
    expect(coerceImageSize('flux-2-max', undefined)).toBeUndefined();
  });

  it('returns undefined for a model that is not an image generator', () => {
    expect(coerceImageSize('veo-3.1', '1K')).toBeUndefined();
    expect(coerceImageSize(undefined, '1K')).toBeUndefined();
  });
});

describe('model capabilities', () => {
  it('says which models expose a size picker at all', () => {
    expect(supportsImageSize('nano-banana')).toBe(false);
    expect(supportsImageSize('nano-banana-2')).toBe(true);
    expect(supportsImageSize('nano-banana-pro')).toBe(true);
    expect(supportsImageSize('gpt-image-2')).toBe(false);
  });

  it('lists only the sizes each model can render', () => {
    expect(imageSizesForModel('nano-banana-pro')).toEqual(['1K', '2K', '4K']);
    expect(imageSizesForModel('nano-banana-2')).toEqual(['512px', '1K', '2K', '4K']);
    expect(imageSizesForModel('nano-banana')).toEqual([]);
  });
});

describe('imageResolutionFor', () => {
  it('reports the fixed 1024px a size-less model always renders at', () => {
    expect(imageResolutionFor('nano-banana', undefined)).toBe('1024x1024');
  });

  it('follows the size tier for models that take one', () => {
    expect(imageResolutionFor('nano-banana-2', '512px')).toBe('512x512');
    expect(imageResolutionFor('nano-banana-2', '1K')).toBe('1024x1024');
    expect(imageResolutionFor('nano-banana-pro', '2K')).toBe('2048x2048');
    expect(imageResolutionFor('nano-banana-pro', '4K')).toBe('4096x4096');
  });
});

/*
 * The picker was hardcoded JSX with no notion of status, so a model this workspace
 * cannot reach looked exactly like one it can, and the only way to find out was a red
 * node reading "Generation failed — Forbidden" (Airtable #248).
 */
describe('imageModelOptions', () => {
  const optionFor = (model: string, unavailable?: ReadonlySet<string>) => {
    const option = imageModelOptions(unavailable).find((entry) => entry.model === model);
    if (!option) throw new Error(`no option for ${model}`);
    return option;
  };

  it('offers every model the node data can legally carry, and nothing else', () => {
    expect(imageModelOptions().map((option) => option.model)).toEqual([...IMAGE_GENERATOR_MODELS]);
  });

  it('labels every model, so the picker and the node caption cannot drift apart', () => {
    for (const option of imageModelOptions()) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(imageModelLabel(option.model)).toBe(option.label);
    }
    expect(imageModelLabel('flux-2-max')).toBe('FLUX.2 Max');
  });

  it('warns that the fal tier needs credits while still letting a funded workspace pick it', () => {
    for (const model of ['gpt-image-2', 'flux-2-pro', 'flux-2-max']) {
      expect(optionFor(model).note).toBe('Needs fal credits');
      expect(optionFor(model).selectable).toBe(true);
    }
  });

  it('surfaces a single-size model as a ceiling rather than waiting for the 400', () => {
    expect(optionFor('nano-banana-2-lite').note).toBe('1K only');
    expect(optionFor('nano-banana').note).toBe('1024px only');
    expect(optionFor('nano-banana-2').note).toBeUndefined();
  });

  it('greys out a model this session has already been refused', () => {
    const refused = optionFor('flux-2-max', new Set(['flux-2-max']));
    expect(refused.status).toBe('unavailable');
    expect(refused.selectable).toBe(false);
    expect(refused.note).toBe('Not enabled on this workspace');
    // One refusal must not take its neighbours down with it.
    expect(optionFor('nano-banana-2', new Set(['flux-2-max'])).selectable).toBe(true);
  });
});

/*
 * Flash-Lite is the default a new image node is born on, and it is the one model in the
 * table that accepts exactly one size. Measured against the live API on 2026-08-08: 512px,
 * 2K and 4K each return `400 Image size <N> is not supported for this model`. That is the
 * honest opposite of `nano-banana` (which accepts 2K with a 200 and renders 1024 anyway),
 * and it is why offering any other tier would ship a guaranteed 400.
 */
describe('nano-banana-2-lite', () => {
  it('is the default model a new image node is born on', () => {
    expect(DEFAULT_IMAGE_GENERATOR_MODEL).toBe('nano-banana-2-lite');
  });

  it('offers 1K and nothing else', () => {
    expect(IMAGE_MODEL_SIZES['nano-banana-2-lite']).toEqual(['1K']);
    expect(supportsImageSize('nano-banana-2-lite')).toBe(true);
  });

  it('corrects every tier it cannot render to 1K rather than passing a 400 along', () => {
    for (const requested of ['512px', '2K', '4K', '1024px', 'enormous', undefined]) {
      expect(coerceImageSize('nano-banana-2-lite', requested)).toBe('1K');
    }
  });

  it('reports a 1024 square resolution, not a fixed-pixel label', () => {
    expect(imageResolutionFor('nano-banana-2-lite', '1K')).toBe('1024x1024');
    expect(FIXED_IMAGE_PIXELS['nano-banana-2-lite']).toBeUndefined();
  });
});
