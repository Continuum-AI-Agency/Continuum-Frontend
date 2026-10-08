import {
  type EditorAudioClip,
  type EditorAudioFadeClock,
  type EditorKeyframe,
  type EditorProjectV2,
  type EditorTrack,
  type EditorVideoClip,
  editorClipAtSourceIn,
  editorClipAtSpeed,
  editorClipWithRetainedFades,
  type NumericKeyframe,
  resolveNestedSequence,
  sampleNumericTrack,
} from '@continuum/contracts';

export interface TimelineAudioEnvelopeInput {
  gain?: number;
  audioFadeClock?: EditorAudioFadeClock;
  manualFadeInSec?: number;
  manualFadeOutSec?: number;
  transitionFadeInSec?: number;
  transitionFadeOutSec?: number;
}

export interface TimelineAudioEnvelope {
  gain: number;
  audioFadeClock?: EditorAudioFadeClock;
  transitionFadeInSec?: number;
  transitionFadeOutSec?: number;
  fadeInSec: number;
  fadeOutSec: number;
}

/**
 * Canonical audio-envelope projection shared by interactive preview and export.
 * Transition fades and author-authored fades are not additive: the longer ramp
 * wins when they share an origin. Retained manual fades keep their original clock;
 * transition ramps stay on the current clip clock.
 */
export function resolveTimelineAudioEnvelope(
  input: TimelineAudioEnvelopeInput,
): TimelineAudioEnvelope {
  return {
    gain:
      typeof input.gain === 'number' && Number.isFinite(input.gain) ? Math.max(0, input.gain) : 1,
    fadeInSec: Math.max(
      0,
      input.manualFadeInSec ?? 0,
      input.audioFadeClock ? 0 : (input.transitionFadeInSec ?? 0),
    ),
    fadeOutSec: Math.max(
      0,
      input.manualFadeOutSec ?? 0,
      input.audioFadeClock ? 0 : (input.transitionFadeOutSec ?? 0),
    ),
    ...(input.audioFadeClock
      ? {
          audioFadeClock: input.audioFadeClock,
          transitionFadeInSec: Math.max(0, input.transitionFadeInSec ?? 0),
          transitionFadeOutSec: Math.max(0, input.transitionFadeOutSec ?? 0),
        }
      : {}),
  };
}

/** A clip's `audio.volume` keyframes as the numeric track the mixers sample (clip-local
 *  seconds; the value is the clip's gain at that time). */
export function volumeKeyframesOf(keyframes: readonly EditorKeyframe[]): NumericKeyframe[] {
  return keyframes.flatMap((keyframe) =>
    keyframe.property === 'audio.volume' && typeof keyframe.value === 'number'
      ? [
          {
            timeSec: keyframe.timeSec,
            value: keyframe.value,
            interpolation: keyframe.interpolation,
            ...(keyframe.expression ? { expression: keyframe.expression } : {}),
            ...(keyframe.easing ? { easing: keyframe.easing } : {}),
            ...(keyframe.spring ? { spring: { bounce: keyframe.spring.bounce } } : {}),
          },
        ]
      : [],
  );
}

/** Primary video, audio and nested tracks carry sound; secondary videos are visual layers. */
export function editorAudioTracks(project: Pick<EditorProjectV2, 'tracks'>): EditorTrack[] {
  const primary = project.tracks
    .filter((track) => track.kind === 'video' && track.enabled)
    .toSorted((left, right) => left.order - right.order)[0];
  const tracks = project.tracks.filter(
    (track) =>
      track.enabled &&
      !track.muted &&
      (track.id === primary?.id || track.kind === 'audio' || track.kind === 'nested_sequence'),
  );
  return tracks.some((track) => track.solo) ? tracks.filter((track) => track.solo) : tracks;
}

/** Resolve audible source spans without retiming, so unsupported playback cannot break the editor view. */
export function nestedAudioSources(project: EditorProjectV2) {
  return editorAudioTracks(project).flatMap((track) => {
    if (track.kind !== 'nested_sequence') return [];
    return track.clips.flatMap((instance) => {
      if (!instance.enabled || !instance.audioEnabled) return [];
      const nested = resolveNestedSequence(project, instance);
      if (!nested) return [];
      return editorAudioTracks(nested).flatMap((childTrack) => {
        const children: Array<EditorVideoClip | EditorAudioClip> =
          childTrack.kind === 'video' || childTrack.kind === 'audio' ? childTrack.clips : [];
        return children.flatMap((child) => {
          if (!child.enabled || (child.kind === 'video' ? !child.audioEnabled : child.muted))
            return [];
          const start = Math.max(child.timelineStartSec, instance.sourceInSec);
          const end = Math.min(
            child.timelineStartSec + child.durationSec,
            instance.sourceInSec + instance.durationSec * instance.playbackRate,
            nested.durationSec,
          );
          if (end <= start) return [];
          return [{ instance, child, start, end }];
        });
      });
    });
  });
}

/** Audible child slices keep their source identity while each instance owns its output clock. */
export function nestedAudioClips(project: EditorProjectV2) {
  return nestedAudioSources(project).map(({ instance, child, start, end }) => {
    const sourceStartSec =
      child.sourceInSec + (start - child.timelineStartSec) * child.playbackRate;
    const sliced = editorClipAtSourceIn(editorClipWithRetainedFades(child), sourceStartSec);
    // Scale output clocks by the instance rate; the independent source rate may compose beyond clip limits.
    const clock = editorClipAtSpeed(
      { ...sliced, durationSec: end - start, playbackRate: 1 },
      instance.playbackRate,
    );
    const outputStartSec =
      instance.timelineStartSec + (start - instance.sourceInSec) / instance.playbackRate;
    return {
      id: `${instance.id}:${child.id}`,
      sourceClipId: child.id,
      clock,
      outputStartSec,
      sourceStartSec,
      sourceEndSec: sourceStartSec + (end - start) * child.playbackRate,
      playbackRate: child.playbackRate * instance.playbackRate,
      groupVolumeKeyframes: volumeKeyframesOf(instance.keyframes),
      groupKeyframeOffsetSec:
        (instance.keyframeOffsetSec ?? 0) + outputStartSec - instance.timelineStartSec,
    };
  });
}

/** Child and host gain curves are independent multiplying stages. */
export function audioGainAt(
  input: {
    gain?: number;
    volumeKeyframes?: readonly NumericKeyframe[];
    keyframeOffsetSec?: number;
    groupVolumeKeyframes?: readonly NumericKeyframe[];
    groupKeyframeOffsetSec?: number;
  },
  localSec: number,
): number {
  const child = input.volumeKeyframes?.length
    ? sampleNumericTrack(input.volumeKeyframes, localSec, input.gain ?? 1, input.keyframeOffsetSec)
    : (input.gain ?? 1);
  const group = input.groupVolumeKeyframes?.length
    ? sampleNumericTrack(input.groupVolumeKeyframes, localSec, 1, input.groupKeyframeOffsetSec)
    : 1;
  return Math.max(0, child) * Math.max(0, group);
}
