import type { EditorAudioClip, EditorCaptionWord, EditorVideoClip } from './editor-project-v2';
import { motionExpressionAtScale } from './motion-eval';

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
    keyframes: clip.keyframes.map((keyframe) => ({
      ...keyframe,
      timeSec: keyframe.timeSec * factor,
      ...(keyframe.expression
        ? { expression: motionExpressionAtScale(keyframe.expression, factor) }
        : {}),
    })),
    ...(clip.fadeInSec !== undefined
      ? { fadeInSec: Math.min(clip.fadeInSec * factor, durationSec) }
      : {}),
    ...(clip.fadeOutSec !== undefined
      ? { fadeOutSec: Math.min(clip.fadeOutSec * factor, durationSec) }
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
    keyframeOffsetSec?: number;
    reverse?: boolean;
    timeRemap?: readonly unknown[];
  },
>(clip: T, sourceInSec: number): T {
  if (!Number.isFinite(sourceInSec) || sourceInSec < 0 || sourceInSec > 86_400)
    throw new Error('Source trim must be between zero and 86400 seconds.');
  return {
    ...clip,
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
