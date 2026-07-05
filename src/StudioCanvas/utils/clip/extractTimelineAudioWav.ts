import { speedFor } from '../render/effectSpec';
import { computeOutputPlacements, overlapInSecFor } from '../render/transitions';
import { loadMediabunny } from '../splice/appendRange';
import { decodeClipPcm } from '../splice/audioMix';
import type { TimelineRenderItem } from '../splice/composeTimeline';
import { downmixToMono, encodeWav, floatToInt16, resampleLinear } from './extractAudioWav';

// Extract the Video Editor timeline's spoken audio as a 16 kHz mono WAV in OUTPUT
// time, for Gemini transcription (auto-captions). Each base clip's trimmed audio is
// decoded, downmixed, resampled to 16 kHz (time-compressed by its speed), and mixed
// into a master buffer at the SAME output placement the render uses
// (computeOutputPlacements + overlap), so caption timestamps line up with the burned
// frames. Overlays are ignored (B-roll/PiP); muted clips and stills contribute
// silence so timings stay aligned.

const TARGET_RATE = 16_000;
const DEFAULT_STILL_SEC = 3;

type MediabunnyModule = Awaited<ReturnType<typeof loadMediabunny>>;
type MbInput = InstanceType<MediabunnyModule['Input']>;

type PreparedAudioItem =
  | { kind: 'image'; outputDurationSec: number }
  | {
      kind: 'video';
      input: MbInput;
      startSec: number;
      endSec: number;
      speed: number;
      muteAudio: boolean;
      outputDurationSec: number;
    };

function disposeInput(input: MbInput): void {
  try {
    (input as unknown as { dispose?: () => void }).dispose?.();
  } catch {
    // noop
  }
}

export async function extractTimelineAudioWav(
  items: TimelineRenderItem[],
  signal?: AbortSignal,
): Promise<{ blob: Blob; durationSec: number }> {
  const mb = await loadMediabunny();
  const prepared: PreparedAudioItem[] = [];

  try {
    for (const item of items) {
      if (item.kind === 'image') {
        const durationSec =
          item.durationSec && item.durationSec > 0 ? item.durationSec : DEFAULT_STILL_SEC;
        prepared.push({ kind: 'image', outputDurationSec: durationSec });
        continue;
      }
      const input = new mb.Input({ source: new mb.BlobSource(item.blob), formats: mb.ALL_FORMATS });
      const fullDuration = await input.computeDuration();
      const startSec = Math.max(0, item.trimStartSec ?? 0);
      const endSec =
        item.trimEndSec !== undefined ? Math.min(item.trimEndSec, fullDuration) : fullDuration;
      const speed = speedFor(item.effects);
      prepared.push({
        kind: 'video',
        input,
        startSec,
        endSec,
        speed,
        muteAudio: Boolean(item.muteAudio),
        outputDurationSec: Math.max(0, (endSec - startSec) / speed),
      });
    }

    const { placements, totalSec } = computeOutputPlacements(
      items.map((item, index) => ({
        outputDurationSec: prepared[index].outputDurationSec,
        crossDissolveInSec: overlapInSecFor(item.transition),
      })),
    );

    const totalFrames = Math.max(1, Math.round(totalSec * TARGET_RATE));
    const master = new Float32Array(totalFrames);

    for (let i = 0; i < prepared.length; i += 1) {
      const item = prepared[i];
      if (item.kind !== 'video' || item.muteAudio) continue;
      const decoded = await decodeClipPcm(mb, item.input, item.startSec, item.endSec, signal);
      if (!decoded) continue;
      const mono = downmixToMono(decoded.channels);
      // Resample native rate → 16 kHz, time-compressed by the clip's speed (a target
      // rate of 16000/speed yields output frames spanning the clip's OUTPUT seconds).
      const targetRate = Math.max(1, Math.round(TARGET_RATE / item.speed));
      const resampled = resampleLinear(mono, decoded.sampleRate, targetRate);
      const offset = Math.round(placements[i].outputStartSec * TARGET_RATE);
      for (let j = 0; j < resampled.length; j += 1) {
        const k = offset + j;
        if (k < 0) continue;
        if (k >= totalFrames) break;
        master[k] += resampled[j];
      }
    }

    return { blob: encodeWav(floatToInt16(master), TARGET_RATE), durationSec: totalSec };
  } finally {
    for (const item of prepared) {
      if (item.kind === 'video') disposeInput(item.input);
    }
  }
}
