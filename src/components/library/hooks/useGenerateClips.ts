'use client';

import {
  clipGenerationFrameSchema,
  type MediaAsset,
  type ViralityGrade,
} from '@continuum/contracts';
import { useTranslations as useUiTranslations } from 'next-intl';
import * as React from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import { cutAndPersistSection, extractAndUploadAudio } from '@/lib/clips/clipClientCut';
import { type ClipQuality, DEFAULT_CLIP_QUALITY } from '@/lib/clips/clipQuality';
import { parseNdjson } from '@/lib/streaming/parseNdjson';
import { checkSpliceSupport } from '@/StudioCanvas/utils/splice/webcodecsSupport';

export type ClipSectionStatus = 'pending' | 'active' | 'done' | 'error';
export type ClipSectionProgress = {
  index: number;
  title: string;
  status: ClipSectionStatus;
  viralityOverall?: number | null;
  viralityGrade?: ViralityGrade | null;
};
export type ClipGenerationProgress = {
  sourceAssetId: string;
  stageLabel: string | null;
  sections: ClipSectionProgress[];
  done: boolean;
};

export type GenerateClipsOptions = {
  quality?: ClipQuality;
  captionsEnabled?: boolean;
  captionStyle?: CaptionStyle;
};

export type UseGenerateClipsResult = {
  generate: (asset: MediaAsset, options?: GenerateClipsOptions) => Promise<void>;
  isGenerating: boolean;
  progress: ClipGenerationProgress | null;
  dismiss: () => void;
};

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued…',
  transcribing: 'Transcribing…',
  sectioning: 'Finding sections…',
  planning: 'Planning cuts…',
  cutting: 'Cutting…',
  persisting: 'Saving…',
};

const isAbort = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

// Library-local clip generation: download the source video once (reused for audio
// extraction + cutting), stream the backend plan over NDJSON, then cut + persist
// each section in the browser. Progress drives a per-card strip; nothing touches
// the organic calendar store.
export function useGenerateClips(): UseGenerateClipsResult {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

  const { show } = useToast();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [progress, setProgress] = React.useState<ClipGenerationProgress | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const generate = React.useCallback(
    async (asset: MediaAsset, options: GenerateClipsOptions = {}) => {
      const quality = options.quality ?? DEFAULT_CLIP_QUALITY;
      const captionsEnabled = options.captionsEnabled ?? false;
      const captionStyle = options.captionStyle;
      if (asset.kind !== 'video') return;
      if (!asset.signedUrl) {
        show({
          title: translateUi('can_t_generate_clips_6bee0f77'),
          description: translateUi('this_video_isn_t_ready_yet_afcd56ea'),
          variant: 'error',
        });
        return;
      }

      // Cutting happens in the browser (WebCodecs/mediabunny). Bail before any work
      // on a browser that can't render.
      const support = await checkSpliceSupport();
      if (!support.ok) {
        show({
          title: translateUi('can_t_generate_clips_here_80bb709c'),
          description: translateUi('value0_try_chrome_or_edge_on_deskto_bda3d80b', {
            value0: String(support.reason),
          }),
          variant: 'error',
        });
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsGenerating(true);
      setProgress({ sourceAssetId: asset.id, stageLabel: 'Preparing…', sections: [], done: false });

      const forThisAsset = (p: ClipGenerationProgress | null): p is ClipGenerationProgress =>
        Boolean(p && p.sourceAssetId === asset.id);
      const setStage = (label: string | null) =>
        setProgress((p) => (forThisAsset(p) ? { ...p, stageLabel: label } : p));
      const setSection = (index: number, status: ClipSectionStatus) =>
        setProgress((p) =>
          forThisAsset(p)
            ? { ...p, sections: p.sections.map((s) => (s.index === index ? { ...s, status } : s)) }
            : p,
        );

      try {
        const sourceBlob = await fetch(asset.signedUrl, { signal: controller.signal }).then((r) => {
          if (!r.ok) throw new Error(`Could not download the source video (${r.status})`);
          return r.blob();
        });

        setStage('Extracting audio…');
        const { audioBucket, audioStoragePath } = await extractAndUploadAudio({
          brandId: asset.brandId,
          sourceAssetId: asset.id,
          sourceBlob,
          signal: controller.signal,
        });

        const token = await getBrowserAccessToken();
        const response = await fetch(`${getApiBaseUrl()}/api/clips/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            brandId: asset.brandId,
            sourceAssetId: asset.id,
            audioBucket,
            audioStoragePath,
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          show({
            title: translateUi('clip_generation_failed_7d56011b'),
            description: translateUi('could_not_start_clip_generation_1355d132'),
            variant: 'error',
          });
          setProgress(null);
          return;
        }

        for await (const raw of parseNdjson(response.body)) {
          const parsed = clipGenerationFrameSchema.safeParse(raw);
          if (!parsed.success) continue;
          const frame = parsed.data;

          if (frame.type === 'job_started') {
            setStage('Transcribing…');
          } else if (frame.type === 'stage') {
            setStage(STAGE_LABELS[frame.stage] ?? 'Working…');
          } else if (frame.type === 'job_failed') {
            throw new Error(frame.error);
          } else if (frame.type === 'clip_plan_ready') {
            const sections = frame.plan.sections;
            setProgress((p) =>
              forThisAsset(p)
                ? {
                    ...p,
                    stageLabel: null,
                    sections: sections.map((s) => ({
                      index: s.index,
                      title: s.title,
                      status: 'pending' as const,
                      viralityOverall: frame.scores?.[s.index]?.virality?.overall ?? null,
                      viralityGrade: frame.scores?.[s.index]?.virality?.grade ?? null,
                    })),
                  }
                : p,
            );

            let ready = 0;
            let failed = 0;
            for (const section of sections) {
              if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
              setSection(section.index, 'active');
              try {
                await cutAndPersistSection({
                  brandId: asset.brandId,
                  sourceAssetId: asset.id,
                  sourceBlob,
                  section,
                  score: frame.scores?.[section.index] ?? frame.score,
                  quality,
                  captionsEnabled,
                  captionStyle,
                  signal: controller.signal,
                });
                setSection(section.index, 'done');
                ready += 1;
              } catch (err) {
                if (isAbort(err)) throw err;
                setSection(section.index, 'error');
                failed += 1;
              }
            }

            setProgress((p) => (forThisAsset(p) ? { ...p, done: true } : p));
            if (ready > 0) {
              show({
                title: translateUi('clips_generated_df5ab9ea'),
                description: translateUi('value0_clip_value1_saved_to_the_cli_ce0843e9', {
                  count: Number(ready),
                  details: String(failed > 0 ? `, ${failed} failed` : ''),
                }),
                variant: failed > 0 ? 'error' : 'success',
              });
            } else {
              show({
                title: translateUi('clip_generation_failed_7d56011b'),
                description: translateUi('no_clips_could_be_produced_a7780060'),
                variant: 'error',
              });
            }
          }
        }
      } catch (error) {
        if (isAbort(error)) {
          setProgress(null);
          return;
        }
        show({
          title: translateUi('clip_generation_failed_7d56011b'),
          description: uiErrorText(error),
          variant: 'error',
        });
        setProgress(null);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [show, translateUi, uiErrorText],
  );

  const dismiss = React.useCallback(() => setProgress(null), []);

  return { generate, isGenerating, progress, dismiss };
}
