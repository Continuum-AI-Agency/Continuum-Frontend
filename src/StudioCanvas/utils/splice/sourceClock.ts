import {
  type EditorClipTiming,
  type EditorTimeRemapPoint,
  editorClipSourceAt,
} from '@continuum/contracts';

// The source clock of a retimed video clip: which second of the source file shows at a given
// moment of the clip, for a reversed clip or one on a time-remap curve (a speed ramp, a freeze).
// Plain forward playback never builds one — it keeps the original range-and-speed path — so a
// clip with no retime renders byte-for-byte as before.
//
// The fields are plain data because they ride the worker boundary; the renderer, the overlap
// compositor and the audio mixer all rebuild the same `EditorClipTiming` from them and ask the
// contract's `editorClipSourceAt`, so picture and sound cannot disagree about a frame.

/** The retime fields a render item carries beside its trim range. */
export type ItemRetime = {
  reverse?: boolean;
  /** Clip-local output time -> ABSOLUTE source seconds; wins over `reverse` and speed. */
  timeRemap?: readonly EditorTimeRemapPoint[];
};

/** Fallback cadence for a retimed clip rendered with no frame rate. */
export const RETIME_FALLBACK_FPS = 30;

export const isRetimed = (retime: ItemRetime | undefined): boolean =>
  Boolean(retime?.reverse || retime?.timeRemap?.length);

/**
 * The clip's source clock, or undefined when it plays plain forward. `outputDurationSec` is the
 * clip's length on the timeline; `speed` only matters for a reverse with no curve.
 */
export function retimedClock(
  retime: ItemRetime | undefined,
  range: { startSec: number },
  outputDurationSec: number,
  speed: number,
): EditorClipTiming | undefined {
  if (!retime || !isRetimed(retime)) return undefined;
  return {
    durationSec: outputDurationSec,
    sourceInSec: range.startSec,
    playbackRate: speed,
    reverse: Boolean(retime.reverse) && !retime.timeRemap?.length,
    ...(retime.timeRemap?.length ? { timeRemap: retime.timeRemap } : {}),
  };
}

/**
 * The source second to decode for clip-local output time `localSec`, kept inside the file's
 * decodable range: asking a decoder for the instant a stream ends yields no frame.
 */
export function sourceSecAt(
  clock: EditorClipTiming,
  localSec: number,
  range: { startSec: number; endSec: number },
): number {
  const sec = editorClipSourceAt(clock, localSec);
  return Math.min(Math.max(sec, range.startSec), Math.max(range.startSec, range.endSec - 0.001));
}

type TimestampSink<F> = { canvasesAtTimestamps(times: number[]): AsyncIterable<F | null> };

/** Output frames of a single chunk when the source runs backwards or jumps around. */
const SCATTER_CHUNK = 12;

/**
 * One decoded frame per requested source time, in request order. A forward-running clip (a
 * slow-motion ramp, a freeze) streams its distinct times once, so every packet is decoded once.
 * A reversed or jumping one decodes `SCATTER_CHUNK` frames at a time in ascending order and
 * hands them back in request order, so a reverse costs a short run of decoding per chunk
 * rather than a keyframe seek per frame, and never holds more than a chunk in memory.
 */
export async function* framesAtSourceTimes<F>(
  sink: TimestampSink<F>,
  times: number[],
): AsyncGenerator<F | null> {
  const ascending = times.every((time, index) => index === 0 || time >= times[index - 1]);
  const batches = ascending
    ? [times]
    : Array.from({ length: Math.ceil(times.length / SCATTER_CHUNK) }, (_, index) =>
        times.slice(index * SCATTER_CHUNK, (index + 1) * SCATTER_CHUNK),
      );
  for (const batch of batches) {
    const unique = [...new Set(batch)].sort((a, b) => a - b);
    const repeats = new Map<number, number>();
    for (const time of batch) repeats.set(time, (repeats.get(time) ?? 0) + 1);
    if (ascending) {
      let index = 0;
      for await (const frame of sink.canvasesAtTimestamps(unique))
        for (let n = repeats.get(unique[index++]) ?? 1; n > 0; n -= 1) yield frame;
      continue;
    }
    const decoded = new Map<number, F | null>();
    let index = 0;
    for await (const frame of sink.canvasesAtTimestamps(unique))
      decoded.set(unique[index++], frame);
    for (const time of batch) yield decoded.get(time) ?? null;
  }
}
