// Streaming min/max peaks for the audio stage's waveform. Decoded samples arrive
// in chunks; each chunk is folded into its pixel columns as it lands, so the whole
// file never sits in memory as one PCM buffer.

export type WaveformPeaks = {
  min: Float32Array;
  max: Float32Array;
};

export function createPeaks(columns: number): WaveformPeaks {
  const size = Math.max(0, Math.floor(columns));
  return { min: new Float32Array(size), max: new Float32Array(size) };
}

// Folds one channel of a decoded chunk into the columns spanning [0, spanSec).
// Frames past the span are dropped — that is how the decode ceiling is enforced.
export function addChunkToPeaks(
  peaks: WaveformPeaks,
  channel: Float32Array,
  chunkStartSec: number,
  sampleRate: number,
  spanSec: number,
): void {
  const columns = peaks.min.length;
  if (columns === 0 || spanSec <= 0 || sampleRate <= 0) return;
  const columnsPerSecond = columns / spanSec;
  for (let index = 0; index < channel.length; index += 1) {
    const column = Math.floor((chunkStartSec + index / sampleRate) * columnsPerSecond);
    if (column < 0) continue;
    if (column >= columns) break;
    const amplitude = channel[index] ?? 0;
    if (amplitude < (peaks.min[column] ?? 0)) peaks.min[column] = amplitude;
    if (amplitude > (peaks.max[column] ?? 0)) peaks.max[column] = amplitude;
  }
}
