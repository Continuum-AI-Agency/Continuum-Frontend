import type { EditorKeyframe, EditorTransform } from './editor-project-v2';
import { MOTION_BEZIER_PRESETS } from './motion-eval';

export const MOTION_STYLE_IDS = ['fade', 'move', 'scale', 'rotate'] as const;
export type MotionStyleId = (typeof MOTION_STYLE_IDS)[number];

export type CompileMotionStyleInput = {
  styleId: MotionStyleId;
  instanceId: string;
  timelineOffsetSec: number;
  durationSec: number;
  base: Pick<EditorTransform, 'position' | 'scaleX' | 'scaleY' | 'rotationDeg' | 'opacity'>;
};

const easeOut = MOTION_BEZIER_PRESETS.easeOut;

const pair = (
  instanceId: string,
  property: EditorKeyframe['property'],
  start: { timeSec: number; value: EditorKeyframe['value'] },
  end: { timeSec: number; value: EditorKeyframe['value'] },
): EditorKeyframe[] => [
  {
    id: `${instanceId}:${property}:in`,
    property,
    timeSec: start.timeSec,
    value: start.value,
    interpolation: 'bezier',
    easing: easeOut,
  },
  {
    id: `${instanceId}:${property}:out`,
    property,
    timeSec: end.timeSec,
    value: end.value,
    interpolation: 'linear',
  },
];

/** Compile a Figma-shaped preset into clip-local keyframes. Manual keys still win on upsert-by-time. */
export function compileMotionStyle(input: CompileMotionStyleInput): EditorKeyframe[] {
  const start = Math.max(0, input.timelineOffsetSec);
  const end = start + Math.max(0.05, input.durationSec);
  const { base, instanceId, styleId } = input;
  switch (styleId) {
    case 'fade':
      return pair(
        instanceId,
        'transform.opacity',
        { timeSec: start, value: 0 },
        { timeSec: end, value: base.opacity },
      );
    case 'move':
      return pair(
        instanceId,
        'transform.position',
        { timeSec: start, value: { x: base.position.x - 0.15, y: base.position.y } },
        { timeSec: end, value: { x: base.position.x, y: base.position.y } },
      );
    case 'scale':
      return [
        ...pair(
          instanceId,
          'transform.scaleX',
          { timeSec: start, value: 0 },
          { timeSec: end, value: base.scaleX },
        ),
        ...pair(
          instanceId,
          'transform.scaleY',
          { timeSec: start, value: 0 },
          { timeSec: end, value: base.scaleY },
        ),
      ];
    case 'rotate':
      return pair(
        instanceId,
        'transform.rotationDeg',
        { timeSec: start, value: 0 },
        { timeSec: end, value: 180 },
      );
  }
}

export function styleInstanceId(keyframeId: string): string | null {
  const split = keyframeId.indexOf(':');
  return split > 0 ? keyframeId.slice(0, split) : null;
}

/** Rescale every key belonging to a compiled style onto a new clip-local span. */
export function trimStyleInstance(
  keyframes: readonly EditorKeyframe[],
  instanceId: string,
  startSec: number,
  endSec: number,
): EditorKeyframe[] {
  const owned = keyframes.filter((keyframe) => styleInstanceId(keyframe.id) === instanceId);
  if (owned.length === 0) return [...keyframes];
  const fromStart = Math.min(...owned.map((keyframe) => keyframe.timeSec));
  const fromEnd = Math.max(...owned.map((keyframe) => keyframe.timeSec));
  const span = Math.max(0.05, fromEnd - fromStart);
  const nextStart = Math.max(0, startSec);
  const nextEnd = Math.max(nextStart + 0.05, endSec);
  const nextSpan = nextEnd - nextStart;
  return keyframes.map((keyframe) => {
    if (styleInstanceId(keyframe.id) !== instanceId) return keyframe;
    const u = (keyframe.timeSec - fromStart) / span;
    return { ...keyframe, timeSec: nextStart + u * nextSpan };
  });
}
