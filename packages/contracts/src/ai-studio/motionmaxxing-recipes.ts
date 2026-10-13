/** Easing mathematics adapted from Tejashmakwana/motionmaxxing 8c8ec0f, Apache-2.0. No GSAP dependency. */
import { type EditorKeyframe, editorKeyframeSchema } from './editor-project-v2';
import type { MotionRecipe } from './motion-recipe';

const powerOut = (p: number) => (t: number) => 1 - (1 - t) ** p;
const powerIn = (p: number) => (t: number) => t ** p;
const expoOut = (k: number) => (t: number) => (1 - Math.exp(-k * t)) / (1 - Math.exp(-k));
const snapRamp = (w: number, tau: number) => (t: number) =>
  (w * (1 - Math.exp(-t / tau)) + (1 - w) * t) / (w * (1 - Math.exp(-1 / tau)) + 1 - w);
const snapOver = (a: number, ta: number, td: number) => {
  const f = (t: number) => (1 + a * Math.exp(-t / td)) * (1 - Math.exp(-t / ta));
  return (t: number) => f(t) / f(1);
};
const spring = (c: number, omega: number) => {
  const f = (t: number) =>
    1 - Math.exp(-c * t) * (Math.cos(omega * t) + (c / omega) * Math.sin(omega * t));
  return (t: number) => f(t) / f(1);
};
const smooth = (p: number) => (t: number) => t ** p / (t ** p + (1 - t) ** p);
const guard = (f: (t: number) => number) => (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : f(t));
export const MOTIONMAXXING_EASES = {
  crashIn: guard(snapOver(2, 0.19, 0.218)),
  popOver: guard(spring(2.67, 4.36)),
  bounceHard: guard(spring(1.34, 5.07)),
  snapSettle: guard(snapRamp(0.942, 0.118)),
  softLand: guard(expoOut(3.41)),
  whip: guard(powerOut(2.52)),
  glide: guard(powerOut(1.7)),
  cruise: guard((t) => t),
  softInOut: guard(smooth(1.42)),
  gentleIn: guard(powerIn(2.07)),
  accelExit: guard(powerIn(2.6)),
  crashOut: guard(powerIn(3.97)),
} as const;
export type MotionmaxxingEase = keyof typeof MOTIONMAXXING_EASES;
export const MOTIONMAXXING_EASE_FRAMES = {
  crashIn: 10,
  popOver: 15,
  bounceHard: 22,
  snapSettle: 11,
  softLand: 12,
  whip: 7,
  glide: 10,
  cruise: 9,
  softInOut: 9,
  gentleIn: 9,
  accelExit: 13,
  crashOut: 17,
} as const;
export const MOTIONMAXXING_AUTHORING_GUIDANCE = [
  'Use explicit start and end values so random seeks reproduce playback.',
  'Give the composition one clear hierarchy and readable copy.',
  'Use overshoot selectively; keep opacity within its legal range.',
  'Allow intentional stillness, captions, lower thirds, and end cards.',
] as const;
/** Sample into native linear keys at the project frame rate; existing saved interpolation semantics remain unchanged. */
export function motionmaxxingRecipe(params: {
  property: Exclude<EditorKeyframe['property'], 'transform.position'>;
  parameterName?: string;
  from: number;
  to: number;
  ease: MotionmaxxingEase;
  fps: number;
  durationSec?: number;
}): MotionRecipe {
  if (
    !Number.isFinite(params.fps) ||
    params.fps <= 0 ||
    !Number.isFinite(params.from) ||
    !Number.isFinite(params.to)
  )
    throw new Error('Invalid motion recipe timing or values.');
  const durationSec = params.durationSec ?? MOTIONMAXXING_EASE_FRAMES[params.ease] / 30;
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 60)
    throw new Error('Motion recipe duration must be between zero and 60 seconds.');
  const count = Math.ceil(durationSec * params.fps);
  if (count > 499) throw new Error('Motion recipe exceeds the native keyframe budget.');
  return {
    durationSec,
    keyframes: Array.from({ length: count + 1 }, (_, index) => {
      const timeSec = Math.min(index / params.fps, durationSec);
      let value =
        params.from +
        (params.to - params.from) * MOTIONMAXXING_EASES[params.ease](timeSec / durationSec);
      if (params.property === 'transform.opacity') value = Math.min(1, Math.max(0, value));
      return editorKeyframeSchema.parse({
        id: `motionmaxxing-v1:${index}`,
        timeSec,
        property: params.property,
        value,
        interpolation: 'linear',
        ...(params.parameterName ? { parameterName: params.parameterName } : {}),
      });
    }),
  };
}
