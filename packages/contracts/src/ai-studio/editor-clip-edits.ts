import type {
  EditorAudioClip,
  EditorAudioFadeClock,
  EditorCaptionWord,
  EditorNestedSequenceClip,
  EditorTextClip,
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

/** Keep title entrances and exits on their authored clock through a range cut. */
export function editorTextWithRetainedAnimation<T extends EditorTextClip>(
  clip: T,
  offsetSec = 0,
): T {
  if (!clip.textAnimationClock && !clip.animationIn && !clip.animationOut) return clip;
  return {
    ...clip,
    textAnimationClock: {
      offsetSec: (clip.textAnimationClock?.offsetSec ?? 0) + offsetSec,
      durationSec: clip.textAnimationClock?.durationSec ?? clip.durationSec,
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
export function editorClipAtSpeed<
  T extends EditorVideoClip | EditorAudioClip | EditorNestedSequenceClip,
>(clip: T, rate: number): T {
  if (!Number.isFinite(rate) || rate < 0.05 || rate > 20)
    throw new Error('Speed must be between 0.05 and 20.');
  const media: EditorVideoClip | EditorAudioClip | undefined =
    clip.kind === 'video' || clip.kind === 'audio' ? clip : undefined;
  if (media?.timeRemap?.length)
    throw new Error(
      'Constant speed cannot edit a speed-ramped or frozen clip; undo the ramp or freeze first.',
    );
  const factor = clip.playbackRate / rate;
  const durationSec = clip.durationSec * factor;
  return {
    ...clip,
    playbackRate: rate,
    durationSec,
    ...(clip.keyframeOffsetSec !== undefined
      ? { keyframeOffsetSec: clip.keyframeOffsetSec * factor }
      : {}),
    ...(media?.audioFadeClock
      ? {
          audioFadeClock: {
            offsetSec: media.audioFadeClock.offsetSec * factor,
            durationSec: media.audioFadeClock.durationSec * factor,
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
    ...(media?.fadeInSec !== undefined
      ? {
          fadeInSec: Math.min(
            media.fadeInSec * factor,
            (media.audioFadeClock?.durationSec ?? clip.durationSec) * factor,
          ),
        }
      : {}),
    ...(media?.fadeOutSec !== undefined
      ? {
          fadeOutSec: Math.min(
            media.fadeOutSec * factor,
            (media.audioFadeClock?.durationSec ?? clip.durationSec) * factor,
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

// ── Source clock: where in the source file a clip is at a given moment ──────────────────────

/** The fields of a video or audio clip that decide which source frame shows when. */
export type EditorClipTiming = {
  durationSec: number;
  sourceInSec?: number;
  playbackRate?: number;
  reverse?: boolean;
  timeRemap?: readonly {
    timeSec: number;
    sourceSec: number;
    interpolation?: 'hold' | 'linear' | 'bezier';
  }[];
};
type RemapPoint = NonNullable<EditorClipTiming['timeRemap']>[number];

const REMAP_EPSILON = 1e-6;

/** The index of the segment of `points` that holds output time `t` (never the last point). */
const remapSegment = (points: readonly RemapPoint[], t: number): number => {
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].timeSec <= t) low = mid;
    else high = mid;
  }
  return low;
};

/** The ABSOLUTE source second a remap curve shows at clip-local output time `t`. */
export function editorTimeRemapSourceAt(points: readonly RemapPoint[], t: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (t <= first.timeSec) return first.sourceSec;
  if (t >= last.timeSec) return last.sourceSec;
  const a = points[remapSegment(points, t)];
  const b = points[remapSegment(points, t) + 1];
  if (a.interpolation === 'hold') return a.sourceSec;
  const u = (t - a.timeSec) / (b.timeSec - a.timeSec);
  const k = a.interpolation === 'bezier' ? u * u * (3 - 2 * u) : u;
  return a.sourceSec + (b.sourceSec - a.sourceSec) * k;
}

/** Source seconds per output second (signed: negative plays backwards) of a remap curve at `t`. */
export function editorTimeRemapRateAt(points: readonly RemapPoint[], t: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || t < first.timeSec || t > last.timeSec) return 0;
  const index = Math.min(remapSegment(points, t), points.length - 2);
  const a = points[index];
  const b = points[index + 1];
  if (a.interpolation === 'hold') return 0;
  const slope = (b.sourceSec - a.sourceSec) / (b.timeSec - a.timeSec);
  if (a.interpolation !== 'bezier') return slope;
  const u = (t - a.timeSec) / (b.timeSec - a.timeSec);
  return slope * 6 * u * (1 - u);
}

/** True when a clip's source clock is not plain forward playback at one constant rate. */
export const editorClipIsRetimed = (clip: Pick<EditorClipTiming, 'reverse' | 'timeRemap'>) =>
  Boolean(clip.reverse || clip.timeRemap?.length);

/**
 * The ABSOLUTE source second a clip shows at clip-local output time `localSec`. One answer for
 * the three ways a clip can run — constant `playbackRate`, `reverse`, and a `timeRemap` curve —
 * so the renderer, the preview and the ops never each re-derive it.
 */
export function editorClipSourceAt(clip: EditorClipTiming, localSec: number): number {
  if (clip.timeRemap?.length) return editorTimeRemapSourceAt(clip.timeRemap, localSec);
  const t = Math.min(Math.max(localSec, 0), clip.durationSec);
  return (
    (clip.sourceInSec ?? 0) + (clip.reverse ? clip.durationSec - t : t) * (clip.playbackRate ?? 1)
  );
}

/** Signed source seconds per output second at `localSec` (0 on a freeze, negative reversed). */
export function editorClipRateAt(clip: EditorClipTiming, localSec: number): number {
  if (clip.timeRemap?.length) return editorTimeRemapRateAt(clip.timeRemap, localSec);
  return (clip.reverse ? -1 : 1) * (clip.playbackRate ?? 1);
}

/** The source seconds a clip reaches: the lowest and the highest it ever shows. */
export function editorClipSourceSpan(clip: EditorClipTiming): { startSec: number; endSec: number } {
  if (clip.timeRemap?.length) {
    const seconds = clip.timeRemap.map((point) => point.sourceSec);
    return { startSec: Math.min(...seconds), endSec: Math.max(...seconds) };
  }
  const startSec = clip.sourceInSec ?? 0;
  return { startSec, endSec: startSec + clip.durationSec * (clip.playbackRate ?? 1) };
}

/** Samples laid inside a remap segment that a window cuts through the middle of. */
const REMAP_PARTIAL_SAMPLES = 6;

/**
 * The part of a clip between clip-local output seconds `fromSec` and `toSec`, as that clip's
 * own timing fields (duration, source-in, reverse, remap curve) re-based so it starts at 0.
 * Split and trim use it, so a reversed or ramped clip keeps showing exactly the frames it did.
 * A smoothstep segment cut mid-way becomes a few linear samples of the true curve.
 */
export function editorClipWindow<T extends EditorClipTiming>(
  clip: T,
  fromSec: number,
  toSec: number,
): T {
  const from = Math.max(0, fromSec);
  const to = Math.min(clip.durationSec, toSec);
  if (!(to > from + REMAP_EPSILON)) throw new Error('A clip window must lie inside the clip.');
  const durationSec = to - from;
  const rate = clip.playbackRate ?? 1;
  if (!clip.timeRemap?.length) {
    return {
      ...clip,
      durationSec,
      sourceInSec: (clip.sourceInSec ?? 0) + (clip.reverse ? clip.durationSec - to : from) * rate,
    };
  }
  const points = clip.timeRemap;
  const knots = [
    from,
    ...points
      .map((point) => point.timeSec)
      .filter((t) => t > from + REMAP_EPSILON && t < to - REMAP_EPSILON),
    to,
  ];
  const out: RemapPoint[] = [];
  for (let index = 0; index < knots.length - 1; index += 1) {
    const a = knots[index];
    const b = knots[index + 1];
    const segment = remapSegment(points, a + REMAP_EPSILON);
    const interpolation = points[segment].interpolation ?? 'linear';
    const cutThrough =
      interpolation === 'bezier' &&
      (a > points[segment].timeSec + REMAP_EPSILON ||
        b < points[segment + 1].timeSec - REMAP_EPSILON);
    const steps = cutThrough ? REMAP_PARTIAL_SAMPLES : 1;
    for (let step = 0; step < steps; step += 1) {
      const t = a + ((b - a) * step) / steps;
      out.push({
        timeSec: t - from,
        sourceSec: editorTimeRemapSourceAt(points, t),
        interpolation: cutThrough ? 'linear' : interpolation,
      });
    }
  }
  out.push({
    timeSec: durationSec,
    sourceSec: editorTimeRemapSourceAt(points, to),
    interpolation: 'linear',
  });
  out[0] = { ...out[0], timeSec: 0 };
  return {
    ...clip,
    durationSec,
    sourceInSec: Math.min(...out.map((point) => point.sourceSec)),
    timeRemap: out,
  };
}
