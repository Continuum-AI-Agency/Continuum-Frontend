import type {
  EditorCaptionClip,
  EditorNestedSequenceClip,
  EditorOverlayClip,
  EditorProjectV2,
  EditorTextClip,
  EditorVideoClip,
} from '@continuum/contracts';
import { nestedChildTimeSec, resolveNestedSequence } from '@continuum/contracts';
import type { CSSProperties } from 'react';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import { clipEffectsToCss } from '../../utils/render/effectSpec';
import { computeLetterboxRect } from '../../utils/splice/letterbox';
import { viewProjectForSequence } from './editorProjectV2AssemblyModel';
import type { OverlayPreviewLayer } from './overlayPreview';

export function nestedInstanceStyle(
  project: EditorProjectV2,
  clip: EditorNestedSequenceClip,
  playheadSec: number,
): CSSProperties {
  const local = Math.max(0, playheadSec - clip.timelineStartSec);
  const u = clip.durationSec > 0 ? local / clip.durationSec : 0;
  const css = clipEffectsToCss(clipEffectSpecFromEditorClip(clip, project), u);
  return {
    ...css,
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
    track.kind === 'overlay' && track.enabled && !track.muted
      ? track.clips.filter((child) => child.enabled)
      : [],
  );
}

export function flattenNestedTextClips(
  project: EditorProjectV2,
  clip: EditorNestedSequenceClip,
): EditorTextClip[] {
  const nested = resolveNestedSequence(project, clip);
  if (!nested) return [];
  return nested.tracks.flatMap((track) =>
    track.kind === 'text' && track.enabled && !track.muted
      ? track.clips.filter((child) => child.enabled)
      : [],
  );
}

export type NestedPreviewGroup = {
  id: string;
  style: CSSProperties;
  layers: OverlayPreviewLayer[];
  frameStyle: CSSProperties;
  project: EditorProjectV2;
  childTimeSec: number;
  textClips: Array<EditorTextClip | EditorCaptionClip>;
};

export function nestedPreviewGroups(input: {
  project: EditorProjectV2;
  playheadSec: number;
  overlayLayerFor: (
    clip: EditorOverlayClip | EditorVideoClip,
    playheadSec: number,
    project: EditorProjectV2,
  ) => OverlayPreviewLayer | null;
}): NestedPreviewGroup[] {
  const groups: NestedPreviewGroup[] = [];
  for (const track of input.project.tracks) {
    if (track.kind !== 'nested_sequence' || !track.enabled) continue;
    for (const clip of track.clips) {
      if (!clip.enabled) continue;
      const nested = resolveNestedSequence(input.project, clip);
      if (!nested || nested.tracks.some((childTrack) => childTrack.kind === 'nested_sequence'))
        continue;
      const childT = nestedChildTimeForClip(clip, nested.durationSec, input.playheadSec);
      if (childT === null) continue;
      const childProject = viewProjectForSequence(input.project, nested.id);
      const visible = nested.tracks
        .filter((track) => track.enabled && (track.kind === 'video' || !track.muted))
        .toSorted((left, right) => left.order - right.order);
      const playbackRateScale = clip.playbackRate;
      const layers = visible
        .flatMap((track) =>
          track.kind === 'overlay' || track.kind === 'video'
            ? track.clips.filter((child) => child.enabled)
            : [],
        )
        .flatMap((child) => {
          const layer = input.overlayLayerFor(child, childT, childProject);
          return layer ? [{ ...layer, playbackRate: layer.playbackRate * playbackRateScale }] : [];
        });
      const rect = computeLetterboxRect(
        nested.canvas.width,
        nested.canvas.height,
        input.project.canvas.width,
        input.project.canvas.height,
      );
      groups.push({
        id: clip.id,
        style: nestedInstanceStyle(input.project, clip, input.playheadSec),
        layers,
        project: childProject,
        childTimeSec: childT,
        textClips: visible.flatMap((track) =>
          track.kind === 'text' || track.kind === 'caption'
            ? track.clips.filter((child) => child.enabled)
            : [],
        ),
        frameStyle: {
          left: `${(rect.x / input.project.canvas.width) * 100}%`,
          top: `${(rect.y / input.project.canvas.height) * 100}%`,
          width: `${(rect.width / input.project.canvas.width) * 100}%`,
          height: `${(rect.height / input.project.canvas.height) * 100}%`,
          containerType: 'size',
        },
      });
    }
  }
  return groups;
}
