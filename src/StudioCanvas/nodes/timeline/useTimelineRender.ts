import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useWorkflowExecution } from '../../hooks/useWorkflowExecution';
import { useStudioStore } from '../../stores/useStudioStore';
import type { StudioNode, TimelineEditorNodeData, TimelineItem } from '../../types';
import type { NodeOutput } from '../../types/execution';
import { collectDownstreamLeafIds, executeWorkflow } from '../../utils/executeWorkflow';
import { persistTimelineRender } from '../../utils/persistTimelineRender';
import { resolveTimelineSources } from '../../utils/splice/resolveClipSources';
import { checkSpliceSupport, type WebCodecsSupport } from '../../utils/splice/webcodecsSupport';
import { runTimelineInWorker } from '../../workers/spliceWorkerClient';

// The Video Editor (timelineEditor) render orchestration, shared by the node
// launcher and the full editor dialog: resolve the placed timeline to source
// blobs, compose the MP4 in a worker, persist it to the media library, commit
// the break-point gate, then resume only the parked downstream chain. Reads the
// timeline fresh from the store at call time so it always renders the latest edit.

export interface UseTimelineRenderResult {
  render: () => Promise<boolean>;
  isRendering: boolean;
  support: WebCodecsSupport | null;
}

export function useTimelineRender(nodeId: string): UseTimelineRenderResult {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const executionControls = useWorkflowExecution();
  const { show } = useToast();

  const [support, setSupport] = useState<WebCodecsSupport | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let mounted = true;
    checkSpliceSupport().then((result) => {
      if (mounted) setSupport(result);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const render = useCallback(async (): Promise<boolean> => {
    if (support && !support.ok) {
      show({ title: 'Editor unavailable', description: support.reason, variant: 'warning' });
      return false;
    }

    const state = useStudioStore.getState();
    const nodes = state.nodes as StudioNode[];
    const edges = state.edges;
    const brandId = state.brandId;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const items = ((node?.data as TimelineEditorNodeData | undefined)?.items ??
      []) as TimelineItem[];

    if (items.length === 0) {
      show({
        title: 'Nothing to render',
        description: 'Place at least one clip or image on the timeline.',
        variant: 'warning',
      });
      return false;
    }

    const controller = new AbortController();
    setIsRendering(true);
    updateNode(nodeId, (current) => ({
      ...current,
      data: {
        ...(current.data as TimelineEditorNodeData),
        isExecuting: true,
        error: undefined,
        progress: 0,
      },
    }));

    try {
      const resolved = await resolveTimelineSources(
        items,
        edges,
        nodes,
        new Map<string, NodeOutput>(),
        nodeId,
      );
      const result = await runTimelineInWorker({
        items: resolved,
        signal: controller.signal,
        onProgress: ({ progress }) => {
          useStudioStore.getState().updateNodeData(nodeId, { progress });
        },
      });

      updateNode(nodeId, (current) => ({
        ...current,
        data: {
          ...(current.data as TimelineEditorNodeData),
          generatedVideo: result.objectUrl,
          progress: 1,
        },
      }));

      // Persist the finalized clip to the media library. Prefer the durable signed
      // URL + storage coords so the output survives canvas reloads; fall back to
      // the in-memory object URL when the brand is anonymous (local preview).
      let committedUrl = result.objectUrl;
      let storagePath: string | undefined;
      let bucket: string | undefined;
      if (brandId && brandId !== 'default-brand') {
        try {
          const persisted = await persistTimelineRender({ blob: result.blob, brandId, nodeId });
          committedUrl = persisted.signedUrl;
          storagePath = persisted.storagePath;
          bucket = persisted.bucket;
        } catch (persistError) {
          const message =
            persistError instanceof Error ? persistError.message : 'Library save failed';
          show({ title: 'Saved locally only', description: message, variant: 'warning' });
        }
      }

      updateNode(nodeId, (current) => ({
        ...current,
        data: {
          ...(current.data as TimelineEditorNodeData),
          committed: true,
          generatedVideo: committedUrl,
          generatedVideoUrl: committedUrl,
          generatedVideoStoragePath: storagePath,
          generatedVideoBucket: bucket,
          isExecuting: false,
          isComplete: true,
          awaitingInput: false,
          progress: 1,
        },
      }));
      triggerSave();

      // Resume the workflow: re-run only the parked downstream chain, targeting
      // each leaf so its upstream closure reuses this committed clip instead of
      // regenerating the whole graph.
      const currentNodes = useStudioStore.getState().nodes as StudioNode[];
      const leafIds = collectDownstreamLeafIds(
        nodeId,
        edges,
        new Map(currentNodes.map((candidate) => [candidate.id, candidate])),
      );
      for (const leafId of leafIds) {
        await executeWorkflow(executionControls, {
          targetNodeId: leafId,
          clearDownstream: false,
          brandId,
        });
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Render failed';
      updateNode(nodeId, (current) => ({
        ...current,
        data: { ...(current.data as TimelineEditorNodeData), isExecuting: false, error: message },
      }));
      show({ title: 'Render failed', description: message, variant: 'warning' });
      return false;
    } finally {
      setIsRendering(false);
    }
  }, [executionControls, nodeId, show, support, triggerSave, updateNode]);

  return { render, isRendering, support };
}
