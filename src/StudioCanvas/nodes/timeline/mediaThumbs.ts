// Filmstrip thumbnails + audio waveforms for timeline clips (Wave 2 UX). Decodes
// media via mediabunny (CanvasSink frames, AudioBufferSink samples) and caches
// thumbnails by URL and waveforms by retained source range. Audio decodes only
// that range, without retaining a whole PCM recording. The decode needs WebCodecs
// and runs on the main thread lazily (dynamic import keeps it out of the bundle).

const thumbCache = new Map<string, Promise<string[]>>();
// ponytail: session window cache; cap entries if long edit sessions show measurable growth.
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

/** Accumulate only samples inside the retained source interval; gaps stay silent. */
export function addWaveformChunk(
  peaks: number[],
  channel: Float32Array,
  sampleRate: number,
  timestamp: number,
  startSec: number,
  endSec: number,
): void {
  if (sampleRate <= 0 || !Number.isFinite(sampleRate) || endSec <= startSec) return;
  const start = Math.max(0, Math.ceil((startSec - timestamp) * sampleRate - 1e-6));
  const end = Math.min(channel.length, Math.ceil((endSec - timestamp) * sampleRate - 1e-6));
  for (let i = start; i < end; i++) {
    const bucket = Math.floor(
      ((timestamp + i / sampleRate - startSec) / (endSec - startSec)) * peaks.length,
    );
    if (bucket >= 0 && bucket < peaks.length)
      peaks[bucket] = Math.max(peaks[bucket]!, Math.min(1, Math.abs(channel[i]!)));
  }
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
  const response = await fetch(url, { cache: 'force-cache' });
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

async function decodeWaveform(
  url: string,
  buckets: number,
  startSec: number,
  endSec?: number,
): Promise<number[]> {
  if (
    !Number.isInteger(buckets) ||
    buckets <= 0 ||
    !Number.isFinite(startSec) ||
    startSec < 0 ||
    (endSec !== undefined && (!Number.isFinite(endSec) || endSec <= startSec))
  )
    return [];
  const mb = await loadMediabunny();
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) return [];
  const blob = await response.blob();
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return [];
    const sink = new mb.AudioBufferSink(track);
    const end = endSec ?? (await input.computeDuration());
    if (end <= startSec) return [];
    const peaks = new Array<number>(buckets).fill(0);
    // AAC needs the previous packet's overlap state even when peaks start inside this packet.
    const packets = new mb.EncodedPacketSink(track);
    const first = await packets.getPacket(startSec, { metadataOnly: true });
    const previous = first
      ? await packets.getPacket(first.timestamp - 1 / (await track.getTimeResolution()), {
          metadataOnly: true,
        })
      : null;
    for await (const wrapped of sink.buffers(previous?.timestamp ?? startSec, end)) {
      addWaveformChunk(
        peaks,
        wrapped.buffer.getChannelData(0),
        wrapped.buffer.sampleRate,
        wrapped.timestamp,
        startSec,
        end,
      );
    }
    return peaks;
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

export function getWaveform(
  url: string,
  buckets = 60,
  startSec = 0,
  endSec?: number,
  reverse = false,
): Promise<number[]> {
  const key = JSON.stringify([url, buckets, startSec, endSec, reverse]);
  let promise = waveCache.get(key);
  if (!promise) {
    promise = decodeWaveform(url, buckets, startSec, endSec)
      .then((peaks) => (reverse ? peaks.reverse() : peaks))
      .catch(() => []);
    waveCache.set(key, promise);
  }
  return promise;
}
