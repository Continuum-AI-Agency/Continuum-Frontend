import { describe, expect, it } from 'bun:test';
import {
  captionAnchorSec,
  captionWordTransform,
  easeOutCubic,
  easeOutQuad,
  easeOutQuart,
  IDENTITY_WORD_TRANSFORM,
  popScale,
} from './captionAnimation';

const FONT_PX = 100;

describe('easings', () => {
  it('are pinned at 0, 0.5 and 1 to the published easings.net values', () => {
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(0.5)).toBeCloseTo(0.75, 10);
    expect(easeOutQuad(1)).toBe(1);

    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
    expect(easeOutCubic(1)).toBe(1);

    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(0.5)).toBeCloseTo(0.9375, 10);
    expect(easeOutQuart(1)).toBe(1);
  });

  it('are monotone across the unit interval', () => {
    for (const ease of [easeOutQuad, easeOutCubic, easeOutQuart]) {
      let previous = -Infinity;
      for (let i = 0; i <= 20; i += 1) {
        const value = ease(i / 20);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });
});

describe('popScale', () => {
  const FROM = 0.72;
  const PEAK = 1.14;

  it('hits its three exact points: from at 0, peak at riseFrac, exactly 1 at the end', () => {
    expect(popScale(0, FROM, PEAK)).toBe(FROM);
    expect(popScale(0.55, FROM, PEAK)).toBeCloseTo(PEAK, 10);
    expect(popScale(1, FROM, PEAK)).toBe(1);
  });

  it('clamps outside the unit interval rather than extrapolating', () => {
    expect(popScale(-5, FROM, PEAK)).toBe(FROM);
    expect(popScale(9, FROM, PEAK)).toBe(1);
  });

  it('overshoots above the settled scale between the peak and the end', () => {
    // The whole point of the curve: after the rise it is still ABOVE 1 and easing down.
    expect(popScale(0.7, FROM, PEAK)).toBeGreaterThan(1);
    expect(popScale(0.9, FROM, PEAK)).toBeGreaterThan(1);
    expect(popScale(0.7, FROM, PEAK)).toBeGreaterThan(popScale(0.9, FROM, PEAK));
  });

  it('rises monotonically to the peak', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 11; i += 1) {
      const value = popScale((i / 11) * 0.55, FROM, PEAK);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('captionWordTransform', () => {
  it('is the identity for kind none and for an absent animation', () => {
    expect(captionWordTransform(undefined, 0.5, FONT_PX)).toEqual(IDENTITY_WORD_TRANSFORM);
    expect(captionWordTransform({ kind: 'none' }, 0.5, FONT_PX)).toEqual(IDENTITY_WORD_TRANSFORM);
  });

  it('pop starts small, overshoots, and settles to exactly 1', () => {
    const anim = { kind: 'pop', durationSec: 0.18, amplitude: 0.28 } as const;
    expect(captionWordTransform(anim, 0, FONT_PX).scale).toBeCloseTo(0.72, 10);
    // riseFrac 0.55 of 0.18s = 0.099s
    expect(captionWordTransform(anim, 0.099, FONT_PX).scale).toBeCloseTo(1.14, 10);
    expect(captionWordTransform(anim, 0.18, FONT_PX).scale).toBe(1);
    expect(captionWordTransform(anim, 5, FONT_PX).scale).toBe(1);
  });

  it('pop is above the settled scale at the frame the render bench samples', () => {
    // The bench decodes the 30fps frames after a word start pinned to a frame boundary.
    // +33.3ms reads BELOW 1 and would fail the overshoot assert; +66.7ms reads above it.
    // This test is what stops someone "simplifying" the fixture back onto the wrong frame.
    const anim = { kind: 'pop', durationSec: 0.18, amplitude: 0.28 } as const;
    const settled = captionWordTransform(anim, 0.3, FONT_PX).scale;
    expect(settled).toBe(1);
    expect(captionWordTransform(anim, 1 / 30, FONT_PX).scale).toBeLessThan(settled);
    expect(captionWordTransform(anim, 2 / 30, FONT_PX).scale).toBeGreaterThan(settled);
  });

  it('scaleIn is monotone and never overshoots', () => {
    const anim = { kind: 'scaleIn', durationSec: 0.22, amplitude: 0.28 } as const;
    let previous = -Infinity;
    for (let i = 0; i <= 22; i += 1) {
      const { scale } = captionWordTransform(anim, (i / 22) * 0.22, FONT_PX);
      expect(scale).toBeLessThanOrEqual(1 + 1e-12);
      expect(scale).toBeGreaterThanOrEqual(previous);
      previous = scale;
    }
    expect(captionWordTransform(anim, 0.22, FONT_PX).scale).toBeCloseTo(1, 10);
  });

  it('floatIn starts below the baseline, rises to it, and never scales', () => {
    const anim = { kind: 'floatIn', durationSec: 0.3, amplitude: 0.45 } as const;
    const start = captionWordTransform(anim, 0, FONT_PX);
    expect(start.dy).toBeCloseTo(45, 10); // positive dy is DOWN — it starts below
    expect(start.scale).toBe(1);
    expect(captionWordTransform(anim, 0.15, FONT_PX).dy).toBeLessThan(start.dy);
    expect(captionWordTransform(anim, 0.3, FONT_PX).dy).toBeCloseTo(0, 10);
  });

  it('scales floatIn displacement with the font size, so a preset survives any resolution', () => {
    const anim = { kind: 'floatIn', durationSec: 0.3, amplitude: 0.45 } as const;
    expect(captionWordTransform(anim, 0, 50).dy).toBeCloseTo(22.5, 10);
    expect(captionWordTransform(anim, 0, 200).dy).toBeCloseTo(90, 10);
  });

  it('fades in from transparent and reaches full opacity', () => {
    for (const kind of ['pop', 'scaleIn', 'floatIn'] as const) {
      expect(captionWordTransform({ kind }, 0, FONT_PX).alpha).toBe(0);
      expect(captionWordTransform({ kind }, 10, FONT_PX).alpha).toBe(1);
    }
  });

  it('hides a word before its own start only under reveal word', () => {
    expect(captionWordTransform({ kind: 'pop', reveal: 'word' }, -0.01, FONT_PX).visible).toBe(
      false,
    );
    expect(captionWordTransform({ kind: 'pop', reveal: 'word' }, 0, FONT_PX).visible).toBe(true);
    expect(captionWordTransform({ kind: 'pop', reveal: 'cue' }, -0.5, FONT_PX).visible).toBe(true);
    expect(captionWordTransform({ kind: 'none', reveal: 'word' }, -0.5, FONT_PX).visible).toBe(
      false,
    );
  });

  it('returns finite geometry for absurd ages and degenerate durations', () => {
    for (const kind of ['pop', 'scaleIn', 'floatIn'] as const) {
      for (const age of [-1e6, 1e6, Number.NaN, Number.POSITIVE_INFINITY]) {
        const tf = captionWordTransform({ kind }, age, FONT_PX);
        expect(Number.isFinite(tf.scale)).toBe(true);
        expect(Number.isFinite(tf.dx)).toBe(true);
        expect(Number.isFinite(tf.dy)).toBe(true);
        expect(Number.isFinite(tf.alpha)).toBe(true);
      }
      expect(captionWordTransform({ kind, durationSec: 0 }, 1, FONT_PX)).toEqual(
        IDENTITY_WORD_TRANSFORM,
      );
    }
  });

  it('is a pure function of age — the same age always yields the same transform', () => {
    const anim = { kind: 'pop' } as const;
    const first = captionWordTransform(anim, 0.07, FONT_PX);
    for (let i = 0; i < 5; i += 1) {
      expect(captionWordTransform(anim, 0.07, FONT_PX)).toEqual(first);
    }
  });
});

describe('captionAnchorSec', () => {
  it('reads the word clock by default and the cue clock when anchored to the cue', () => {
    expect(captionAnchorSec(undefined, 1, 2.5)).toBe(2.5);
    expect(captionAnchorSec({ kind: 'pop' }, 1, 2.5)).toBe(2.5);
    expect(captionAnchorSec({ kind: 'pop', anchor: 'word' }, 1, 2.5)).toBe(2.5);
    expect(captionAnchorSec({ kind: 'scaleIn', anchor: 'cue' }, 1, 2.5)).toBe(1);
  });
});
