import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { resolveExportPreset } from '../../utils/render/exportPresets';
import { checkSpliceSupport, type WebCodecsSupport } from '../../utils/splice/webcodecsSupport';
import { runTimelineInWorker } from '../../workers/spliceWorkerClient';
import type { TimelineEditorAdapter, TimelineRenderSinkKind } from './adapter';
import { resolveOverlayTracks } from './multiTrack';

// The Video Editor render orchestration, shared by the node launcher and the full
// editor dialog: resolve the placed timeline to source blobs, compose the MP4 in a
// worker, then hand the result to the host's sink (which persists it and runs the
// host's post-render side effects). Reads the document fresh from the adapter at
// call time so it always renders the latest edit, never a stale props closure.

export interface UseTimelineRenderResult {
  render: (sink?: TimelineRenderSinkKind) => Promise<boolean>;
  isRendering: boolean;
  progress: number;
  support: WebCodecsSupport | null;
}

export function useTimelineRender(adapter: TimelineEditorAdapter): UseTimelineRenderResult {
  const { show } = useToast();
  const {
    getDocument,
    resolveSources,
    resolveOverlays,
    completeRender,
    reportRenderProgress,
    reportRenderState,
    renderSinks,
  } = adapter;

  const [support, setSupport] = useState<WebCodecsSupport | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let mounted = true;
    checkSpliceSupport().then((result) => {
      if (mounted) setSupport(result);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const defaultSink = renderSinks[0]?.kind;

  const render = useCallback(
    async (sink?: TimelineRenderSinkKind): Promise<boolean> => {
      if (support && !support.ok) {
        show({ title: 'Editor unavailable', description: support.reason, variant: 'warning' });
        return false;
      }

      const document = getDocument();
      const items = document.items;
      const overlayTracks = resolveOverlayTracks(document);
      const exportPreset = resolveExportPreset(document.exportPresetId);

      if (items.length === 0) {
        show({
          title: 'Nothing to render',
          description: 'Place at least one clip or image on the timeline.',
          variant: 'warning',
        });
        return false;
      }

      const target = sink ?? defaultSink;
      if (!target) {
        show({
          title: 'Nowhere to render',
          description: 'This editor has no render destination.',
          variant: 'warning',
        });
        return false;
      }

      const controller = new AbortController();
      setIsRendering(true);
      setProgress(0);
      reportRenderState({ isExecuting: true, error: undefined });
      reportRenderProgress(0);

      try {
        const resolved = await resolveSources(items);
        const resolvedOverlays = await resolveOverlays(overlayTracks);
        const captionsOn =
          Boolean(document.captionsEnabled) && (document.captionWords?.length ?? 0) > 0;
        const result = await runTimelineInWorker({
          items: resolved,
          overlays: resolvedOverlays,
          videoBitrate: exportPreset.videoBitrate,
          targetWidth: exportPreset.width ?? undefined,
          targetHeight: exportPreset.height ?? undefined,
          captionWords: captionsOn ? document.captionWords : undefined,
          captionStyle: captionsOn ? document.captionStyle : undefined,
          signal: controller.signal,
          onProgress: ({ progress: value }) => {
            setProgress(value);
            reportRenderProgress(value);
          },
        });

        setProgress(1);
        await completeRender(result.blob, target);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Render failed';
        reportRenderState({ isExecuting: false, error: message });
        show({ title: 'Render failed', description: message, variant: 'warning' });
        return false;
      } finally {
        setIsRendering(false);
      }
    },
    [
      completeRender,
      defaultSink,
      getDocument,
      reportRenderProgress,
      reportRenderState,
      resolveOverlays,
      resolveSources,
      show,
      support,
    ],
  );

  return { render, isRendering, progress, support };
}
