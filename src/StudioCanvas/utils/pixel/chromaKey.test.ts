import { describe, expect, it } from 'bun:test';
import { chromaKeyImageData, parseHexColor } from './chromaKey';

// happy-dom does not reliably expose the ImageData constructor, and the module
// only ever reads `.data`, so a plain literal is the honest stand-in.
function imageDataOf(pixels: number[]): ImageData {
  return {
    data: new Uint8ClampedArray(pixels),
    width: pixels.length / 4,
    height: 1,
  } as ImageData;
}

const GREEN = { color: '#00ff00', tolerance: 0.3, softness: 0.1 };

describe('parseHexColor', () => {
  it('accepts six hex digits with or without a leading hash, in any case', () => {
    expect(parseHexColor('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseHexColor('00FF00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseHexColor('#1A2b3C')).toEqual({ r: 26, g: 43, b: 60 });
  });

  it('refuses anything that is not six hex digits', () => {
    expect(parseHexColor('#fff')).toBeUndefined();
    expect(parseHexColor('#00ff0')).toBeUndefined();
    expect(parseHexColor('#00ff000')).toBeUndefined();
    expect(parseHexColor('green')).toBeUndefined();
    expect(parseHexColor('#00gg00')).toBeUndefined();
    expect(parseHexColor('')).toBeUndefined();
  });
});

describe('chromaKeyImageData', () => {
  it('knocks an exact key-colour pixel fully transparent', () => {
    const image = imageDataOf([0, 255, 0, 255]);
    chromaKeyImageData(image, GREEN);
    expect(image.data[3]).toBe(0);
  });

  it('leaves a pixel far from the key colour untouched', () => {
    const image = imageDataOf([255, 0, 0, 255]);
    chromaKeyImageData(image, GREEN);
    expect(Array.from(image.data)).toEqual([255, 0, 0, 255]);
  });

  it('ramps alpha partially for a pixel inside the soft band', () => {
    // For a neutral grey the normalised distance from #000000 is just g/255,
    // so 0.35 lands between tolerance (0.3) and tolerance + softness (0.4).
    const grey = Math.round(0.35 * 255);
    const image = imageDataOf([grey, grey, grey, 255]);
    chromaKeyImageData(image, { color: '#000000', tolerance: 0.3, softness: 0.1 });
    expect(image.data[3]).toBeGreaterThan(0);
    expect(image.data[3]).toBeLessThan(255);
  });

  it('multiplies the existing alpha instead of overwriting it', () => {
    const grey = Math.round(0.35 * 255);
    const opaque = imageDataOf([grey, grey, grey, 255]);
    const halfLit = imageDataOf([grey, grey, grey, 128]);
    const config = { color: '#000000', tolerance: 0.3, softness: 0.1 };

    chromaKeyImageData(opaque, config);
    chromaKeyImageData(halfLit, config);

    expect(halfLit.data[3]).toBeLessThan(opaque.data[3]);
    expect(halfLit.data[3]).toBeCloseTo(opaque.data[3] / 2, -1);
  });

  it('produces no NaN alpha when softness is zero', () => {
    const image = imageDataOf([0, 255, 0, 255, 0, 200, 0, 255, 255, 0, 0, 255]);
    chromaKeyImageData(image, { color: '#00ff00', tolerance: 0.3, softness: 0 });
    expect(image.data[3]).toBe(0);
    for (const channel of image.data) {
      expect(Number.isNaN(channel)).toBe(false);
    }
  });

  it('is a no-op when the stored colour is not parseable', () => {
    const image = imageDataOf([0, 255, 0, 255]);
    chromaKeyImageData(image, { color: 'not-a-colour', tolerance: 0.3, softness: 0.1 });
    expect(Array.from(image.data)).toEqual([0, 255, 0, 255]);
  });

  it('keys every matching pixel across a multi-pixel buffer', () => {
    const image = imageDataOf([0, 255, 0, 255, 12, 34, 56, 255, 0, 255, 0, 200]);
    chromaKeyImageData(image, GREEN);
    expect(image.data[3]).toBe(0);
    expect(image.data[7]).toBe(255);
    expect(image.data[11]).toBe(0);
  });
});
