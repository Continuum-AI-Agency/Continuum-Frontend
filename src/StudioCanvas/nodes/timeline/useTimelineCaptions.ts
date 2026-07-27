import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import { uploadCaptionAudio } from '@/lib/clips/clipClientCut';
import { extractTimelineAudioWav } from '../../utils/clip/extractTimelineAudioWav';
import { groupWordsIntoCues } from '../../utils/splice/captionCues';
import type { TimelineInputSource, TimelineItem } from '../../types';
import type { TimelineEditorAdapter } from './adapter';

// Auto-captions extract the output-time timeline audio, upload the WAV through the
// existing scoped media path, then use the Backend's Google STT v2 bridge. The
// returned word offsets become editable caption cues.

export interface UseTimelineCaptionsResult {
  generate: () => Promise<boolean>;
  isGenerating: boolean;
  setCaptionsEnabled: (enabled: boolean) => void;
}

export function resolveCaptionSourceAssetId(
  scope: TimelineEditorAdapter['scope'],
  items: TimelineItem[],
  pool: TimelineInputSource[],
): string | undefined {
  for (const item of items) {
    const source = pool.find((candidate) => candidate.nodeId === item.sourceNodeId);
    if (!source) continue;
    if (source.sourceAssetId) return source.sourceAssetId;
    if (scope === 'library') return source.nodeId;
  }
  return undefined;
}

export function useTimelineCaptions(adapter: TimelineEditorAdapter): UseTimelineCaptionsResult {
  const { getDocument, patchDocument, resolveSources } = adapter;
  const { show } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const setCaptionsEnabled = useCallback(
    (enabled: boolean) => {
      patchDocument((document) => ({ ...document, captionsEnabled: enabled }));
    },
    [patchDocument],
  );

  const generate = useCallback(async (): Promise<boolean> => {
    const items = getDocument().items;
    if (items.length === 0) {
      show({
        title: 'Nothing to caption',
        description: 'Place at least one clip first.',
        variant: 'warning',
      });
      return false;
    }

    setIsGenerating(true);
    try {
      const resolved = await resolveSources(items);
      const { blob } = await extractTimelineAudioWav(resolved);
      const sourceAssetId = resolveCaptionSourceAssetId(adapter.scope, items, adapter.pool);
      if (!adapter.brandId || !sourceAssetId) {
        show({
          title: 'Captions need a saved video',
          description:
            'Save or attach at least one timeline source to the Library before generating captions.',
          variant: 'warning',
        });
        return false;
      }
      const { audioBucket, audioStoragePath } = await uploadCaptionAudio({
        brandId: adapter.brandId,
        sourceAssetId,
        audioBlob: blob,
      });
      const token = await getBrowserAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/clips/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ brandId: adapter.brandId, audioBucket, audioStoragePath }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Transcription failed (${res.status}).`);
      }
      const payload = (await res.json()) as {
        words?: { text: string; startSec: number; endSec: number }[];
      };
      const words = payload.words ?? [];
      if (words.length === 0) {
        show({
          title: 'No speech detected',
          description: 'No captions were generated from the timeline audio.',
          variant: 'info',
        });
        return false;
      }

      patchDocument((document) => ({
        ...document,
        captionCues: groupWordsIntoCues(words),
        captionWords: undefined,
        captionsEnabled: true,
        captionStyle: document.captionStyle ?? DEFAULT_CAPTION_STYLE,
      }));
      show({
        title: 'Captions added',
        description: `${words.length} words transcribed.`,
        variant: 'success',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-captions failed';
      show({ title: 'Auto-captions failed', description: message, variant: 'warning' });
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [
    adapter.brandId,
    adapter.pool,
    adapter.scope,
    getDocument,
    patchDocument,
    resolveSources,
    show,
  ]);

  return { generate, isGenerating, setCaptionsEnabled };
}
