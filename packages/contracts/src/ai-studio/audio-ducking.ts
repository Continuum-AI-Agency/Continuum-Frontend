// Ducking as data: a music bed dips under speech through `audio.volume` keyframes on its
// clip, so the Backend op that writes them, the workspace that previews them and the
// compositor that mixes them read the same numbers. Nothing here knows how speech was found.

import type { EditorKeyframe } from './editor-project-v2';

export type SpeechRange = { startSec: number; endSec: number };

export const DUCKING = {
  /** Gain under speech as a share of the clip's own volume (0.25 ≈ −12 dB). */
  duckTo: 0.25,
  /** How long the bed takes to dip before a line, and to recover after it. */
  attackSec: 0.15,
  releaseSec: 0.35,
} as const;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** Speech on the timeline as few ranges: overlapping or close lines join, so the bed does not
 *  pump up and down between words. */
export function mergeSpeech(ranges: readonly SpeechRange[], joinGapSec: number): SpeechRange[] {
  const sorted = [...ranges]
    .filter((range) => range.endSec > range.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const merged: SpeechRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.startSec - last.endSec <= joinGapSec) {
      last.endSec = Math.max(last.endSec, range.endSec);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * The `audio.volume` keyframes that duck one audio clip under speech. `speech` is in timeline
 * seconds; keyframes come back clip-local, linear, at the clip's own volume outside speech
 * and `duckTo` × that volume under it. Callers replace the clip's `audio.volume` keyframes
 * with these. An empty result means no speech falls under the clip.
 */
export function duckingKeyframes(input: {
  clipStartSec: number;
  clipDurationSec: number;
  volume: number;
  speech: readonly SpeechRange[];
  idPrefix: string;
  duckTo?: number;
  attackSec?: number;
  releaseSec?: number;
}): EditorKeyframe[] {
  const attack = input.attackSec ?? DUCKING.attackSec;
  const release = input.releaseSec ?? DUCKING.releaseSec;
  const low = input.volume * (input.duckTo ?? DUCKING.duckTo);
  const end = input.clipDurationSec;
  const local = mergeSpeech(input.speech, attack + release)
    .map((range) => ({
      startSec: range.startSec - input.clipStartSec,
      endSec: range.endSec - input.clipStartSec,
    }))
    .filter((range) => range.endSec > 0 && range.startSec < end);
  const stops: { timeSec: number; value: number }[] = [];
  const add = (timeSec: number, value: number) => {
    const at = round6(Math.min(end, Math.max(0, timeSec)));
    const previous = stops.at(-1);
    if (previous && at <= previous.timeSec) {
      previous.value = Math.min(previous.value, value);
      return;
    }
    stops.push({ timeSec: at, value: round6(value) });
  };
  for (const range of local) {
    add(range.startSec - attack, input.volume);
    add(range.startSec, low);
    add(range.endSec, low);
    add(range.endSec + release, input.volume);
  }
  return stops.map((stop, index) => ({
    id: `${input.idPrefix}-${index}`,
    property: 'audio.volume',
    timeSec: stop.timeSec,
    value: stop.value,
    interpolation: 'linear',
  }));
}
