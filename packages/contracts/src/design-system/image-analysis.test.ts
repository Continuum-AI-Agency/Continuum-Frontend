import { describe, expect, it } from 'bun:test';
import {
  brandInkFraction,
  contrastRatio,
  coverCropRect,
  darkPercentileContrast,
  encodedLuma,
  FULL_FRAME,
  hardEdgeFraction,
  interp,
  type PixelBuffer,
  percentile,
  type RenderFormat,
  type Rgb,
  regionCalm,
  relativeLuminance,
  requiredUpscale,
  resolveLegibilityMode,
  VERNE_BRAND_ACCENTS,
  VERNE_DARK_PERCENTILE,
  VERNE_EDGE_GRADIENT,
  VERNE_INK_DISTANCE,
  VERNE_MAX_EDGE_FRACTION,
  VERNE_MAX_INK_FRACTION,
  VERNE_MAX_REGION_DEVIATION,
  VERNE_MIN_CONTRAST,
  VERNE_MIN_VEIL_LUMA,
  VERNE_NAVY,
  VERNE_PHOTO_RATIO_CURVE,
  VERNE_STACK_RATIO_MAX,
  VERNE_UPSCALE_BLOCK,
  VERNE_UPSCALE_WARN,
} from './image-analysis';

/** Build a buffer from a pixel function, in either stride. */
const buffer = (
  width: number,
  height: number,
  at: (x: number, y: number) => Rgb,
  channels: 3 | 4 = 3,
): PixelBuffer => {
  const data = new Uint8ClampedArray(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = at(x, y);
      const i = (y * width + x) * channels;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      if (channels === 4) data[i + 3] = 255;
    }
  }
  return { width, height, data, channels };
};

const gray = (v: number): Rgb => [v, v, v];

/**
 * A bright field with a dark band across the bottom two rows — Verne's failure case: 80 % of
 * the safe zone is a clear sky, 20 % is a silhouette, and the headline lands on the silhouette.
 */
const skyWithSilhouette = (channels: 3 | 4 = 3) =>
  buffer(10, 10, (_x, y) => (y >= 8 ? gray(20) : gray(230)), channels);

describe('WCAG colour', () => {
  it('linearises with the 0.03928 cutoff and the 2.4 exponent', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 10);
    // Below the cutoff the curve is the /12.92 straight line, not the power law.
    expect(relativeLuminance([10, 10, 10])).toBeCloseTo(10 / 255 / 12.92, 10);
  });

  it('gives 21:1 for black on white and is order-independent', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 6);
  });

  it('weights the encoded bytes without linearising', () => {
    expect(encodedLuma([255, 0, 0])).toBeCloseTo(0.2126 * 255, 10);
    expect(encodedLuma(gray(188))).toBeCloseTo(188, 10);
  });
});

describe('percentile', () => {
  // numpy's default method="linear" (type 7): rank = q/100 * (n - 1), interpolated.
  it('interpolates between neighbours rather than indexing by floor(q*n)', () => {
    // rank = 0.2 * 3 = 0.6 → 10 + (20 - 10) * 0.6. A floor-index reader returns 10.
    expect(percentile([10, 20, 30, 40], 20)).toBeCloseTo(16, 10);
    // rank = 0.9 * 4 = 3.6 → 4 + (5 - 4) * 0.6. A floor-index reader returns 5.
    expect(percentile([1, 2, 3, 4, 5], 90)).toBeCloseTo(4.6, 10);
  });

  it('hits the order statistic exactly when the rank is integral', () => {
    expect(percentile([1, 2, 3, 4, 5], 25)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it('does not require sorted input', () => {
    expect(percentile([40, 10, 30, 20], 20)).toBeCloseTo(16, 10);
  });
});

describe('darkPercentileContrast', () => {
  it('is stricter than the whole-box mean on a sky with a silhouette', () => {
    const img = skyWithSilhouette();
    const dark = darkPercentileContrast(img, FULL_FRAME, VERNE_NAVY);
    // percentile: 100 selects every pixel, i.e. exactly the whole-box mean Verne rejected.
    const mean = darkPercentileContrast(img, FULL_FRAME, VERNE_NAVY, { percentile: 100 });

    expect(mean.sampleCount).toBe(100);
    expect(mean.sampled).toEqual([188, 188, 188]);
    expect(dark.sampleCount).toBe(20);
    expect(dark.sampled).toEqual([20, 20, 20]);

    // The whole point. A mean says the navy headline reads comfortably; the darkest fifth
    // says it is invisible. Simplifying this to a mean re-introduces the T2/T5 defect.
    expect(dark.ratio).toBeLessThan(mean.ratio);
    expect(mean.ratio).toBeGreaterThan(VERNE_MIN_CONTRAST);
    expect(dark.ratio).toBeLessThan(VERNE_MIN_CONTRAST);
  });

  it('cuts on the type-7 percentile of ENCODED luma', () => {
    // n = 100, rank = 0.2 * 99 = 19.8 → 20 + (230 - 20) * 0.8 = 188.
    // A floor-index reader cuts at sorted[20] = 230 and would select all 100 pixels.
    const dark = darkPercentileContrast(skyWithSilhouette(), FULL_FRAME, VERNE_NAVY);
    expect(dark.cut).toBeCloseTo(188, 10);
    expect(dark.sampleCount).toBe(20);
  });

  it('linearises AFTER averaging, not before', () => {
    const img = skyWithSilhouette();
    const all = darkPercentileContrast(img, FULL_FRAME, VERNE_NAVY, { percentile: 100 });

    // Correct order: mean the bytes, then run WCAG on that one colour.
    expect(all.ratio).toBeCloseTo(contrastRatio(VERNE_NAVY, all.sampled), 12);

    // Wrong order: linearise every pixel first and average the luminances. Same pixels,
    // materially different answer — this is what a "tidy-up" that hoists the linearisation
    // out of the ratio produces.
    const meanLinear = 0.8 * relativeLuminance(gray(230)) + 0.2 * relativeLuminance(gray(20));
    const navy = relativeLuminance(VERNE_NAVY);
    const wrong = (Math.max(navy, meanLinear) + 0.05) / (Math.min(navy, meanLinear) + 0.05);
    expect(Math.abs(all.ratio - wrong)).toBeGreaterThan(1);
  });

  it('reads the safe zone, not the whole frame', () => {
    // 44 dark pixels sit inside the headline zone (11 x 9 = 99 px of a 400 px frame). That is
    // 44 % of the zone but only 11 % of the frame, so the frame's darkest fifth never reaches
    // them and reads a bright 214 while the zone reads 10.
    const img = buffer(20, 20, (x, y) => (x >= 9 && y >= 5 && y < 9 ? gray(10) : gray(240)));
    const zone = darkPercentileContrast(img);
    const frame = darkPercentileContrast(img, FULL_FRAME);
    expect(zone.sampled).toEqual([10, 10, 10]);
    expect(frame.sampled).toEqual([214, 214, 214]);
    expect(zone.ratio).toBeLessThan(frame.ratio);
  });

  it('falls back to the region mean on a degenerate single-colour region', () => {
    const flat = buffer(4, 4, () => gray(120));
    const r = darkPercentileContrast(flat, FULL_FRAME, VERNE_NAVY);
    expect(r.sampleCount).toBe(16);
    expect(r.sampled).toEqual([120, 120, 120]);
  });
});

describe('brandInkFraction', () => {
  const naturalGradient = (x: number, y: number): Rgb => gray(120 + Math.floor((x + y) * 0.6));

  it('catches a saturated brand block a photograph could not contain', () => {
    const img = buffer(100, 100, (x, y) =>
      x < 10 && y < 10 ? VERNE_BRAND_ACCENTS.violeta_pieza : naturalGradient(x, y),
    );
    const ink = brandInkFraction(img);
    expect(ink.accent).toBe('violeta_pieza');
    expect(ink.fraction).toBeCloseTo(0.01, 10);
    expect(ink.detected).toBe(true);
  });

  it('leaves a natural gradient alone', () => {
    const ink = brandInkFraction(buffer(100, 100, naturalGradient));
    expect(ink.fraction).toBe(0);
    expect(ink.accent).toBeNull();
    expect(ink.detected).toBe(false);
  });

  it('pins the 0.15 % threshold to the pixel', () => {
    const withInk = (count: number) =>
      brandInkFraction(
        buffer(100, 100, (x, y) =>
          y === 0 && x < count ? VERNE_BRAND_ACCENTS.violeta : naturalGradient(x, y),
        ),
      );
    expect(withInk(14).detected).toBe(false); // 0.0014
    expect(withInk(15).detected).toBe(true); // 0.0015 — at the threshold, not above it
  });

  it('measures L1 distance in bytes, strictly under the cutoff', () => {
    // A lone synthetic accent, so a neighbouring brand colour cannot claim the pixel instead.
    const accents = { test: [100, 100, 100] as Rgb };
    const away = (d: number) => buffer(4, 4, () => [100, 100, 100 + d] as Rgb);
    expect(brandInkFraction(away(59), accents).fraction).toBe(1);
    expect(brandInkFraction(away(60), accents).fraction).toBe(0);
    // The distance spends across channels, not per channel: 19 + 19 + 19 = 57 is still inside.
    expect(
      brandInkFraction(
        buffer(4, 4, () => [119, 119, 119]),
        accents,
      ).fraction,
    ).toBe(1);
  });
});

describe('hardEdgeFraction', () => {
  it('lights up on sharp stripes and stays dark on a smooth gradient', () => {
    const stripes = buffer(20, 20, (x) => gray(x % 2 === 0 ? 0 : 255));
    const gradient = buffer(20, 20, (x) => gray(x * 2));
    expect(hardEdgeFraction(stripes, FULL_FRAME).fraction).toBe(1);
    expect(hardEdgeFraction(stripes, FULL_FRAME).detected).toBe(true);
    expect(hardEdgeFraction(gradient, FULL_FRAME).fraction).toBe(0);
    expect(hardEdgeFraction(gradient, FULL_FRAME).detected).toBe(false);
  });

  it('pins the gradient cutoff at 45, exclusive', () => {
    const step = (d: number) => buffer(20, 20, (x) => gray(x % 2 === 0 ? 0 : d));
    expect(hardEdgeFraction(step(45), FULL_FRAME).fraction).toBe(0);
    expect(hardEdgeFraction(step(46), FULL_FRAME).fraction).toBe(1);
  });

  it('drops the last row and column, like numpy diff', () => {
    // 3x3 all-edge image: 2 * 2 = 4 comparisons, not 9.
    const img = buffer(3, 3, (x, y) => gray((x + y) % 2 === 0 ? 0 : 255));
    expect(hardEdgeFraction(img, FULL_FRAME).fraction).toBe(1);
  });

  it('is inert on a region too small to differentiate', () => {
    expect(
      hardEdgeFraction(
        buffer(1, 1, () => gray(0)),
        FULL_FRAME,
      ).fraction,
    ).toBe(0);
  });
});

describe('regionCalm', () => {
  it('reports zero deviation on a flat region', () => {
    const r = regionCalm(
      buffer(8, 8, () => gray(180)),
      FULL_FRAME,
    );
    expect(r.deviation).toBeCloseTo(0, 10);
    expect(r.calm).toBe(true);
  });

  it('pins the 45 deviation ceiling, inclusive', () => {
    // Half at 0 and half at d gives a population deviation of exactly d / 2.
    const halves = (d: number) => buffer(8, 8, (_x, y) => gray(y < 4 ? 0 : d));
    expect(regionCalm(halves(90), FULL_FRAME).deviation).toBeCloseTo(45, 10);
    expect(regionCalm(halves(90), FULL_FRAME).calm).toBe(true);
    expect(regionCalm(halves(92), FULL_FRAME).calm).toBe(false);
  });
});

describe('coverCropRect', () => {
  it('crops the overflowing width when the source is wider than the box', () => {
    expect(coverCropRect({ width: 1000, height: 500 }, { width: 100, height: 100 })).toEqual({
      x: 250,
      y: 0,
      width: 500,
      height: 500,
    });
  });

  it('crops the overflowing height when the source is taller than the box', () => {
    expect(
      coverCropRect({ width: 500, height: 1000 }, { width: 100, height: 100, pos: 0 }),
    ).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });

  it('TRUNCATES the focal offset rather than rounding it', () => {
    // (1001 - 500) * 0.7 = 350.7 → 350. A rounding implementation returns 351.
    const rect = coverCropRect(
      { width: 1001, height: 500 },
      { width: 100, height: 100, posx: 0.7 },
    );
    expect(rect.x).toBe(350);
  });

  it('honours the horizontal focal point at both extremes', () => {
    const src = { width: 1000, height: 500 };
    expect(coverCropRect(src, { width: 100, height: 100, posx: 0 }).x).toBe(0);
    expect(coverCropRect(src, { width: 100, height: 100, posx: 1 }).x).toBe(500);
  });
});

describe('interp', () => {
  it('clamps at both ends instead of extrapolating', () => {
    expect(interp(0.1, VERNE_PHOTO_RATIO_CURVE)).toBe(1.567);
    expect(interp(0.485, VERNE_PHOTO_RATIO_CURVE)).toBe(1.567);
    expect(interp(9, VERNE_PHOTO_RATIO_CURVE)).toBe(2.224);
    expect(interp(1.0, VERNE_PHOTO_RATIO_CURVE)).toBe(2.224);
  });

  it('interpolates linearly between measured points', () => {
    expect(interp(0.524, VERNE_PHOTO_RATIO_CURVE)).toBeCloseTo(1.567 + (1.648 - 1.567) / 2, 10);
  });
});

describe('resolveLegibilityMode', () => {
  it('is direct at or above the AA-large threshold', () => {
    expect(resolveLegibilityMode(4.5, 0).mode).toBe('direct');
    expect(resolveLegibilityMode(8.15, 184).mode).toBe('direct');
  });

  it('veils when the contrast fails but the photo is bright enough to carry a gradient', () => {
    expect(resolveLegibilityMode(4.49, 60).mode).toBe('veiled');
    expect(resolveLegibilityMode(1.2, 200).mode).toBe('veiled');
  });

  it('is unusable when the white veil would bury the photo', () => {
    expect(resolveLegibilityMode(4.49, 59.9).mode).toBe('unusable');
  });

  it('carries the measurements on the union rather than returning a bare string', () => {
    const m = resolveLegibilityMode(3.2, 90);
    expect(m).toEqual({ mode: 'veiled', contrast: 3.2, regionLuma: 90 });
  });
});

describe('requiredUpscale', () => {
  // Reflow formats (aspect > 1.05) fit by height, so the scale is fh / source.height.
  const formats: RenderFormat[] = [
    { id: 'fits', width: 2000, height: 1000 },
    { id: 'soft', width: 2000, height: 1200 },
    { id: 'blocks', width: 2000, height: 1500 },
    { id: 'postIG', width: 1080, height: 1351 },
  ];
  const source = { width: 1000, height: 1000 };

  it('bands each format at 1.15 and 1.35', () => {
    const report = requiredUpscale(source, formats);
    const by = Object.fromEntries(report.formats.map((f) => [f.id, f]));
    expect(by.fits.scale).toBeCloseTo(1.0, 10);
    expect(by.fits.band).toBe('fine');
    expect(by.soft.scale).toBeCloseTo(1.2, 10);
    expect(by.soft.band).toBe('warn');
    expect(by.blocks.scale).toBeCloseTo(1.5, 10);
    expect(by.blocks.band).toBe('block');
    expect(report.worst?.id).toBe('blocks');
    expect(report.band).toBe('block');
  });

  it('takes the stacked branch for a portrait format, off the measured photo curve', () => {
    const report = requiredUpscale(source, formats);
    const postIG = report.formats.find((f) => f.id === 'postIG');
    // 1080 / 1351 = 0.7994 ≤ 1.05, so the photo runs full width: the width term (1.08) wins
    // over the photo-block height term (~0.60).
    expect(postIG?.scale).toBeCloseTo(1.08, 5);
    expect(postIG?.band).toBe('fine');
  });

  it('does NOT block a 1536px generated image the engine only stretches 1.05x', () => {
    // The regression `server.py:1774-1795` exists to prevent: the old `max(1200, 1600)` fixed
    // minimum failed the widest image the generator produces.
    const generated = { width: 1536, height: 1024 };
    const report = requiredUpscale(generated, [{ id: 'wallTV', width: 1921, height: 1080 }]);
    expect(report.formats[0].scale).toBeCloseTo(1080 / 1024, 10);
    expect(report.band).toBe('fine');
  });

  it('reports the source height that would clear the bar, and clearing it works', () => {
    const report = requiredUpscale(source, formats);
    expect(report.minSourceHeight).toBe(Math.ceil((1000 * 1.5) / 1.15)); // 1305
    // The number is only worth printing if re-shooting at it actually passes.
    const cleared = requiredUpscale({ width: 1000, height: report.minSourceHeight }, formats);
    expect(cleared.band).toBe('fine');
  });

  it('reports no required height when nothing needs enlarging', () => {
    const report = requiredUpscale({ width: 4000, height: 4000 }, formats);
    expect(report.band).toBe('fine');
    expect(report.minSourceHeight).toBe(0);
    expect(report.worst?.id).toBeDefined();
  });

  it('is empty-safe', () => {
    const report = requiredUpscale(source, []);
    expect(report.worst).toBeNull();
    expect(report.band).toBe('fine');
    expect(report.minSourceHeight).toBe(0);
  });
});

describe('RGB and RGBA strides', () => {
  it('produce identical numbers for the same image', () => {
    const scene = (x: number, y: number): Rgb => [
      (x * 7 + y * 3) % 256,
      (x * 13 + y * 5) % 256,
      (x * 3 + y * 11) % 256,
    ];
    const rgb = buffer(24, 24, scene, 3);
    const rgba = buffer(24, 24, scene, 4);

    expect(darkPercentileContrast(rgba)).toEqual(darkPercentileContrast(rgb));
    expect(brandInkFraction(rgba)).toEqual(brandInkFraction(rgb));
    expect(hardEdgeFraction(rgba, FULL_FRAME)).toEqual(hardEdgeFraction(rgb, FULL_FRAME));
    expect(regionCalm(rgba, FULL_FRAME)).toEqual(regionCalm(rgb, FULL_FRAME));
  });

  it('reads the silhouette case identically in both layouts', () => {
    expect(darkPercentileContrast(skyWithSilhouette(4), FULL_FRAME)).toEqual(
      darkPercentileContrast(skyWithSilhouette(3), FULL_FRAME),
    );
  });
});

describe('calibrated constants', () => {
  // These are Verne's measured values against one client's artwork. If a change to this module
  // moves one of them, that is a recalibration and it needs to be argued for, not merged.
  it('match the Python reference exactly', () => {
    expect(VERNE_DARK_PERCENTILE).toBe(20);
    expect(VERNE_MIN_CONTRAST).toBe(4.5);
    expect(VERNE_MIN_VEIL_LUMA).toBe(60);
    expect(VERNE_MAX_REGION_DEVIATION).toBe(45);
    expect(VERNE_EDGE_GRADIENT).toBe(45);
    expect(VERNE_MAX_EDGE_FRACTION).toBe(0.025);
    expect(VERNE_INK_DISTANCE).toBe(60);
    expect(VERNE_MAX_INK_FRACTION).toBe(0.0015);
    expect(VERNE_UPSCALE_WARN).toBe(1.15);
    expect(VERNE_UPSCALE_BLOCK).toBe(1.35);
    expect(VERNE_STACK_RATIO_MAX).toBe(1.05);
    expect(VERNE_NAVY).toEqual([0x0f, 0x1f, 0x43]);
    expect(VERNE_PHOTO_RATIO_CURVE).toEqual([
      [0.485, 1.567],
      [0.563, 1.648],
      [0.799, 1.8],
      [1.0, 2.224],
    ]);
    expect(VERNE_BRAND_ACCENTS).toEqual({
      violeta: [0x4b, 0x1f, 0xd4],
      azul: [0x0b, 0x3b, 0x8c],
      naranja: [0xde, 0x82, 0x18],
      rojo: [0xce, 0x31, 0x29],
      oro: [0xc0, 0x8a, 0x2e],
      violeta_pieza: [0x5b, 0x00, 0xe1],
    });
  });
});
