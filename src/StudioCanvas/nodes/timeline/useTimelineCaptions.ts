import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useStudioStore } from '../../stores/useStudioStore';
import type { StudioNode, TimelineEditorNodeData, TimelineItem } from '../../types';
import type { NodeOutput } from '../../types/execution';
import { extractTimelineAudioWav } from '../../utils/clip/extractTimelineAudioWav';
import { resolveTimelineSources } from '../../utils/splice/resolveClipSources';
import { captionSegmentsToWords } from './captionSegments';

// Auto-captions for the Video Editor: extract the timeline's spoken audio (Mediabunny,
// output-time WAV), send it to the transcribe-audio-gemini edge function (Gemini 3.1
// Flash-Lite), split the returned segments into karaoke words, and store them on the
// node so the render burns them in and the preview shows them. No separate STT/TTS.

const TRANSCRIBE_FN = 'transcribe-audio-gemini';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export interface UseTimelineCaptionsResult {
  generate: () => Promise<boolean>;
  isGenerating: boolean;
  setCaptionsEnabled: (enabled: boolean) => void;
}

export function useTimelineCaptions(nodeId: string): UseTimelineCaptionsResult {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const { show } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const setCaptionsEnabled = useCallback(
    (enabled: boolean) => {
      updateNode(nodeId, (current) => ({
        ...current,
        data: { ...(current.data as TimelineEditorNodeData), captionsEnabled: enabled },
      }));
      triggerSave();
    },
    [nodeId, triggerSave, updateNode],
  );

  const generate = useCallback(async (): Promise<boolean> => {
    const state = useStudioStore.getState();
    const nodes = state.nodes as StudioNode[];
    const edges = state.edges;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const items = ((node?.data as TimelineEditorNodeData | undefined)?.items ??
      []) as TimelineItem[];
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
      const resolvedOutputs = new Map<string, NodeOutput>();
      const resolved = await resolveTimelineSources(items, edges, nodes, resolvedOutputs, nodeId);
      const { blob, durationSec } = await extractTimelineAudioWav(resolved);
      const audioBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));

      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        show({
          title: 'Sign in required',
          description: 'Auto-captions need an authenticated session.',
          variant: 'warning',
        });
        return false;
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${TRANSCRIBE_FN}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey:
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
              '',
          },
          body: JSON.stringify({ audioBase64, mimeType: 'audio/wav', durationSec }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Transcription failed (${res.status}).`);
      }
      const payload = (await res.json()) as {
        segments?: { startSec: number; endSec: number; text: string }[];
      };
      const words = captionSegmentsToWords(payload.segments ?? []);
      if (words.length === 0) {
        show({
          title: 'No speech detected',
          description: 'No captions were generated from the timeline audio.',
          variant: 'info',
        });
        return false;
      }

      updateNode(nodeId, (current) => {
        const data = current.data as TimelineEditorNodeData;
        return {
          ...current,
          data: {
            ...data,
            captionWords: words,
            captionsEnabled: true,
            captionStyle: data.captionStyle ?? DEFAULT_CAPTION_STYLE,
            committed: false,
          },
        };
      });
      triggerSave();
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
  }, [nodeId, show, triggerSave, updateNode]);

  return { generate, isGenerating, setCaptionsEnabled };
}
