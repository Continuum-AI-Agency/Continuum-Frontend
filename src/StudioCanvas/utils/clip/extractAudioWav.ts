import { loadMediabunny } from '@/StudioCanvas/utils/splice/appendRange';

// Extract a 16 kHz mono LINEAR16 WAV from a source video Blob (mediabunny audio
// decode → downmix → linear resample → int16 → 44-byte WAV header). This is what
// clip-transcribe (Google STT v2) ingests. The decode/IO entry point composes the
// pure, unit-tested helpers below.

const TARGET_SAMPLE_RATE = 16_000;

export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels.length; c += 1) sum += channels[c][i] ?? 0;
    mono[i] = sum / channels.length;
  }
  return mono;
}

export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function resampleLinear(input: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate || input.length === 0) return input;
  const ratio = targetRate / inputRate;
  const outLength = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return out;
}

export function encodeWav(pcm: Int16Array, sampleRate: number): Blob {
  const channels = 1;
  const bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(offset, pcm[i], true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function extractAudioWav(blob: Blob): Promise<Blob> {
  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) {
      throw new Error('Source video has no audio track to transcribe');
    }

    const sink = new mb.AudioSampleSink(audioTrack);
    const monoChunks: Float32Array[] = [];
    let sourceSampleRate = 0;

    for await (const sample of sink.samples()) {
      sourceSampleRate = sample.sampleRate || sourceSampleRate;
      const channels: Float32Array[] = [];
      for (let c = 0; c < sample.numberOfChannels; c += 1) {
        const channelData = new Float32Array(sample.numberOfFrames);
        sample.copyTo(channelData, { planeIndex: c, format: 'f32-planar' });
        channels.push(channelData);
      }
      monoChunks.push(downmixToMono(channels));
      sample.close();
    }

    if (sourceSampleRate === 0 || monoChunks.length === 0) {
      throw new Error('No audio samples decoded from source video');
    }

    const mono = concatFloat32(monoChunks);
    const resampled = resampleLinear(mono, sourceSampleRate, TARGET_SAMPLE_RATE);
    return encodeWav(floatToInt16(resampled), TARGET_SAMPLE_RATE);
  } finally {
    try {
      (input as unknown as { dispose?: () => void }).dispose?.();
    } catch {
      // noop
    }
  }
}
