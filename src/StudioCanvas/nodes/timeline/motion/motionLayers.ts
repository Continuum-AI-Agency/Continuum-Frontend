import type { EditorClip, EditorKeyframe, EditorProjectV2 } from '@continuum/contracts';

export const MOTION_PROPERTY_ORDER = [
  'transform.position',
  'transform.scaleX',
  'transform.scaleY',
  'transform.rotationDeg',
  'transform.rotateXDeg',
  'transform.rotateYDeg',
  'transform.opacity',
] as const;

export type MotionPropertyName = (typeof MOTION_PROPERTY_ORDER)[number];

export type MotionPropertyRow = {
  property: MotionPropertyName;
  label: string;
  keys: Array<{
    id: string;
    timeSec: number;
    interpolation: EditorKeyframe['interpolation'];
  }>;
};

export type MotionLayerRow = {
  clipId: string;
  trackId: string;
  name: string;
  kind: 'video' | 'overlay' | 'text' | 'nested_sequence';
  startSec: number;
  durationSec: number;
  properties: MotionPropertyRow[];
};

const PROPERTY_LABEL: Record<MotionPropertyName, string> = {
  'transform.position': 'Position',
  'transform.scaleX': 'Scale X',
  'transform.scaleY': 'Scale Y',
  'transform.rotationDeg': 'Rotation',
  'transform.rotateXDeg': 'Rotate X',
  'transform.rotateYDeg': 'Rotate Y',
  'transform.opacity': 'Opacity',
};

const isMotionClip = (
  clip: EditorClip,
): clip is Extract<EditorClip, { kind: 'video' | 'overlay' | 'text' | 'nested_sequence' }> =>
  clip.kind === 'video' ||
  clip.kind === 'overlay' ||
  clip.kind === 'text' ||
  clip.kind === 'nested_sequence';

export function motionLayersFromProject(project: EditorProjectV2): MotionLayerRow[] {
  const layers: MotionLayerRow[] = [];
  for (const track of project.tracks) {
    if (
      track.kind !== 'video' &&
      track.kind !== 'overlay' &&
      track.kind !== 'text' &&
      track.kind !== 'nested_sequence'
    )
      continue;
    for (const clip of track.clips) {
      if (!isMotionClip(clip) || !clip.enabled) continue;
      const keys = 'keyframes' in clip ? clip.keyframes : [];
      layers.push({
        clipId: clip.id,
        trackId: track.id,
        name: clip.name ?? clip.id,
        kind: clip.kind,
        startSec: clip.timelineStartSec,
        durationSec: clip.durationSec,
        properties: MOTION_PROPERTY_ORDER.map((property) => ({
          property,
          label: PROPERTY_LABEL[property],
          keys: keys
            .filter((keyframe) => keyframe.property === property)
            .map((keyframe) => ({
              id: keyframe.id,
              timeSec: keyframe.timeSec,
              interpolation: keyframe.interpolation,
            })),
        })),
      });
    }
  }
  return layers;
}

export function localPlayheadSec(
  layer: Pick<MotionLayerRow, 'startSec' | 'durationSec'>,
  playheadSec: number,
): number {
  return Math.max(0, Math.min(layer.durationSec, playheadSec - layer.startSec));
}

export function currentPropertyValue(
  transform: {
    position: { x: number; y: number };
    scaleX: number;
    scaleY: number;
    rotationDeg: number;
    rotateXDeg?: number;
    rotateYDeg?: number;
    opacity: number;
  },
  property: MotionPropertyName,
): EditorKeyframe['value'] {
  if (property === 'transform.position')
    return { x: transform.position.x, y: transform.position.y };
  if (property === 'transform.scaleX') return transform.scaleX;
  if (property === 'transform.scaleY') return transform.scaleY;
  if (property === 'transform.rotationDeg') return transform.rotationDeg;
  if (property === 'transform.rotateXDeg') return transform.rotateXDeg ?? 0;
  if (property === 'transform.rotateYDeg') return transform.rotateYDeg ?? 0;
  return transform.opacity;
}

export function keyAtPlayhead(
  keys: MotionPropertyRow['keys'],
  localSec: number,
  epsilonSec = 0.05,
): MotionPropertyRow['keys'][number] | undefined {
  return keys.find((key) => Math.abs(key.timeSec - localSec) <= epsilonSec);
}
