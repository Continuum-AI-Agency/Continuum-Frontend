import { describe, expect, test } from 'bun:test';
import { sampleNumericTrack, samplePositionTrack } from './motion-eval';
import { compileMotionStyle, trimStyleInstance } from './motion-styles';

const base = {
  position: { x: 0.5, y: 0.5, unit: 'normalized' as const },
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  opacity: 1,
};

describe('compileMotionStyle', () => {
  test('fade writes opacity 0→base over the span', () => {
    const keys = compileMotionStyle({
      styleId: 'fade',
      instanceId: 'style-1',
      timelineOffsetSec: 0,
      durationSec: 0.4,
      base,
    });
    expect(keys).toHaveLength(2);
    expect(
      sampleNumericTrack(
        keys.map((key) => ({
          timeSec: key.timeSec,
          value: key.value as number,
          interpolation: key.interpolation,
          easing: key.easing,
        })),
        0.2,
        1,
      ),
    ).toBeGreaterThan(0.5);
    expect(keys[0]?.value).toBe(0);
    expect(
      sampleNumericTrack(
        keys.map((key) => ({
          timeSec: key.timeSec,
          value: key.value as number,
          interpolation: key.interpolation,
          easing: key.easing,
        })),
        0,
        1,
      ),
    ).toBeCloseTo(0, 10);
  });

  test('move starts 15% left of the base and lands on it', () => {
    const keys = compileMotionStyle({
      styleId: 'move',
      instanceId: 'style-2',
      timelineOffsetSec: 1,
      durationSec: 0.5,
      base,
    });
    const sampled = samplePositionTrack(
      keys.map((key) => ({
        timeSec: key.timeSec,
        value: key.value as { x: number; y: number },
        interpolation: key.interpolation,
        easing: key.easing,
      })),
      1,
      base.position,
    );
    expect(sampled.x).toBeCloseTo(0.35);
    expect(sampled.y).toBe(0.5);
  });

  test('scale and rotate emit the named properties only', () => {
    expect(
      compileMotionStyle({
        styleId: 'scale',
        instanceId: 's',
        timelineOffsetSec: 0,
        durationSec: 0.3,
        base,
      }).map((key) => key.property),
    ).toEqual(['transform.scaleX', 'transform.scaleX', 'transform.scaleY', 'transform.scaleY']);
    expect(
      compileMotionStyle({
        styleId: 'rotate',
        instanceId: 'r',
        timelineOffsetSec: 0,
        durationSec: 0.3,
        base,
      }).map((key) => key.value),
    ).toEqual([0, 180]);
  });
});

describe('trimStyleInstance', () => {
  test('stretches a fade from 0.4s onto a 1s span without touching other keys', () => {
    const fade = compileMotionStyle({
      styleId: 'fade',
      instanceId: 'fade-1',
      timelineOffsetSec: 0,
      durationSec: 0.4,
      base,
    });
    const extra = {
      id: 'manual',
      property: 'transform.opacity' as const,
      timeSec: 2,
      value: 0.5,
      interpolation: 'linear' as const,
    };
    const trimmed = trimStyleInstance([...fade, extra], 'fade-1', 0.2, 1.2);
    expect(trimmed.find((key) => key.id === 'manual')?.timeSec).toBe(2);
    const owned = trimmed.filter((key) => key.id.startsWith('fade-1:'));
    expect(Math.min(...owned.map((key) => key.timeSec))).toBeCloseTo(0.2);
    expect(Math.max(...owned.map((key) => key.timeSec))).toBeCloseTo(1.2);
  });
});
