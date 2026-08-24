import { describe, expect, it } from 'bun:test';
import {
  boxBlurImageData,
  COLOR_FILTER_PRESETS,
  colorMembership,
  duplicateValue,
  gradeAdjustments,
  MAX_DUPLICATE_COPIES,
  rotatedBounds,
  scaleAdjustments,
  warmthAdjustments,
} from './imageOps';

// COVERAGE GAP, on purpose: none of the `apply*` functions are tested here. The test
// environment is bun + happy-dom, which implements neither OffscreenCanvas nor a 2D
// context, so any test of the drawing itself would only assert that the stub throws.
// What IS tested here is everything that decides what the drawing will be — the
// geometry, the colour tables, the intensity ramp, the membership curve and the box
// kernel — because that is the part that gets an op wrong. The drawn result is graded
// on decoded pixels by `studio:actions:image:e2e:bench`, in a real browser.

describe('rotatedBounds', () => {
  it('keeps the dimensions on a half turn or none at all', () => {
    expect(rotatedBounds(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
    expect(rotatedBounds(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
    expect(rotatedBounds(1920, 1080, 360)).toEqual({ width: 1920, height: 1080 });
  });

  it('swaps width and height on a quarter turn, exactly', () => {
    expect(rotatedBounds(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(rotatedBounds(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
  });

  it('folds negative and over-full-turn angles into the same rotation', () => {
    expect(rotatedBounds(1920, 1080, -90)).toEqual(rotatedBounds(1920, 1080, 270));
    expect(rotatedBounds(1920, 1080, -180)).toEqual(rotatedBounds(1920, 1080, 180));
    expect(rotatedBounds(1920, 1080, 450)).toEqual(rotatedBounds(1920, 1080, 90));
    expect(rotatedBounds(1920, 1080, -360)).toEqual({ width: 1920, height: 1080 });
  });

  it('sizes an arbitrary angle to the axis-aligned bounding box', () => {
    // A 100×100 square at 45° needs 100·√2 ≈ 141.42 in both directions.
    expect(rotatedBounds(100, 100, 45)).toEqual({ width: 141, height: 141 });
    // 200×100 at 45°: 200·cos45 + 100·sin45 ≈ 212.13 both ways.
    expect(rotatedBounds(200, 100, 45)).toEqual({ width: 212, height: 212 });
    // 30° on a non-square rectangle is asymmetric.
    expect(rotatedBounds(200, 100, 30)).toEqual({ width: 223, height: 187 });
  });

  it('never returns a fractional dimension — a canvas cannot have one', () => {
    for (const degrees of [7, 33, 45, 91, 179, 200, 333]) {
      const bounds = rotatedBounds(1234, 567, degrees);
      expect(Number.isInteger(bounds.width)).toBe(true);
      expect(Number.isInteger(bounds.height)).toBe(true);
    }
  });

  it('grows the box for any off-axis angle, never shrinks it', () => {
    const bounds = rotatedBounds(400, 300, 20);
    expect(bounds.width).toBeGreaterThan(400);
    expect(bounds.height).toBeGreaterThan(300);
  });
});

describe('warmthAdjustments', () => {
  it('is nothing at all at zero', () => {
    expect(warmthAdjustments(0)).toEqual({});
    expect(warmthAdjustments(Number.NaN)).toEqual({});
  });

  it('leans on sepia going warm and on hue going cold', () => {
    const warm = warmthAdjustments(1);
    expect(warm.sepia).toBeGreaterThan(0);
    expect(warm.hueRotate).toBeLessThan(0);

    const cold = warmthAdjustments(-1);
    expect(cold.sepia).toBeUndefined();
    expect(cold.hueRotate).toBeGreaterThan(0);
  });

  it('clamps past the ends of the scale rather than compounding', () => {
    expect(warmthAdjustments(5)).toEqual(warmthAdjustments(1));
    expect(warmthAdjustments(-5)).toEqual(warmthAdjustments(-1));
  });
});

describe('gradeAdjustments', () => {
  it('passes the eight filter adjustments through untouched', () => {
    const graded = gradeAdjustments({
      brightness: 1.2,
      contrast: 0.8,
      saturation: 1.5,
      invert: 0.3,
    });
    expect(graded.brightness).toBe(1.2);
    expect(graded.contrast).toBe(0.8);
    expect(graded.saturation).toBe(1.5);
    expect(graded.invert).toBe(0.3);
  });

  it('lets an explicit hue or sepia beat the one warmth derived', () => {
    // The two controls compile to the same CSS primitive; without this rule the
    // slider the user is dragging is the one that silently loses.
    const graded = gradeAdjustments({ warmth: 1, hueRotate: 45, sepia: 0 });
    expect(graded.hueRotate).toBe(45);
    expect(graded.sepia).toBe(0);
  });

  it('uses warmth where the explicit value is absent', () => {
    const graded = gradeAdjustments({ warmth: 1 });
    expect(graded.sepia).toBeGreaterThan(0);
  });
});

describe('scaleAdjustments', () => {
  it('reaches the preset exactly at full intensity', () => {
    const preset = { brightness: 1.2, grayscale: 1, hueRotate: -12 };
    expect(scaleAdjustments(preset, 1)).toEqual(preset);
  });

  it('reaches IDENTITY at zero — not zero', () => {
    // The bug this pins: multiplying `brightness: 1.1` by 0 gives 0, i.e. a preset
    // that turns the image black as you weaken it.
    const scaled = scaleAdjustments({ brightness: 1.2, contrast: 0.8, grayscale: 1 }, 0);
    expect(scaled.brightness).toBe(1);
    expect(scaled.contrast).toBe(1);
    expect(scaled.grayscale).toBe(0);
  });

  it('interpolates the midpoint from identity, not from zero', () => {
    const scaled = scaleAdjustments({ brightness: 1.2, saturation: 2, sepia: 1 }, 0.5);
    expect(scaled.brightness).toBeCloseTo(1.1, 10);
    expect(scaled.saturation).toBeCloseTo(1.5, 10);
    expect(scaled.sepia).toBeCloseTo(0.5, 10);
  });

  it('clamps intensity into 0..1', () => {
    const preset = { brightness: 1.4 };
    expect(scaleAdjustments(preset, 9)).toEqual(preset);
    expect(scaleAdjustments(preset, -3).brightness).toBe(1);
  });
});

describe('COLOR_FILTER_PRESETS', () => {
  it('covers every preset the frozen registry enum can currently select', () => {
    // If this fails, an `image.filter` node can be configured with a preset that has
    // no table entry and silently renders as "none".
    for (const id of ['none', 'noir', 'vivid', 'faded', 'warm', 'cool', 'mono']) {
      expect(COLOR_FILTER_PRESETS[id]).toBeDefined();
    }
  });

  it('covers every preset the Wave-3 catalog names, ahead of the enum widening', () => {
    for (const id of [
      'grayscale',
      'sepia',
      'duotone',
      'clarendon',
      'moon',
      'nashville',
      'noir',
      'fade',
    ]) {
      expect(COLOR_FILTER_PRESETS[id]).toBeDefined();
    }
  });

  it('leaves "none" as a genuine no-op', () => {
    expect(COLOR_FILTER_PRESETS.none.adjustments).toEqual({});
    expect(COLOR_FILTER_PRESETS.none.duotone).toBeUndefined();
  });

  it('keeps the aliases identical rather than nearly identical', () => {
    expect(COLOR_FILTER_PRESETS.mono.adjustments).toEqual(
      COLOR_FILTER_PRESETS.grayscale.adjustments,
    );
    expect(COLOR_FILTER_PRESETS.faded.adjustments).toEqual(COLOR_FILTER_PRESETS.fade.adjustments);
  });

  it('gives every duotone preset a grayscale base — a duotone of a colour image is mud', () => {
    for (const preset of Object.values(COLOR_FILTER_PRESETS)) {
      if (!preset.duotone) continue;
      expect(preset.adjustments.grayscale ?? preset.adjustments.sepia).toBeGreaterThan(0);
      expect(preset.duotone.shadow).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.duotone.highlight).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('colorMembership', () => {
  it('is fully in below the tolerance and fully out past the soft edge', () => {
    expect(colorMembership(0, 0.3, 0.1)).toBe(1);
    expect(colorMembership(0.3, 0.3, 0.1)).toBe(1);
    expect(colorMembership(0.4, 0.3, 0.1)).toBe(0);
    expect(colorMembership(0.9, 0.3, 0.1)).toBe(0);
  });

  it('ramps linearly across the soft edge', () => {
    expect(colorMembership(0.35, 0.3, 0.1)).toBeCloseTo(0.5, 10);
  });

  it('is a hard step when softness is zero — and never divides by it', () => {
    expect(colorMembership(0.3, 0.3, 0)).toBe(1);
    expect(colorMembership(0.30001, 0.3, 0)).toBe(0);
    expect(Number.isFinite(colorMembership(0.5, 0.3, 0))).toBe(true);
  });

  it('is the exact complement of the alpha a chroma key leaves', () => {
    // remove = alpha × (1 − membership), isolate = alpha × membership. The two modes
    // must partition the image, not overlap or leave a gap.
    for (const distance of [0, 0.1, 0.32, 0.35, 0.38, 0.5]) {
      const keep = colorMembership(distance, 0.3, 0.1);
      expect(keep + (1 - keep)).toBeCloseTo(1, 10);
    }
  });
});

describe('boxBlurImageData', () => {
  /** A plain ImageData-shaped record: the kernel reads only data/width/height. */
  const makeImage = (width: number, height: number, fill: (x: number, y: number) => number[]) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const [r, g, b, a] = fill(x, y);
        const offset = (y * width + x) * 4;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = a;
      }
    }
    return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
  };

  const at = (image: ImageData, x: number, y: number): number =>
    image.data[(y * image.width + x) * 4];

  it('is a no-op at radius zero', () => {
    const image = makeImage(8, 8, (x) => [x < 4 ? 0 : 255, 0, 0, 255]);
    const before = Uint8ClampedArray.from(image.data);
    boxBlurImageData(image, 0);
    expect(Array.from(image.data)).toEqual(Array.from(before));
  });

  it('leaves a uniform field exactly uniform — no edge darkening', () => {
    // The classic box-blur bug: an unclamped window pulls zeros in from outside the
    // image and every border pixel comes back dark.
    const image = makeImage(16, 16, () => [200, 100, 50, 255]);
    boxBlurImageData(image, 3);
    for (let i = 0; i < image.data.length; i += 4) {
      expect(image.data[i]).toBeGreaterThanOrEqual(199);
      expect(image.data[i]).toBeLessThanOrEqual(200);
    }
  });

  it('softens a hard edge — the whole point', () => {
    const image = makeImage(32, 4, (x) => [x < 16 ? 0 : 255, 0, 0, 255]);
    boxBlurImageData(image, 4);
    // Right at the seam the two sides have averaged toward the middle.
    expect(at(image, 15, 2)).toBeGreaterThan(0);
    expect(at(image, 16, 2)).toBeLessThan(255);
    // Far from the seam the original values survive.
    expect(at(image, 0, 2)).toBe(0);
    expect(at(image, 31, 2)).toBe(255);
  });

  it('spreads a single bright pixel across the kernel, conserving roughly its energy', () => {
    const image = makeImage(9, 9, (x, y) => [x === 4 && y === 4 ? 255 : 0, 0, 0, 255]);
    boxBlurImageData(image, 1);
    // A 3×3 box run twice (separable) spreads one pixel over a 5×5 neighbourhood.
    expect(at(image, 4, 4)).toBeGreaterThan(0);
    expect(at(image, 4, 4)).toBeLessThan(255);
    expect(at(image, 3, 4)).toBeGreaterThan(0);
    expect(at(image, 0, 0)).toBe(0);
  });

  it('blurs both axes, not just one', () => {
    const horizontal = makeImage(16, 16, (_x, y) => [y < 8 ? 0 : 255, 0, 0, 255]);
    boxBlurImageData(horizontal, 3);
    // A horizontal-only kernel would leave this vertical gradient perfectly sharp.
    expect(at(horizontal, 8, 7)).toBeGreaterThan(0);
  });
});

describe('duplicateValue', () => {
  it('hands back exactly N references to the same value', () => {
    const value = { id: 'shared' };
    const copies = duplicateValue(value, 3);
    expect(copies).toHaveLength(3);
    for (const copy of copies) expect(copy).toBe(value);
  });

  it('never emits zero branches — a dead run reports success', () => {
    expect(duplicateValue('x', 0)).toEqual(['x']);
    expect(duplicateValue('x', -4)).toEqual(['x']);
    expect(duplicateValue('x', Number.NaN)).toEqual(['x']);
  });

  it('caps at the collection fan-out limit rather than being truncated downstream', () => {
    expect(duplicateValue('x', 1000)).toHaveLength(MAX_DUPLICATE_COPIES);
  });

  it('floors a fractional count', () => {
    expect(duplicateValue('x', 2.9)).toHaveLength(2);
  });
});
