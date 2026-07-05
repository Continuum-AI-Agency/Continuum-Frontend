// Filmstrip thumbnails + audio waveforms for timeline clips (Wave 2 UX). Decodes
// a source once via mediabunny (CanvasSink frames, AudioBufferSink samples) and
// caches the result by URL so a source placed several times (split, reuse) is
// decoded once. The peak math is pure + unit-tested; the decode needs WebCodecs
// and runs on the main thread lazily (dynamic import keeps it out of the bundle).

const thumbCache = new Map<string, Promise<string[]>>();
const waveCache = new Map<string, Promise<number[]>>();

async function loadMediabunny() {
  return import('mediabunny');
}

// Downsample a channel to `buckets` normalized peak values (max |amplitude| per
// bucket, clamped 0..1) — the waveform silhouette.
export function computePeaks(channel: Float32Array, buckets: number): number[] {
  const length = channel.length;
  if (length === 0 || buckets <= 0) return [];
  const peaks = new Array<number>(buckets).fill(0);
  const perBucket = length / buckets;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor(bucket * perBucket);
    const end = Math.min(length, Math.floor((bucket + 1) * perBucket));
    let max = 0;
    for (let i = start; i < end; i += 1) {
      const amplitude = Math.abs(channel[i]);
      if (amplitude > max) max = amplitude;
    }
    peaks[bucket] = max > 1 ? 1 : max;
  }
  return peaks;
}

const THUMB_HEIGHT = 64;

function downscaleToDataUrl(source: HTMLCanvasElement | OffscreenCanvas): string {
  const aspect = source.width > 0 ? source.width / source.height : 16 / 9;
  const height = THUMB_HEIGHT;
  const width = Math.max(1, Math.round(height * aspect));
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, width, height);
  return scratch.toDataURL('image/jpeg', 0.6);
}

async function decodeThumbnails(url: string, count: number): Promise<string[]> {
  const mb = await loadMediabunny();
  const response = await fetch(url);
  if (!response.ok) return [];
  const blob = await response.blob();
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const duration = await input.computeDuration();
    const sink = new mb.CanvasSink(track);
    const timestamps = Array.from({ length: count }, (_, i) => (duration * (i + 0.5)) / count);
    const frames: string[] = [];
    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      frames.push(wrapped ? downscaleToDataUrl(wrapped.canvas) : '');
    }
    return frames;
  } finally {
    (input as unknown as { dispose?: () => void }).dispose?.();
  }
}

async function decodeWaveform(url: string, buckets: number): Promise<number[]> {
  const mb = await loadMediabunny();
  const response = await fetch(url);
  if (!response.ok) return [];
  const blob = await response.blob();
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return [];
    const sink = new mb.AudioBufferSink(track);
    const chunks: Float32Array[] = [];
    let total = 0;
    for await (const wrapped of sink.buffers()) {
      const data = wrapped.buffer.getChannelData(0);
      chunks.push(data.slice());
      total += data.length;
    }
    if (total === 0) return [];
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return computePeaks(merged, buckets);
  } finally {
    (input as unknown as { dispose?: () => void }).dispose?.();
  }
}

// Cached, deduped accessors. A failed decode caches an empty result so it is not
// retried in a tight render loop.
export function getThumbnails(url: string, count = 6): Promise<string[]> {
  const key = `${url}|${count}`;
  let promise = thumbCache.get(key);
  if (!promise) {
    promise = decodeThumbnails(url, count).catch(() => []);
    thumbCache.set(key, promise);
  }
  return promise;
}

export function getWaveform(url: string, buckets = 60): Promise<number[]> {
  const key = `${url}|${buckets}`;
  let promise = waveCache.get(key);
  if (!promise) {
    promise = decodeWaveform(url, buckets).catch(() => []);
    waveCache.set(key, promise);
  }
  return promise;
}
