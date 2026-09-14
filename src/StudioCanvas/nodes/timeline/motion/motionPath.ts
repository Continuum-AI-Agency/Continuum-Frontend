import {
  type EditorKeyframe,
  numericKeysForProperty,
  positionKeysForProperty,
  sampleNumericTrack,
  samplePositionTrack,
} from '@continuum/contracts';

export function motionPathPoints(
  clip: {
    durationSec: number;
    transform: { position: { x: number; y: number } };
    keyframes: EditorKeyframe[];
  },
  samples = 24,
): Array<{ x: number; y: number }> {
  const keys = positionKeysForProperty(clip.keyframes);
  if (keys.length < 2 || clip.durationSec <= 0) return [];
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index <= samples; index += 1) {
    const timeSec = (index / samples) * clip.durationSec;
    points.push(samplePositionTrack(keys, timeSec, clip.transform.position));
  }
  return points;
}

export function sampledOpacity(
  clip: {
    durationSec: number;
    transform: { opacity: number };
    keyframes: EditorKeyframe[];
  },
  localSec: number,
): number {
  return sampleNumericTrack(
    numericKeysForProperty(clip.keyframes, 'transform.opacity'),
    localSec,
    clip.transform.opacity,
  );
}
