import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, decodeClipPcm } from './audioMix';

type MediabunnyModule = typeof import('mediabunny');

/** Match a nonperiodic calibration signal, rather than guessing a platform's AAC delay. */
export function encoderDelayFrames(reference: Float32Array, decoded: Float32Array): number {
  const start = 1_536;
  const count = 2_048;
  // ponytail: search up to 171ms at 48kHz; lengthen the probe for encoders exceeding that delay.
  const maximum = Math.min(8_192, decoded.length - start - count);
  let referenceEnergy = 0;
  for (let i = 0; i < count; i++) referenceEnergy += (reference[start + i] ?? 0) ** 2;
  let best = -1;
  let score = 0;
  for (let delay = 0; delay <= maximum; delay++) {
    let product = 0;
    let energy = 0;
    for (let i = 0; i < count; i++) {
      const value = decoded[start + delay + i];
      product += reference[start + i] * value;
      energy += value * value;
    }
    const correlation = product / Math.sqrt(referenceEnergy * energy);
    if (correlation > score) {
      score = correlation;
      best = delay;
    }
  }
  if (best < 0 || score < 0.9) throw new Error('Could not calibrate AAC encoder timing.');
  return best;
}

async function measureDelay(mb: MediabunnyModule, bitrate: number): Promise<number> {
  const frames = AUDIO_SAMPLE_RATE / 4;
  const reference = new Float32Array(frames);
  const data = new Float32Array(frames * AUDIO_CHANNELS);
  for (let i = 0; i < frames; i++) {
    const t = i / AUDIO_SAMPLE_RATE;
    reference[i] = 0.3 * Math.sin(2 * Math.PI * (400 * t + 8_000 * t * t));
  }
  for (let c = 0; c < AUDIO_CHANNELS; c++) data.set(reference, c * frames);
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const source = new mb.AudioSampleSource({
    codec: 'aac',
    bitrate,
    transform: { numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_SAMPLE_RATE },
  });
  output.addAudioTrack(source);
  let finalized = false;
  try {
    await output.start();
    const sample = new mb.AudioSample({
      data,
      format: 'f32-planar',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: AUDIO_CHANNELS,
      timestamp: 0,
    });
    try {
      await source.add(sample);
    } finally {
      sample.close();
    }
    await output.finalize();
    finalized = true;
    if (!output.target.buffer) throw new Error('AAC calibration produced no output.');
    const input = new mb.Input({
      source: new mb.BufferSource(output.target.buffer),
      formats: mb.ALL_FORMATS,
    });
    try {
      const decoded = await decodeClipPcm(mb, input, 0, 1);
      if (!decoded || decoded.sampleRate !== AUDIO_SAMPLE_RATE)
        throw new Error('AAC calibration returned no matching audio.');
      return encoderDelayFrames(reference, decoded.channels[0]) / AUDIO_SAMPLE_RATE;
    } finally {
      input.dispose();
    }
  } finally {
    if (!finalized) await output.cancel().catch(() => undefined);
  }
}

// Keep only the last configuration: normal exports reuse one bitrate without an unbounded cache.
let cached: { bitrate: number; delay: Promise<number> } | undefined;

export function aacEncoderDelaySec(mb: MediabunnyModule, bitrate: number): Promise<number> {
  if (cached?.bitrate === bitrate) return cached.delay;
  const delay = measureDelay(mb, bitrate);
  cached = { bitrate, delay };
  void delay.catch(() => {
    if (cached?.delay === delay) cached = undefined;
  });
  return delay;
}

export async function calibratedAacConfig(
  mb: MediabunnyModule,
  bitrate: number,
): Promise<import('mediabunny').AudioEncodingConfig> {
  const delay = await aacEncoderDelaySec(mb, bitrate);
  return {
    codec: 'aac',
    bitrate,
    transform: {
      numberOfChannels: AUDIO_CHANNELS,
      sampleRate: AUDIO_SAMPLE_RATE,
      // Negative presentation timestamps make the MP4 edit list trim measured priming.
      process: (sample) => {
        sample.setTimestamp(sample.timestamp - delay);
        return sample;
      },
    },
  };
}
