import { describe, expect, it } from 'bun:test';
import {
  clipEffectsToCss,
  FILTER_PRESETS,
  filterString,
  hasVisualEffects,
  opacityFor,
  resolveAdjustments,
  resolveTextOverlays,
  resolveTransformAt,
  speedFor,
} from './effectSpec';

describe('filterString', () => {
  it('emits only non-default adjustments in CSS/canvas syntax', () => {
    expect(filterString({ brightness: 1.2, contrast: 1, saturation: 0.5 })).toBe(
      'brightness(1.2) saturate(0.5)',
    );
    expect(filterString(undefined)).toBe('');
    expect(filterString({ brightness: 1, contrast: 1, saturation: 1 })).toBe('');
  });
});

describe('resolveTransformAt', () => {
  it('returns the static transform when there is no Ken Burns', () => {
    expect(resolveTransformAt({ transform: { scale: 1.5 } }, 0.5)).toEqual({
      scale: 1.5,
      offsetX: 0,
      offsetY: 0,
      rotate: 0,
    });
  });

  it('interpolates Ken Burns from → to across normalized time', () => {
    const spec = { kenBurns: { from: { scale: 1 }, to: { scale: 2, offsetX: 0.2 } } };
    expect(resolveTransformAt(spec, 0).scale).toBe(1);
    expect(resolveTransformAt(spec, 1).scale).toBe(2);
    const mid = resolveTransformAt(spec, 0.5);
    expect(mid.scale).toBeCloseTo(1.5);
    expect(mid.offsetX).toBeCloseTo(0.1);
  });
});

describe('clipEffectsToCss', () => {
  it('builds filter + transform + opacity from the spec', () => {
    const css = clipEffectsToCss(
      { opacity: 0.5, adjustments: { brightness: 1.1 }, transform: { scale: 1.2, rotate: 90 } },
      0,
    );
    expect(css.filter).toBe('brightness(1.1)');
    expect(css.transform).toBe('rotate(90deg) scale(1.2, 1.2)');
    expect(css.opacity).toBe(0.5);
  });

  it('omits fields that are at their defaults', () => {
    expect(clipEffectsToCss({ opacity: 1 }, 0)).toEqual({
      filter: undefined,
      transform: undefined,
      opacity: undefined,
    });
  });
});

describe('scalars', () => {
  it('speedFor defaults to 1 and rejects non-positive', () => {
    expect(speedFor(undefined)).toBe(1);
    expect(speedFor({ speed: 2 })).toBe(2);
    expect(speedFor({ speed: 0 })).toBe(1);
  });

  it('opacityFor clamps to 0..1', () => {
    expect(opacityFor({ opacity: -1 })).toBe(0);
    expect(opacityFor({ opacity: 2 })).toBe(1);
    expect(opacityFor(undefined)).toBe(1);
  });
});

describe('resolveTextOverlays', () => {
  it('applies defaults for position/size/color', () => {
    const [resolved] = resolveTextOverlays({ text: [{ id: 't1', text: 'Hi' }] });
    expect(resolved).toMatchObject({
      xFrac: 0.5,
      yFrac: 0.88,
      sizeFrac: 0.06,
      color: '#ffffff',
      fontWeight: 700,
    });
  });
});

describe('hasVisualEffects', () => {
  it('detects any active effect and ignores no-op specs', () => {
    expect(hasVisualEffects(undefined)).toBe(false);
    expect(hasVisualEffects({ opacity: 1, speed: 2 })).toBe(false);
    expect(hasVisualEffects({ adjustments: { brightness: 1.2 } })).toBe(true);
    expect(hasVisualEffects({ text: [{ id: 'a', text: 'x' }] })).toBe(true);
    expect(hasVisualEffects({ transform: { scale: 1.1 } })).toBe(true);
  });
});

describe('filterString — extended filters', () => {
  it('emits grayscale/sepia/hue-rotate/blur/invert only when set', () => {
    expect(filterString({ grayscale: 1, sepia: 0.4, hueRotate: -12, blur: 2, invert: 0.5 })).toBe(
      'grayscale(1) sepia(0.4) hue-rotate(-12deg) blur(2px) invert(0.5)',
    );
    expect(filterString({ grayscale: 0, sepia: 0, hueRotate: 0, blur: 0, invert: 0 })).toBe('');
  });
});

describe('resolveAdjustments', () => {
  it('returns the manual adjustments when no preset is set', () => {
    expect(resolveAdjustments({ adjustments: { brightness: 1.2 } })).toEqual({ brightness: 1.2 });
    expect(resolveAdjustments({ filterPreset: 'none', adjustments: { contrast: 1.1 } })).toEqual({
      contrast: 1.1,
    });
  });

  it('merges a preset under the manual adjustments (manual wins)', () => {
    const resolved = resolveAdjustments({ filterPreset: 'bw', adjustments: { contrast: 2 } });
    expect(resolved).toEqual({ ...FILTER_PRESETS.bw, contrast: 2 });
  });
});

describe('clipEffectsToCss — flip + blend + preset', () => {
  it('applies a filter preset to the CSS filter', () => {
    const css = clipEffectsToCss({ filterPreset: 'bw' }, 0);
    expect(css.filter).toContain('grayscale(1)');
  });

  it('negates the scale axis for flips and passes a non-normal blend mode', () => {
    const css = clipEffectsToCss({ flipH: true, blendMode: 'screen' }, 0);
    expect(css.transform).toContain('scale(-1, 1)');
    expect(css.mixBlendMode).toBe('screen');
  });

  it('omits a normal blend mode', () => {
    expect(clipEffectsToCss({ blendMode: 'normal' }, 0).mixBlendMode).toBeUndefined();
  });
});

describe('hasVisualEffects — new fields', () => {
  it('is true for a filter preset, a flip, or a blend mode', () => {
    expect(hasVisualEffects({ filterPreset: 'vivid' })).toBe(true);
    expect(hasVisualEffects({ flipH: true })).toBe(true);
    expect(hasVisualEffects({ blendMode: 'multiply' })).toBe(true);
    expect(hasVisualEffects({ filterPreset: 'none', blendMode: 'normal' })).toBe(false);
  });
});

describe('resolveTransformAt — keyframes', () => {
  const kfs = [
    { t: 0, transform: { scale: 1 } },
    { t: 0.5, transform: { scale: 2, rotate: 20 } },
    { t: 1, transform: { scale: 1 } },
  ];

  it('clamps to the first/last stop outside the range', () => {
    expect(resolveTransformAt({ keyframes: kfs }, 0).scale).toBe(1);
    expect(resolveTransformAt({ keyframes: kfs }, 1).scale).toBe(1);
  });

  it('linearly interpolates within a segment', () => {
    expect(resolveTransformAt({ keyframes: kfs }, 0.25).scale).toBeCloseTo(1.5, 5);
    expect(resolveTransformAt({ keyframes: kfs }, 0.5).scale).toBeCloseTo(2, 5);
    expect(resolveTransformAt({ keyframes: kfs }, 0.5).rotate).toBeCloseTo(20, 5);
    expect(resolveTransformAt({ keyframes: kfs }, 0.75).scale).toBeCloseTo(1.5, 5);
  });

  it('takes precedence over kenBurns and sorts unordered stops', () => {
    const spec = {
      kenBurns: { from: { scale: 5 }, to: { scale: 9 } },
      keyframes: [
        { t: 1, transform: { scale: 3 } },
        { t: 0, transform: { scale: 1 } },
      ],
    };
    expect(resolveTransformAt(spec, 0.5).scale).toBeCloseTo(2, 5);
  });
});
