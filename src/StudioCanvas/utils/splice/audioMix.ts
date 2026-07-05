import { throwIfAborted } from './appendRange';

// PCM mixdown for the Video Editor (timelineEditor) render. The old audio path
// appended each clip's samples inline into one AudioSampleSource, so overlapping
// audio (a cross-dissolve, an overlay's audio, a music bed) could not sum. This
// module decodes every audio-bearing element to a 48 kHz stereo buffer, applies
// per-clip gain + fade envelopes, and SUMS them into one master buffer that is fed
// to the encoder once — the single change that unlocks volume, beds, overlay audio
// and audio crossfades. The pure math (resample/envelope/mix) is unit-tested; the
// decode + drive functions need real WebCodecs and are exercised by the bench.

export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNELS = 2;

// 48 kHz stereo PCM as separate channel planes (what the mixer sums into).
export interface StereoPcm {
  left: Float32Array;
  right: Float32Array;
}

export function silentStereo(frames: number): StereoPcm {
  const n = Math.max(0, Math.floor(frames));
  return { left: new Float32Array(n), right: new Float32Array(n) };
}

function sampleAt(data: Float32Array, index0: number, index1: number, frac: number): number {
  const a = data[index0] ?? 0;
  const b = data[index1] ?? 0;
  return a + (b - a) * frac;
}

/**
 * Linear-resample decoded planar channels to 48 kHz stereo, compressing time by
 * `speed` (a 2× clip yields half the output frames — pitch shifts, since this is a
 * plain resample; pitch-preserving time-stretch is a follow-up). Mono duplicates to
 * both channels; >2 channels keep the first two.
 */
export function resampleToStereo48k(
  channels: Float32Array[],
  srcRate: number,
  speed = 1,
): StereoPcm {
  const srcL = channels[0] ?? new Float32Array(0);
  const srcR = channels[1] ?? srcL;
  const srcFrames = srcL.length;
  const safeRate = srcRate > 0 ? srcRate : AUDIO_SAMPLE_RATE;
  const safeSpeed = speed > 0 ? speed : 1;
  const srcDurationSec = srcFrames / safeRate;
  const outFrames = Math.max(0, Math.round((srcDurationSec / safeSpeed) * AUDIO_SAMPLE_RATE));
  const left = new Float32Array(outFrames);
  const right = new Float32Array(outFrames);
  for (let i = 0; i < outFrames; i += 1) {
    // Output frame i → source time (seconds) → source frame index.
    const srcPos = (i / AUDIO_SAMPLE_RATE) * safeSpeed * safeRate;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const i1 = Math.min(i0 + 1, srcFrames - 1);
    left[i] = sampleAt(srcL, i0, i1, frac);
    right[i] = sampleAt(srcR, i0, i1, frac);
  }
  return { left, right };
}

export interface EnvelopeOptions {
  gain?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

// Apply constant gain plus linear fade-in/out envelopes in place. Overlapping
// clips fade complementarily over a cross-dissolve window, so summation produces a
// constant-power-ish crossfade.
export function applyEnvelope(pcm: StereoPcm, opts: EnvelopeOptions): void {
  const gain = opts.gain ?? 1;
  const n = pcm.left.length;
  if (n === 0) return;
  const fadeIn = Math.min(n, Math.round(Math.max(0, opts.fadeInSec ?? 0) * AUDIO_SAMPLE_RATE));
  const fadeOut = Math.min(n, Math.round(Math.max(0, opts.fadeOutSec ?? 0) * AUDIO_SAMPLE_RATE));
  for (let i = 0; i < n; i += 1) {
    let g = gain;
    if (fadeIn > 0 && i < fadeIn) g *= i / fadeIn;
    if (fadeOut > 0 && i >= n - fadeOut) g *= Math.max(0, n - 1 - i) / fadeOut;
    pcm.left[i] *= g;
    pcm.right[i] *= g;
  }
}

// Sum `src` into `master` starting at `offsetFrames`, clamped to the master bounds.
export function mixInto(master: StereoPcm, src: StereoPcm, offsetFrames: number): void {
  const n = src.left.length;
  const cap = master.left.length;
  const start = Math.round(offsetFrames);
  for (let i = 0; i < n; i += 1) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= cap) break;
    master.left[j] += src.left[i];
    master.right[j] += src.right[i];
  }
}

// Hard-clamp to [-1, 1] so summed peaks don't wrap when re-encoded.
export function clampStereo(pcm: StereoPcm): void {
  const n = pcm.left.length;
  for (let i = 0; i < n; i += 1) {
    const l = pcm.left[i];
    const r = pcm.right[i];
    pcm.left[i] = l > 1 ? 1 : l < -1 ? -1 : l;
    pcm.right[i] = r > 1 ? 1 : r < -1 ? -1 : r;
  }
}

// Interleave-free planar layout AudioSample expects for f32-planar: the L block
// followed by the R block.
export function stereoToPlanar(pcm: StereoPcm, start = 0, count = pcm.left.length): Float32Array {
  const n = Math.max(0, Math.min(count, pcm.left.length - start));
  const out = new Float32Array(n * 2);
  out.set(pcm.left.subarray(start, start + n), 0);
  out.set(pcm.right.subarray(start, start + n), n);
  return out;
}

// ---------------------------------------------------------------------------
// Impure: decode + mix + feed (need real WebCodecs; exercised by the bench).
// ---------------------------------------------------------------------------

type MediabunnyModule = typeof import('mediabunny');
type MbInput = InstanceType<MediabunnyModule['Input']>;
type MbAudioSampleSource = InstanceType<MediabunnyModule['AudioSampleSource']>;

// One audio-bearing element on the output timeline: a base clip, an overlay, or a
// music-bed item. Stills contribute nothing (the master stays silent under them).
export interface AudioPlanItem {
  input: MbInput;
  sourceStartSec: number;
  sourceEndSec: number;
  speed: number;
  outputStartSec: number;
  gain: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export async function decodeClipPcm(
  mb: MediabunnyModule,
  input: MbInput,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
): Promise<{ channels: Float32Array[]; sampleRate: number } | null> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) return null;
  const sink = new mb.AudioSampleSink(track);
  const chunks: Float32Array[][] = [];
  let sampleRate = AUDIO_SAMPLE_RATE;
  let channelCount = AUDIO_CHANNELS;
  for await (const sample of sink.samples(startSec, endSec)) {
    throwIfAborted(signal);
    sampleRate = sample.sampleRate;
    channelCount = Math.max(1, sample.numberOfChannels);
    const frames = sample.numberOfFrames;
    const perChannel: Float32Array[] = [];
    for (let c = 0; c < channelCount; c += 1) {
      const dest = new Float32Array(frames);
      sample.copyTo(dest, { planeIndex: c, format: 'f32-planar' });
      perChannel.push(dest);
    }
    chunks.push(perChannel);
    sample.close();
  }
  if (chunks.length === 0) return null;
  const total = chunks.reduce((sum, chunk) => sum + (chunk[0]?.length ?? 0), 0);
  const channels: Float32Array[] = Array.from(
    { length: channelCount },
    () => new Float32Array(total),
  );
  let offset = 0;
  for (const chunk of chunks) {
    const frames = chunk[0]?.length ?? 0;
    for (let c = 0; c < channelCount; c += 1)
      channels[c].set(chunk[c] ?? new Float32Array(frames), offset);
    offset += frames;
  }
  return { channels, sampleRate };
}

// Decode every planned element, resample + envelope each, and sum into one master
// 48 kHz stereo buffer covering the whole output.
export async function mixdownTimelineAudio(
  mb: MediabunnyModule,
  plan: AudioPlanItem[],
  totalDurationSec: number,
  signal?: AbortSignal,
): Promise<StereoPcm> {
  const master = silentStereo(Math.round(Math.max(0, totalDurationSec) * AUDIO_SAMPLE_RATE));
  for (const item of plan) {
    const decoded = await decodeClipPcm(
      mb,
      item.input,
      item.sourceStartSec,
      item.sourceEndSec,
      signal,
    );
    if (!decoded) continue;
    const pcm = resampleToStereo48k(decoded.channels, decoded.sampleRate, item.speed);
    applyEnvelope(pcm, { gain: item.gain, fadeInSec: item.fadeInSec, fadeOutSec: item.fadeOutSec });
    mixInto(master, pcm, item.outputStartSec * AUDIO_SAMPLE_RATE);
  }
  clampStereo(master);
  return master;
}

const FEED_CHUNK_SEC = 0.5;

// Feed the mixed master buffer to the encoder as ~0.5 s AudioSamples.
export async function feedMixdown(
  mb: MediabunnyModule,
  audioSource: MbAudioSampleSource,
  master: StereoPcm,
  signal?: AbortSignal,
): Promise<void> {
  const chunkFrames = Math.round(FEED_CHUNK_SEC * AUDIO_SAMPLE_RATE);
  const total = master.left.length;
  if (total === 0) return;
  let offset = 0;
  while (offset < total) {
    throwIfAborted(signal);
    const frames = Math.min(chunkFrames, total - offset);
    const sample = new mb.AudioSample({
      data: stereoToPlanar(master, offset, frames),
      format: 'f32-planar',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: AUDIO_CHANNELS,
      timestamp: offset / AUDIO_SAMPLE_RATE,
    });
    await audioSource.add(sample);
    sample.close();
    offset += frames;
  }
}
