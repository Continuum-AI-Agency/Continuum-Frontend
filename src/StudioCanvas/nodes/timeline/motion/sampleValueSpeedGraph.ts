import { type EditorKeyframe, sampleNumericTrack } from '@continuum/contracts';

export type MotionGraphPoint = {
  t: number;
  value: number;
  speed: number;
};

/** Sample a numeric (or position-x) track into value + speed plots. */
export function sampleValueSpeedGraph(
  keys: readonly EditorKeyframe[],
  durationSec: number,
  fallback: number,
  count = 80,
): MotionGraphPoint[] {
  if (durationSec <= 0 || count < 2) return [];
  const numeric = keys.flatMap((keyframe) => {
    if (typeof keyframe.value === 'number') {
      return [
        {
          timeSec: keyframe.timeSec,
          value: keyframe.value,
          interpolation: keyframe.interpolation,
          easing: keyframe.easing,
          spring: keyframe.spring,
          expression: keyframe.expression,
        },
      ];
    }
    if (
      typeof keyframe.value === 'object' &&
      keyframe.value &&
      'x' in keyframe.value &&
      typeof keyframe.value.x === 'number'
    ) {
      return [
        {
          timeSec: keyframe.timeSec,
          value: keyframe.value.x,
          interpolation: keyframe.interpolation,
          easing: keyframe.easing,
          spring: keyframe.spring,
          expression: keyframe.expression,
        },
      ];
    }
    return [];
  });
  const dt = durationSec / (count - 1);
  const points: MotionGraphPoint[] = [];
  let previous = fallback;
  for (let index = 0; index < count; index += 1) {
    const t = index * dt;
    const value = sampleNumericTrack(numeric, t, fallback);
    points.push({
      t,
      value,
      speed: index === 0 ? 0 : (value - previous) / dt,
    });
    previous = value;
  }
  return points;
}
