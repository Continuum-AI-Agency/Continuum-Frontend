import { captionTranscribeResponseSchema } from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { loadCaptionFonts } from '@/lib/clips/captionFonts';
import { applyCaptionPreset, resolveCaptionPreset } from '@/lib/clips/captionPresets';
import { cleanupCaptionAudio, uploadCaptionAudio } from '@/lib/clips/clipClientCut';
import { useStudioStore } from '../../stores/useStudioStore';
import type { NodeOutput } from '../../types/execution';
import { runSingleSourceSpliceInWorker } from '../../workers/spliceWorkerClient';
import { extractAudioWav } from '../clip/extractAudioWav';
import { applyEmphasisIndices, groupWordsIntoCues } from '../splice/captionCues';

// The `video.subtitles` action: transcribe a clip, choose which words shout, and burn
// word-synced captions into the bytes.
//
// This op is declared `execution: 'worker'` in the frozen action registry — and it is, for
// the part that re-encodes — but it ORCHESTRATES on the main thread, which is why it does
// not live in `utils/splice/actionEngines.ts` with the other video ops. It needs an
// authenticated network round trip (upload the audio, call the backend), and a Web Worker
// has neither the Supabase session nor a reason to grow one. So: prepare here, render there.

export type SubtitlesActionArgs = {
  inputs: { handle: string; blob?: Blob }[];
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
};

/** Test seam. Every one of these crosses a boundary we do not want in a unit test. */
export type SubtitlesOpDeps = {
  extractAudio?: typeof extractAudioWav;
  uploadAudio?: typeof uploadCaptionAudio;
  cleanupAudio?: typeof cleanupCaptionAudio;
  splice?: typeof runSingleSourceSpliceInWorker;
  loadFonts?: typeof loadCaptionFonts;
  getToken?: typeof getBrowserAccessToken;
  fetchImpl?: typeof fetch;
  resolveBrandId?: () => string | undefined;
};

/**
 * The whole source, whatever its length.
 *
 * spliceSingleSource clamps every range to the probed duration
 * (`Math.min(r.endSec, fullDuration)`), so this asks for everything without a second decode
 * pass just to learn how long the clip is.
 */
const WHOLE_SOURCE = [{ startSec: 0, endSec: Number.POSITIVE_INFINITY }];

export async function runSubtitlesAction(
  args: SubtitlesActionArgs,
  config: Record<string, unknown>,
  deps: SubtitlesOpDeps = {},
): Promise<NodeOutput> {
  const blob = args.inputs.find((input) => input.handle === 'in')?.blob;
  if (!blob) throw new Error('Connect a clip to the subtitles action first');

  const brandId = (deps.resolveBrandId ?? (() => useStudioStore.getState().brandId))();
  if (!brandId) throw new Error('Select a brand before running subtitles');

  const preset = resolveCaptionPreset(
    typeof config.preset === 'string' ? config.preset : undefined,
  );
  const captionStyle = applyCaptionPreset(preset);

  const extractAudio = deps.extractAudio ?? extractAudioWav;
  const uploadAudio = deps.uploadAudio ?? uploadCaptionAudio;
  const cleanupAudio = deps.cleanupAudio ?? cleanupCaptionAudio;
  const splice = deps.splice ?? runSingleSourceSpliceInWorker;
  const loadFonts = deps.loadFonts ?? loadCaptionFonts;
  const getToken = deps.getToken ?? getBrowserAccessToken;
  const fetchImpl = deps.fetchImpl ?? fetch;

  args.onProgress?.(0.02);
  const wav = await extractAudio(blob, { signal: args.signal });

  // `sourceAssetId` is ignored for target:'audio' — clip-asset builds the path as
  // buildAudioStoragePath(brandId, crypto.randomUUID()) — but the schema requires a
  // non-empty string, so name the op rather than invent a fake uuid.
  const uploaded = await uploadAudio({
    brandId,
    sourceAssetId: 'video.subtitles',
    audioBlob: wav,
  });
  args.onProgress?.(0.1);

  try {
    const token = await getToken();
    const response = await fetchImpl(`${getApiBaseUrl()}/api/clips/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        brandId,
        audioBucket: uploaded.audioBucket,
        audioStoragePath: uploaded.audioStoragePath,
        emphasize: config.emphasize !== false,
      }),
      signal: args.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Transcription failed (${response.status})`);
    }
    const transcript = captionTranscribeResponseSchema.parse(await response.json());
    if (transcript.words.length === 0) {
      throw new Error('No speech was detected in this clip, so there is nothing to caption');
    }
    args.onProgress?.(0.35);

    // The preset's grouping is applied HERE, on the main thread, and the finished cues cross
    // to the worker. Sending raw words instead would let the worker re-group them at the
    // engine default and every preset would come out with the same line lengths.
    const words = applyEmphasisIndices(
      transcript.words.map((word) => ({
        text: word.text,
        startSec: word.startSec,
        endSec: word.endSec,
      })),
      transcript.emphasisIndices,
    );
    const captionCues = groupWordsIntoCues(words, preset.grouping);

    const result = await splice({
      blob,
      ranges: WHOLE_SOURCE,
      captionCues,
      captionStyle,
      // Without the bytes the worker's OffscreenCanvas silently renders Helvetica, and
      // every preset looks the same.
      captionFonts: await loadFonts(preset.fontFamily ? [preset.fontFamily] : []),
      signal: args.signal,
      onProgress: ({ progress }) => args.onProgress?.(0.35 + progress * 0.65),
    });

    return { type: 'video', url: result.objectUrl, sizeBytes: result.blob.size };
  } finally {
    // The WAV is a temporary on a shared store; a failed render must not leave it behind.
    await cleanupAudio({ brandId, ...uploaded }).catch(() => undefined);
  }
}
