import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  isTerminalStudioRenderStatus,
  studioRenderOriginKey,
  useStudioRenderStore,
} from '@/lib/studio-render/renderStore';
import { useStudioRenderQueue } from '@/lib/studio-render/StudioRenderProvider';
import { resolveExportPreset } from '../../utils/render/exportPresets';
import { checkSpliceSupport, type WebCodecsSupport } from '../../utils/splice/webcodecsSupport';
import { runTimelineInWorker } from '../../workers/spliceWorkerClient';
import type {
  TimelineEditorAdapter,
  TimelineRenderCompletion,
  TimelineRenderSinkKind,
  TimelineRenderSnapshot,
} from './adapter';
import { resolveOverlayTracks } from './multiTrack';

export interface UseTimelineRenderResult {
  render: (sink?: TimelineRenderSinkKind) => Promise<boolean>;
  isRendering: boolean;
  progress: number;
  support: WebCodecsSupport | null;
  status?: string;
}

export function useTimelineRender(adapter: TimelineEditorAdapter): UseTimelineRenderResult {
  const { show } = useToast();
  const queue = useStudioRenderQueue();
  const jobs = useStudioRenderStore((state) => state.jobs);
  const {
    getDocument,
    resolveSources,
    resolveOverlays,
    completeRender,
    reportRenderProgress,
    reportRenderState,
    renderSinks,
    renderOrigin,
    captureRenderSnapshot,
    flushRenderSnapshot,
  } = adapter;

  const [support, setSupport] = useState<WebCodecsSupport | null>(null);
  const [localIsRendering, setLocalIsRendering] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);

  useEffect(() => {
    let mounted = true;
    checkSpliceSupport().then((result) => {
      if (mounted) setSupport(result);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const originKey = renderOrigin ? studioRenderOriginKey(renderOrigin) : null;
  const globalJob = useMemo(
    () =>
      originKey
        ? Object.values(jobs)
            .filter((job) => job.originKey === originKey)
            .sort((left, right) => right.createdAt - left.createdAt)[0]
        : undefined,
    [jobs, originKey],
  );
  const globalIsRendering = Boolean(globalJob && !isTerminalStudioRenderStatus(globalJob.status));

  const defaultSink = renderSinks[0]?.kind;

  const validateTarget = useCallback(
    (sink?: TimelineRenderSinkKind) => {
      if (support && !support.ok) {
        show({ title: 'Editor unavailable', description: support.reason, variant: 'warning' });
        return null;
      }
      const document = getDocument();
      if (document.items.length === 0) {
        show({
          title: 'Nothing to render',
          description: 'Place at least one clip or image on the timeline.',
          variant: 'warning',
        });
        return null;
      }
      const target = sink ?? defaultSink;
      if (!target) {
        show({
          title: 'Nowhere to render',
          description: 'This editor has no render destination.',
          variant: 'warning',
        });
        return null;
      }
      return { document, target };
    },
    [defaultSink, getDocument, show, support],
  );

  const renderInBackground = useCallback(
    async (sink?: TimelineRenderSinkKind): Promise<boolean> => {
      const validated = validateTarget(sink);
      if (!validated || !renderOrigin || !captureRenderSnapshot) return false;

      let snapshot: TimelineRenderSnapshot;
      try {
        snapshot = captureRenderSnapshot();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to capture render inputs';
        show({ title: 'Render unavailable', description: message, variant: 'warning' });
        return false;
      }
      const exportPreset = resolveExportPreset(snapshot.document.exportPresetId);
      const captionsOn =
        Boolean(snapshot.document.captionsEnabled) &&
        ((snapshot.document.captionCues?.length ?? 0) > 0 ||
          (snapshot.document.captionWords?.length ?? 0) > 0);

      const enqueued = queue.enqueue({
        origin: renderOrigin,
        execute: async ({ jobId, signal, setPhase, setProgress }) => {
          setPhase('preparing');
          await flushRenderSnapshot?.();
          const [items, overlays] = await Promise.all([
            snapshot.resolveSources(),
            snapshot.resolveOverlays(),
          ]);

          setPhase('rendering');
          const result = await runTimelineInWorker({
            items,
            overlays,
            videoBitrate: exportPreset.videoBitrate,
            targetWidth: exportPreset.width ?? undefined,
            targetHeight: exportPreset.height ?? undefined,
            captionCues: captionsOn ? snapshot.document.captionCues : undefined,
            captionWords: captionsOn ? snapshot.document.captionWords : undefined,
            captionStyle: captionsOn ? snapshot.document.captionStyle : undefined,
            signal,
            onProgress: ({ progress }) => {
              setProgress(progress);
              reportRenderProgress(progress);
            },
          });

          setPhase('saving');
          let completion: TimelineRenderCompletion | void;
          try {
            completion = await completeRender(result.blob, validated.target, {
              jobId,
              inputFingerprint: snapshot.inputFingerprint,
              signal,
              result: {
                durationSec: result.durationSec,
                width: result.width,
                height: result.height,
              },
            });
          } finally {
            URL.revokeObjectURL(result.objectUrl);
          }

          if (completion?.outcome === 'stale') {
            return {
              status: 'stale',
              title: 'Video rendered, but the timeline changed',
              description: 'The clip was saved to Library. Render again to apply it to the node.',
              variant: 'warning',
            };
          }
          if (completion?.outcome === 'missing') {
            return {
              status: 'stale',
              title: 'Video rendered after the node was removed',
              description: 'The clip is safe in Library, but the deleted node was not recreated.',
              variant: 'warning',
            };
          }
          return {
            status: 'completed',
            title: 'Video render finished',
            description: 'The clip is saved to Library and ready on the canvas.',
            variant: 'success',
          };
        },
        onFailure: (error) =>
          reportRenderState({ isExecuting: false, error: error.message || 'Render failed' }),
      });

      if (!enqueued.accepted) return false;
      reportRenderState({ isExecuting: true, error: undefined });
      reportRenderProgress(0);
      return true;
    },
    [
      captureRenderSnapshot,
      completeRender,
      flushRenderSnapshot,
      queue,
      renderOrigin,
      reportRenderProgress,
      reportRenderState,
      show,
      validateTarget,
    ],
  );

  const renderLocally = useCallback(
    async (sink?: TimelineRenderSinkKind): Promise<boolean> => {
      const validated = validateTarget(sink);
      if (!validated) return false;
      const { document, target } = validated;
      const overlayTracks = resolveOverlayTracks(document);
      const exportPreset = resolveExportPreset(document.exportPresetId);
      const controller = new AbortController();
      setLocalIsRendering(true);
      setLocalProgress(0);
      reportRenderState({ isExecuting: true, error: undefined });
      reportRenderProgress(0);

      try {
        const items = await resolveSources(document.items);
        const overlays = await resolveOverlays(overlayTracks);
        const captionsOn =
          Boolean(document.captionsEnabled) &&
          ((document.captionCues?.length ?? 0) > 0 || (document.captionWords?.length ?? 0) > 0);
        const result = await runTimelineInWorker({
          items,
          overlays,
          videoBitrate: exportPreset.videoBitrate,
          targetWidth: exportPreset.width ?? undefined,
          targetHeight: exportPreset.height ?? undefined,
          captionCues: captionsOn ? document.captionCues : undefined,
          captionWords: captionsOn ? document.captionWords : undefined,
          captionStyle: captionsOn ? document.captionStyle : undefined,
          signal: controller.signal,
          onProgress: ({ progress }) => {
            setLocalProgress(progress);
            reportRenderProgress(progress);
          },
        });
        try {
          await completeRender(result.blob, target);
        } finally {
          URL.revokeObjectURL(result.objectUrl);
        }
        setLocalProgress(1);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Render failed';
        reportRenderState({ isExecuting: false, error: message });
        show({ title: 'Render failed', description: message, variant: 'warning' });
        return false;
      } finally {
        setLocalIsRendering(false);
      }
    },
    [
      completeRender,
      reportRenderProgress,
      reportRenderState,
      resolveOverlays,
      resolveSources,
      show,
      validateTarget,
    ],
  );

  const render = renderOrigin && captureRenderSnapshot ? renderInBackground : renderLocally;
  return {
    render,
    isRendering: globalIsRendering || localIsRendering,
    progress: globalJob?.progress ?? localProgress,
    support,
    status: globalJob?.status,
  };
}
