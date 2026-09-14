import type {
  EditorNestedSequenceClip,
  EditorOverlayClip,
  EditorProjectV2,
  EditorTextClip,
} from '@continuum/contracts';
import {
  nestedChildTimeSec,
  parentPositionDelta,
  resolveNestedSequence,
} from '@continuum/contracts';
import type { CSSProperties } from 'react';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import { clipEffectsToCss } from '../../utils/render/effectSpec';
import type { OverlayPreviewLayer } from './overlayPreview';

export function nestedInstanceStyle(
  project: EditorProjectV2,
  clip: EditorNestedSequenceClip,
  playheadSec: number,
): CSSProperties {
  const local = Math.max(0, playheadSec - clip.timelineStartSec);
  const u = clip.durationSec > 0 ? local / clip.durationSec : 0;
  const css = clipEffectsToCss(clipEffectSpecFromEditorClip(clip), u);
  const delta = parentPositionDelta(project, clip.id, playheadSec);
  const parentTranslate =
    delta.x || delta.y ? `translate(${delta.x * 100}%, ${delta.y * 100}%)` : '';
  return {
    ...css,
    transform: [parentTranslate, css.transform].filter(Boolean).join(' ') || undefined,
    transformOrigin: `${clip.transform.anchorX * 100}% ${clip.transform.anchorY * 100}%`,
  };
}

export function nestedChildTimeForClip(
  clip: EditorNestedSequenceClip,
  childDurationSec: number,
  playheadSec: number,
): number | null {
  if (
    playheadSec < clip.timelineStartSec ||
    playheadSec >= clip.timelineStartSec + clip.durationSec
  ) {
    return null;
  }
  return nestedChildTimeSec(clip, childDurationSec, playheadSec);
}

export function flattenNestedOverlayClips(
  project: EditorProjectV2,
  clip: EditorNestedSequenceClip,
): EditorOverlayClip[] {
  const nested = resolveNestedSequence(project, clip);
  if (!nested) return [];
  return nested.tracks.flatMap((track) =>
    track.kind === 'overlay' ? track.clips.filter((child) => child.enabled) : [],
  );
}

export function flattenNestedTextClips(
  project: EditorProjectV2,
  clip: EditorNestedSequenceClip,
): EditorTextClip[] {
  const nested = resolveNestedSequence(project, clip);
  if (!nested) return [];
  return nested.tracks.flatMap((track) =>
    track.kind === 'text' ? track.clips.filter((child) => child.enabled) : [],
  );
}

export type NestedPreviewGroup = {
  id: string;
  style: CSSProperties;
  layers: OverlayPreviewLayer[];
};

export function nestedPreviewGroups(input: {
  project: EditorProjectV2;
  playheadSec: number;
  overlayLayerFor: (clip: EditorOverlayClip, playheadSec: number) => OverlayPreviewLayer | null;
}): NestedPreviewGroup[] {
  const groups: NestedPreviewGroup[] = [];
  for (const track of input.project.tracks) {
    if (track.kind !== 'nested_sequence' || !track.enabled) continue;
    for (const clip of track.clips) {
      if (!clip.enabled) continue;
      const nested = resolveNestedSequence(input.project, clip);
      if (!nested) continue;
      const childT = nestedChildTimeForClip(clip, nested.durationSec, input.playheadSec);
      if (childT === null) continue;
      const layers = flattenNestedOverlayClips(input.project, clip).flatMap((child) => {
        const layer = input.overlayLayerFor(child, childT);
        return layer ? [layer] : [];
      });
      groups.push({
        id: clip.id,
        style: nestedInstanceStyle(input.project, clip, input.playheadSec),
        layers,
      });
    }
  }
  return groups;
}
