import { describe, expect, it } from 'bun:test';
import {
  coerceImageSize,
  IMAGE_SIZES,
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
