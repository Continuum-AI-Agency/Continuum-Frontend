/**
 * Shared motion sampler for EditorProjectV2 keyframes.
 *
 * Preview CSS and the Mediabunny draw path must call this. A second interpolator
 * is how linear transform keys drifted from bezier shader keys.
 *
 * Hold is Figma-shaped: the span jumps to the *next* key's value immediately
 * (help: "jumps to its final position and stays there"). That is the opposite
 * of After Effects hold, which stays on the departing key.
 */

export type MotionInterpolation = 'hold' | 'linear' | 'bezier' | 'spring';

export type MotionBezier = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type MotionSpring = {
  bounce: number;
};

export type NumericKeyframe = {
  timeSec: number;
  value: number;
  interpolation: MotionInterpolation;
  easing?: MotionBezier;
  spring?: MotionSpring;
  expression?: string;
};

export type ParsedMotionExpression =
  | { kind: 'loop' }
  | { kind: 'wiggle'; freq: number; amp: number };

export function parseMotionExpression(source: string | undefined): ParsedMotionExpression | null {
  if (!source) return null;
  const trimmed = source.trim().toLowerCase();
  if (trimmed === 'loop') return { kind: 'loop' };
  const wiggle = trimmed.match(/^wiggle\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/);
  if (wiggle) {
    return { kind: 'wiggle', freq: Number(wiggle[1]), amp: Number(wiggle[2]) };
  }
  return null;
}

export function applyMotionExpression(
  parsed: ParsedMotionExpression,
  timeSec: number,
  value: number,
): number {
  if (parsed.kind === 'loop') return value;
  return value + parsed.amp * Math.sin(2 * Math.PI * parsed.freq * timeSec);
}

/** CSS / Figma named curves. y may leave 0..1 (back presets overshoot). */
export const MOTION_BEZIER_PRESETS = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  easeIn: { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  easeOut: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  easeInOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  easeInBack: { x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 },
  easeOutBack: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
  easeInOutBack: { x1: 0.68, y1: -0.6, x2: 0.32, y2: 1.6 },
} as const satisfies Record<string, MotionBezier>;

/** Figma spring presets as normalized bounce 0..1. */
export const MOTION_SPRING_PRESETS = {
  gentle: 0.15,
  quick: 0.35,
  bouncy: 0.7,
  slow: 0.2,
} as const;

const curve = (t: number, p1: number, p2: number): number => {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t;
};

/**
 * Unit-interval cubic bezier. `progress` is time along the span (x);
 * the returned value is the eased y (may overshoot 0..1).
 */
export function cubicBezierProgress(progress: number, easing: MotionBezier): number {
  const clamped = Math.max(0, Math.min(1, progress));
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const middle = (low + high) / 2;
    if (curve(middle, easing.x1, easing.x2) < clamped) low = middle;
    else high = middle;
  }
  return curve((low + high) / 2, easing.y1, easing.y2);
}

/**
 * Bounce 0 is cubic ease-out (no overshoot). Bounce 1 is ~3 oscillations whose
 * envelope is ~2% at t=1.
 *
 * Underdamped form: 1 - e^{-d t} cos(ω t), with
 *   d = ln(50) * (1.15 - 0.65 * bounce)
 *   ω = 2π * (0.75 + 2.25 * bounce)
 */
export function springProgress(progress: number, bounce: number): number {
  const t = Math.max(0, Math.min(1, progress));
  const amount = Math.max(0, Math.min(1, bounce));
  if (amount <= 0) {
    const rest = 1 - t;
    return 1 - rest * rest * rest;
  }
  const decay = Math.log(50) * (1.15 - 0.65 * amount);
  const omega = 2 * Math.PI * (0.75 + 2.25 * amount);
  const raw = 1 - Math.exp(-decay * t) * Math.cos(omega * t);
  const end = 1 - Math.exp(-decay) * Math.cos(omega);
  return end === 0 ? raw : raw / end;
}

const KEY_TIME_EPSILON_SEC = 1e-6;

export function sampleNumericTrack(
  keyframes: readonly NumericKeyframe[],
  timeSec: number,
  fallback: number,
): number {
  if (keyframes.length === 0) return fallback;
  const sorted = keyframes
    .filter((keyframe) => Number.isFinite(keyframe.timeSec) && Number.isFinite(keyframe.value))
    .toSorted((left, right) => left.timeSec - right.timeSec);
  if (sorted.length === 0) return fallback;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return fallback;
  const loops = sorted.some((keyframe) => parseMotionExpression(keyframe.expression)?.kind === 'loop');
  const period = last.timeSec - first.timeSec;
  let sampleAt = timeSec;
  if (loops && period > KEY_TIME_EPSILON_SEC && timeSec > first.timeSec) {
    sampleAt = first.timeSec + ((timeSec - first.timeSec) % period);
  }
  let value: number;
  if (sampleAt < first.timeSec - KEY_TIME_EPSILON_SEC) value = fallback;
  else if (sampleAt >= last.timeSec - KEY_TIME_EPSILON_SEC) value = last.value;
  else {
    const rightIndex = sorted.findIndex((keyframe) => keyframe.timeSec > sampleAt);
    if (rightIndex <= 0) value = first.value;
    else {
      const left = sorted[rightIndex - 1];
      const right = sorted[rightIndex];
      if (!left || !right) value = fallback;
      else if (left.interpolation === 'hold') value = right.value;
      else {
        const span = right.timeSec - left.timeSec;
        let progress = span > 0 ? (sampleAt - left.timeSec) / span : 1;
        if (left.interpolation === 'bezier' && left.easing) {
          progress = cubicBezierProgress(progress, left.easing);
        } else if (left.interpolation === 'spring' && left.spring) {
          progress = springProgress(progress, left.spring.bounce);
        }
        value = left.value + (right.value - left.value) * progress;
      }
    }
  }
  for (const keyframe of sorted) {
    const parsed = parseMotionExpression(keyframe.expression);
    if (parsed?.kind === 'wiggle') value = applyMotionExpression(parsed, timeSec, value);
  }
  return value;
}

export type PositionKeyframe = {
  timeSec: number;
  value: { x: number; y: number };
  interpolation: MotionInterpolation;
  easing?: MotionBezier;
  spring?: MotionSpring;
};

export function samplePositionTrack(
  keyframes: readonly PositionKeyframe[],
  timeSec: number,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: sampleNumericTrack(
      keyframes.map((keyframe) => ({ ...keyframe, value: keyframe.value.x })),
      timeSec,
      fallback.x,
    ),
    y: sampleNumericTrack(
      keyframes.map((keyframe) => ({ ...keyframe, value: keyframe.value.y })),
      timeSec,
      fallback.y,
    ),
  };
}

export function positionKeysForProperty(
  keyframes: readonly {
    property: string;
    timeSec: number;
    value: unknown;
    interpolation: MotionInterpolation;
    easing?: MotionBezier;
    spring?: MotionSpring;
  }[],
  property = 'transform.position',
): PositionKeyframe[] {
  const keys: PositionKeyframe[] = [];
  for (const keyframe of keyframes) {
    if (keyframe.property !== property || typeof keyframe.value !== 'object' || !keyframe.value) {
      continue;
    }
    if (
      !('x' in keyframe.value) ||
      !('y' in keyframe.value) ||
      typeof keyframe.value.x !== 'number' ||
      typeof keyframe.value.y !== 'number'
    ) {
      continue;
    }
    keys.push({
      timeSec: keyframe.timeSec,
      value: { x: keyframe.value.x, y: keyframe.value.y },
      interpolation: keyframe.interpolation,
      ...(keyframe.easing ? { easing: keyframe.easing } : {}),
      ...(keyframe.spring ? { spring: keyframe.spring } : {}),
    });
  }
  return keys;
}

export function numericKeysForProperty(
  keyframes: readonly {
    property: string;
    timeSec: number;
    value: unknown;
    interpolation: MotionInterpolation;
    easing?: MotionBezier;
    spring?: MotionSpring;
    expression?: string;
  }[],
  property: string,
): NumericKeyframe[] {
  const keys: NumericKeyframe[] = [];
  for (const keyframe of keyframes) {
    if (keyframe.property !== property || typeof keyframe.value !== 'number') continue;
    keys.push({
      timeSec: keyframe.timeSec,
      value: keyframe.value,
      interpolation: keyframe.interpolation,
      ...(keyframe.easing ? { easing: keyframe.easing } : {}),
      ...(keyframe.spring ? { spring: keyframe.spring } : {}),
      ...(keyframe.expression ? { expression: keyframe.expression } : {}),
    });
  }
  return keys;
}
