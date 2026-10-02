import type {
  EditorAudioClip,
  EditorAudioFadeClock,
  EditorCaptionWord,
  EditorVideoClip,
} from './editor-project-v2';
import { motionExpressionAtScale } from './motion-eval';

/** Keep manual fades on their authored clock when retaining part of a clip. */
export function editorClipWithRetainedFades<
  T extends {
    durationSec: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    audioFadeClock?: EditorAudioFadeClock;
  },
>(clip: T, offsetSec = 0): T {
  if (!clip.audioFadeClock && !(clip.fadeInSec || clip.fadeOutSec)) return clip;
  return {
    ...clip,
    audioFadeClock: {
      offsetSec: (clip.audioFadeClock?.offsetSec ?? 0) + offsetSec,
      durationSec: clip.audioFadeClock?.durationSec ?? clip.durationSec,
    },
  };
}

/** A newly authored fade belongs to the current clip, not its retained source window. */
export function editorClipWithLocalFades<T extends EditorVideoClip | EditorAudioClip>(
  clip: T,
  fades: { fadeInSec?: number; fadeOutSec?: number },
): T {
  return {
    ...clip,
    audioFadeClock: undefined,
    ...(clip.fadeInSec !== undefined || fades.fadeInSec !== undefined
      ? { fadeInSec: Math.min(fades.fadeInSec ?? clip.fadeInSec ?? 0, clip.durationSec) }
      : {}),
    ...(clip.fadeOutSec !== undefined || fades.fadeOutSec !== undefined
      ? { fadeOutSec: Math.min(fades.fadeOutSec ?? clip.fadeOutSec ?? 0, clip.durationSec) }
      : {}),
  };
}

/** Linear manual fade at a retained clip's original output time. */
export function editorAudioFadeGainAt(
  clip: {
    durationSec: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    audioFadeClock?: EditorAudioFadeClock;
  },
  localSec: number,
  edge: 'in' | 'out',
): number {
  const fadeSec = edge === 'in' ? clip.fadeInSec : clip.fadeOutSec;
  if (!fadeSec || fadeSec <= 0) return 1;
  const at = localSec + (clip.audioFadeClock?.offsetSec ?? 0);
  const remaining = (clip.audioFadeClock?.durationSec ?? clip.durationSec) - at;
  return Math.max(0, Math.min(1, (edge === 'in' ? at : remaining) / fadeSec));
}

/** Constant speed keeps the same source span and scales clip-local automation with it. */
export function editorClipAtSpeed<T extends EditorVideoClip | EditorAudioClip>(
  clip: T,
  rate: number,
): T {
  if (!Number.isFinite(rate) || rate < 0.05 || rate > 20)
    throw new Error('Speed must be between 0.05 and 20.');
  if (clip.reverse || clip.timeRemap?.length)
    throw new Error('Constant speed cannot edit a reversed or time-remapped clip.');
  const factor = clip.playbackRate / rate;
  const durationSec = clip.durationSec * factor;
  return {
    ...clip,
    playbackRate: rate,
    durationSec,
    ...(clip.keyframeOffsetSec !== undefined
      ? { keyframeOffsetSec: clip.keyframeOffsetSec * factor }
      : {}),
    ...(clip.audioFadeClock
      ? {
          audioFadeClock: {
            offsetSec: clip.audioFadeClock.offsetSec * factor,
            durationSec: clip.audioFadeClock.durationSec * factor,
          },
        }
      : {}),
    keyframes: clip.keyframes.map((keyframe) => ({
      ...keyframe,
      timeSec: keyframe.timeSec * factor,
      ...(keyframe.expression
        ? { expression: motionExpressionAtScale(keyframe.expression, factor) }
        : {}),
    })),
    ...(clip.fadeInSec !== undefined
      ? {
          fadeInSec: Math.min(
            clip.fadeInSec * factor,
            (clip.audioFadeClock?.durationSec ?? clip.durationSec) * factor,
          ),
        }
      : {}),
    ...(clip.fadeOutSec !== undefined
      ? {
          fadeOutSec: Math.min(
            clip.fadeOutSec * factor,
            (clip.audioFadeClock?.durationSec ?? clip.durationSec) * factor,
          ),
        }
      : {}),
    ...(clip.kind === 'audio'
      ? {
          ...(clip.automation
            ? {
                automation: clip.automation.map((point) => ({
                  ...point,
                  timeSec: point.timeSec * factor,
                })),
              }
            : {}),
        }
      : {}),
  };
}

/** A source-start trim advances animation by output seconds; moving the clip does not. */
export function editorClipAtSourceIn<
  T extends {
    sourceInSec?: number;
    playbackRate?: number;
    keyframes?: readonly unknown[];
    durationSec: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    audioFadeClock?: EditorAudioFadeClock;
    keyframeOffsetSec?: number;
    reverse?: boolean;
    timeRemap?: readonly unknown[];
  },
>(clip: T, sourceInSec: number): T {
  if (!Number.isFinite(sourceInSec) || sourceInSec < 0 || sourceInSec > 86_400)
    throw new Error('Source trim must be between zero and 86400 seconds.');
  const offsetSec = (sourceInSec - (clip.sourceInSec ?? 0)) / (clip.playbackRate ?? 1);
  return {
    ...(!clip.reverse && !clip.timeRemap?.length && offsetSec !== 0
      ? editorClipWithRetainedFades(clip, offsetSec)
      : clip),
    sourceInSec,
    ...(clip.keyframes?.length && !clip.reverse && !clip.timeRemap?.length
      ? {
          keyframeOffsetSec:
            (clip.keyframeOffsetSec ?? 0) +
            (sourceInSec - (clip.sourceInSec ?? 0)) / (clip.playbackRate ?? 1),
        }
      : {}),
  };
}

/** Spelling corrections preserve heard word offsets, confidence and emphasis. */
export function editorCaptionWordsWithText(
  words: readonly EditorCaptionWord[],
  text: string,
): EditorCaptionWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length !== words.length)
    throw new Error(
      'A spelling correction must keep the number of timed words; edit explicit word timings to insert or remove words.',
    );
  return words.map((word, index) => ({ ...word, text: tokens[index] }));
}
