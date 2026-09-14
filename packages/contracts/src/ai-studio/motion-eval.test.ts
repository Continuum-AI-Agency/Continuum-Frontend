import { describe, expect, test } from 'bun:test';
import {
  cubicBezierProgress,
  MOTION_BEZIER_PRESETS,
  numericKeysForProperty,
  sampleNumericTrack,
  samplePositionTrack,
  springProgress,
} from './motion-eval';

describe('sampleNumericTrack', () => {
  test('returns the clip base value when the track is empty', () => {
    expect(sampleNumericTrack([], 0.4, 0.8)).toBe(0.8);
  });

  test('uses the base value before the first key', () => {
    expect(sampleNumericTrack([{ timeSec: 1, value: 0, interpolation: 'linear' }], 0.25, 1)).toBe(
      1,
    );
  });

  test('holds the last key after the track ends', () => {
    expect(
      sampleNumericTrack(
        [
          { timeSec: 0, value: 0, interpolation: 'linear' },
          { timeSec: 1, value: 1, interpolation: 'linear' },
        ],
        4,
        0.5,
      ),
    ).toBe(1);
  });

  test('linear-interpolates a 0→1 span at the midpoint', () => {
    expect(
      sampleNumericTrack(
        [
          { timeSec: 0, value: 0, interpolation: 'linear' },
          { timeSec: 2, value: 1, interpolation: 'linear' },
        ],
        1,
        0,
      ),
    ).toBe(0.5);
  });

  test('Figma hold jumps to the arriving key for the whole span', () => {
    expect(
      sampleNumericTrack(
        [
          { timeSec: 0, value: 0, interpolation: 'hold' },
          { timeSec: 1, value: 1, interpolation: 'hold' },
        ],
        0.01,
        0,
      ),
    ).toBe(1);
  });
});

describe('cubicBezierProgress', () => {
  test('the linear curve is identity at the midpoint', () => {
    expect(cubicBezierProgress(0.5, MOTION_BEZIER_PRESETS.linear)).toBeCloseTo(0.5, 5);
  });

  test('ease-out-back overshoots past 1 before settling', () => {
    const samples = [0.6, 0.7, 0.8, 0.9].map((progress) =>
      cubicBezierProgress(progress, MOTION_BEZIER_PRESETS.easeOutBack),
    );
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(cubicBezierProgress(1, MOTION_BEZIER_PRESETS.easeOutBack)).toBeCloseTo(1, 3);
  });

  test('a linear bezier span matches linear interpolation', () => {
    expect(
      sampleNumericTrack(
        [
          {
            timeSec: 0,
            value: 10,
            interpolation: 'bezier',
            easing: MOTION_BEZIER_PRESETS.linear,
          },
          { timeSec: 1, value: 20, interpolation: 'linear' },
        ],
        0.5,
        0,
      ),
    ).toBeCloseTo(15, 5);
  });
});

describe('springProgress', () => {
  test('bounce 0 is cubic ease-out: 1 - (1-t)^3', () => {
    expect(springProgress(0, 0)).toBe(0);
    expect(springProgress(1, 0)).toBe(1);
    expect(springProgress(0.5, 0)).toBeCloseTo(0.875, 8);
  });

  test('a bouncy spring overshoots 1 before t=1', () => {
    const samples = Array.from({ length: 20 }, (_, index) => springProgress((index + 1) / 20, 0.8));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(springProgress(1, 0.8)).toBeCloseTo(1, 1);
  });

  test('a spring span uses bounce on the departing key', () => {
    const mid = sampleNumericTrack(
      [
        { timeSec: 0, value: 0, interpolation: 'spring', spring: { bounce: 0 } },
        { timeSec: 1, value: 1, interpolation: 'linear' },
      ],
      0.5,
      0,
    );
    expect(mid).toBeCloseTo(0.875, 8);
  });
});

describe('samplePositionTrack', () => {
  test('interpolates x and y independently from the same span', () => {
    expect(
      samplePositionTrack(
        [
          { timeSec: 0, value: { x: 0, y: 1 }, interpolation: 'linear' },
          { timeSec: 2, value: { x: 1, y: 0 }, interpolation: 'linear' },
        ],
        1,
        { x: 0.5, y: 0.5 },
      ),
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  test('uses the clip base position before the first key', () => {
    expect(
      samplePositionTrack([{ timeSec: 1, value: { x: 0, y: 0 }, interpolation: 'linear' }], 0.2, {
        x: 0.4,
        y: 0.6,
      }),
    ).toEqual({ x: 0.4, y: 0.6 });
  });
});

describe('motion expressions', () => {
  test('loop wraps time past the last key back into the span', () => {
    const keys = [
      { timeSec: 0, value: 0, interpolation: 'linear' as const, expression: 'loop' },
      { timeSec: 1, value: 1, interpolation: 'linear' as const },
    ];
    expect(sampleNumericTrack(keys, 0.25, 0)).toBeCloseTo(0.25);
    expect(sampleNumericTrack(keys, 1.25, 0)).toBeCloseTo(0.25);
  });

  test('wiggle adds a sine of known amplitude at t=0.25', () => {
    const value = sampleNumericTrack(
      [
        {
          timeSec: 0,
          value: 0.5,
          interpolation: 'hold' as const,
          expression: 'wiggle(1, 0.2)',
        },
        { timeSec: 1, value: 0.5, interpolation: 'linear' as const },
      ],
      0.25,
      0,
    );
    expect(value).toBeCloseTo(0.5 + 0.2 * Math.sin(2 * Math.PI * 1 * 0.25));
  });
});

describe('numericKeysForProperty', () => {
  test('keeps only numeric keys for one property', () => {
    expect(
      numericKeysForProperty(
        [
          {
            property: 'transform.opacity',
            timeSec: 0,
            value: 0.2,
            interpolation: 'linear',
          },
          {
            property: 'transform.position',
            timeSec: 0,
            value: { x: 0.5, y: 0.5 },
            interpolation: 'linear',
          },
          {
            property: 'transform.opacity',
            timeSec: 1,
            value: 1,
            interpolation: 'hold',
          },
        ],
        'transform.opacity',
      ),
    ).toEqual([
      { timeSec: 0, value: 0.2, interpolation: 'linear' },
      { timeSec: 1, value: 1, interpolation: 'hold' },
    ]);
  });
});
