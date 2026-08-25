import { describe, expect, it } from 'bun:test';
import type { ClipEffectSpec } from '../render/effectSpec';
import { applyPixelEffects } from './frameDraw';

// happy-dom does not reliably expose the ImageData constructor and this module only
// ever touches `data`/`width`/`height`, so a structural stand-in is enough — the same
// approach `utils/pixel/chromaKey.test.ts` uses.
function frameOf(width: number, height: number, fill: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

const pixelAt = (image: ImageData, x: number, y: number): [number, number, number, number] => {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
};

const luma = ([r, g, b]: [number, number, number, number]): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

const run = (image: ImageData, effects: ClipEffectSpec, t = 0): ImageData => {
  applyPixelEffects(image, effects, image.width, image.height, t);
  return image;
};

describe('vignette', () => {
  it('darkens the corners and leaves the centre alone', () => {
    const image = run(frameOf(33, 33, [200, 200, 200]), { vignette: { amount: 0.8 } });
    const centre = luma(pixelAt(image, 16, 16));
    const corner = luma(pixelAt(image, 0, 0));
    expect(centre).toBeCloseTo(200, 0);
    // amount 0.8 at a corner (falloff 1) scales by 1 - 0.8 = 0.2.
    expect(corner).toBeLessThan(centre * 0.3);
  });

  it('leaves the flat centre disc untouched — falloff starts at r = 0.35', () => {
    const image = run(frameOf(33, 33, [200, 200, 200]), { vignette: { amount: 1 } });
    expect(luma(pixelAt(image, 16, 16))).toBeCloseTo(200, 0);
  });

  it('does nothing at amount 0', () => {
    const image = run(frameOf(9, 9, [120, 120, 120]), { vignette: { amount: 0 } });
    expect(pixelAt(image, 0, 0)).toEqual([120, 120, 120, 255]);
  });

  it('never touches alpha', () => {
    const image = run(frameOf(9, 9, [200, 200, 200]), { vignette: { amount: 1 } });
    expect(pixelAt(image, 0, 0)[3]).toBe(255);
  });
});

describe('filmGrain', () => {
  it('perturbs pixels away from a flat field', () => {
    const image = run(frameOf(16, 16, [128, 128, 128]), { filmGrain: { amount: 1 } });
    const values = [...image.data].filter((_, index) => index % 4 === 0);
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it('is deterministic — the same clip time gives byte-identical output', () => {
    const a = run(frameOf(16, 16, [128, 128, 128]), { filmGrain: { amount: 0.5 } }, 0.25);
    const b = run(frameOf(16, 16, [128, 128, 128]), { filmGrain: { amount: 0.5 } }, 0.25);
    expect([...a.data]).toEqual([...b.data]);
  });

  it('moves across the clip — a different time gives different grain', () => {
    const a = run(frameOf(16, 16, [128, 128, 128]), { filmGrain: { amount: 1 } }, 0);
    const b = run(frameOf(16, 16, [128, 128, 128]), { filmGrain: { amount: 1 } }, 0.9);
    expect([...a.data]).not.toEqual([...b.data]);
  });
});

describe('chromaticAberration', () => {
  it('displaces red and blue at the edge but not at the centre', () => {
    // The shift is 1% of the frame's short side, so it is deliberately sub-pixel on a
    // small frame. 201px gives ~2px at the edge — enough to move a gradient.
    const size = 201;
    const image = frameOf(size, size, [0, 0, 0]);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const ramp = Math.round((x * 255) / (size - 1));
        image.data[i] = ramp;
        image.data[i + 2] = 255 - ramp;
      }
    }
    const edgeBefore = pixelAt(image, 4, 100);
    const centreBefore = pixelAt(image, 100, 100);
    run(image, { chromaticAberration: { amount: 1 } });
    // Radial: zero displacement at the centre, real displacement toward the edge.
    expect(pixelAt(image, 100, 100)).toEqual(centreBefore);
    expect(pixelAt(image, 4, 100)[0]).not.toBe(edgeBefore[0]);
    expect(pixelAt(image, 4, 100)[2]).not.toBe(edgeBefore[2]);
    // Green is never displaced.
    expect(pixelAt(image, 4, 100)[1]).toBe(0);
  });

  it('does nothing at amount 0', () => {
    const image = run(frameOf(9, 9, [10, 20, 30]), { chromaticAberration: { amount: 0 } });
    expect(pixelAt(image, 0, 0)).toEqual([10, 20, 30, 255]);
  });
});

describe('vhs', () => {
  it('darkens odd scanlines relative to even ones', () => {
    const image = run(frameOf(16, 16, [200, 200, 200]), { vhs: { amount: 1 } });
    // Row noise is per-row, so compare a band of rows rather than two pixels.
    const rowLuma = (y: number): number => {
      let total = 0;
      for (let x = 0; x < 16; x += 1) total += luma(pixelAt(image, x, y));
      return total / 16;
    };
    const even = (rowLuma(4) + rowLuma(6) + rowLuma(8)) / 3;
    const odd = (rowLuma(5) + rowLuma(7) + rowLuma(9)) / 3;
    expect(odd).toBeLessThan(even);
  });

  it('does nothing at amount 0', () => {
    const image = run(frameOf(9, 9, [10, 20, 30]), { vhs: { amount: 0 } });
    expect(pixelAt(image, 0, 0)).toEqual([10, 20, 30, 255]);
  });
});

describe('effect ordering', () => {
  it('keys before it displaces — a keyed pixel stays transparent under aberration', () => {
    const image = frameOf(17, 17, [0, 255, 0]);
    run(image, {
      chromaKey: { color: '#00ff00', tolerance: 0.3, softness: 0 },
      chromaticAberration: { amount: 1 },
    });
    // Alpha is never displaced, so every pixel of an all-green frame keys out.
    expect(pixelAt(image, 0, 0)[3]).toBe(0);
    expect(pixelAt(image, 8, 8)[3]).toBe(0);
  });

  it('vignettes the grain rather than sitting under it', () => {
    // With both on, a corner must still be darker than the centre — if vignette ran
    // first, additive grain would land on top of the darkened corner and lift it.
    const image = run(frameOf(33, 33, [200, 200, 200]), {
      vignette: { amount: 1 },
      filmGrain: { amount: 0.2 },
    });
    expect(luma(pixelAt(image, 0, 0))).toBeLessThan(luma(pixelAt(image, 16, 16)) * 0.5);
  });

  it('leaves a frame with no pixel effects byte-identical', () => {
    const image = run(frameOf(8, 8, [1, 2, 3]), {});
    expect(pixelAt(image, 4, 4)).toEqual([1, 2, 3, 255]);
  });
});
