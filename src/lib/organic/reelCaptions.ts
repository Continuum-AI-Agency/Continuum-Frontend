import { type ClipWord, captionTranscribeResponseSchema } from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { cleanupCaptionAudio, uploadCaptionAudio } from '@/lib/clips/clipClientCut';
import { extractTimelineAudioWav } from '@/StudioCanvas/utils/clip/extractTimelineAudioWav';
import type { TimelineWorkerItem } from '@/StudioCanvas/workers/spliceWorkerProtocol';

type ReelCaptionDependencies = {
  extractAudio?: typeof extractTimelineAudioWav;
  uploadAudio?: typeof uploadCaptionAudio;
  cleanupAudio?: typeof cleanupCaptionAudio;
  fetcher?: typeof fetch;
  getAccessToken?: typeof getBrowserAccessToken;
};

export async function transcribeReelTimeline(
  params: {
    brandId: string;
    sourceAssetId: string;
    items: TimelineWorkerItem[];
    signal?: AbortSignal;
    onStage?: (label: string) => void;
  },
  dependencies: ReelCaptionDependencies = {},
): Promise<ClipWord[]> {
  const extractAudio = dependencies.extractAudio ?? extractTimelineAudioWav;
  const uploadAudio = dependencies.uploadAudio ?? uploadCaptionAudio;
  const cleanupAudio = dependencies.cleanupAudio ?? cleanupCaptionAudio;
  const fetcher = dependencies.fetcher ?? fetch;
  const getAccessToken = dependencies.getAccessToken ?? getBrowserAccessToken;

  params.onStage?.('Extracting speech…');
  const { blob } = await extractAudio(params.items, params.signal);
  const temporaryAudio = await uploadAudio({
    brandId: params.brandId,
    sourceAssetId: params.sourceAssetId,
    audioBlob: blob,
  });

  try {
    params.onStage?.('Transcribing captions…');
    const token = await getAccessToken();
    const response = await fetcher(`${getApiBaseUrl()}/api/clips/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        brandId: params.brandId,
        audioBucket: temporaryAudio.audioBucket,
        audioStoragePath: temporaryAudio.audioStoragePath,
      }),
      signal: params.signal,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Transcription failed (${response.status}).`);
    }
    const transcript = captionTranscribeResponseSchema.parse(await response.json());
    if (transcript.words.length === 0) {
      throw new Error('No speech was detected in the generated UGC clips.');
    }
    return transcript.words;
  } finally {
    await cleanupAudio({
      brandId: params.brandId,
      audioBucket: temporaryAudio.audioBucket,
      audioStoragePath: temporaryAudio.audioStoragePath,
    }).catch(() => undefined);
  }
}
