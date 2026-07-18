'use client';

import { useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useWorkflowExecution } from '../../hooks/useWorkflowExecution';
import { useStudioStore } from '../../stores/useStudioStore';
import type { StudioNode, TimelineEditorNodeData, TimelineItem, TimelineTrack } from '../../types';
import type { NodeOutput } from '../../types/execution';
import { collectDownstreamLeafIds, executeWorkflow } from '../../utils/executeWorkflow';
import { persistTimelineRender } from '../../utils/persistTimelineRender';
import {
  resolveTimelineInputPool,
  resolveTimelineOverlays,
  resolveTimelineSources,
} from '../../utils/splice/resolveClipSources';
import type {
  TimelineDocument,
  TimelineEditorAdapter,
  TimelinePatchOptions,
  TimelineRenderSink,
} from './adapter';

// The canvas implementation of the Video Editor host seam. The document is a
// React Flow node's data, the media bin is the node's incoming `media-in` edges,
// every patch autosaves the whole canvas session, and a finished render commits
// the break-point gate (`committed`) then resumes the parked downstream chain.
// Everything canvas-shaped about the editor lives here and nowhere else.

const EMPTY_ITEMS: TimelineItem[] = [];
const EMPTY_NODE_DATA: TimelineEditorNodeData = { items: EMPTY_ITEMS };

const CANVAS_RENDER_SINKS: TimelineRenderSink[] = [
  {
    kind: 'canvas-workflow',
    label: 'Render & Continue',
    description: 'Save the clip to your library and resume the workflow.',
  },
];

const CANVAS_HEADER = {
  title: 'Video Editor',
  description:
    'Place clips & stills, trim, split, then render. The clip is saved to your library and the workflow continues.',
};

function documentFromNodeData(data: TimelineEditorNodeData): TimelineDocument {
  return {
    items: data.items ?? EMPTY_ITEMS,
    overlayTracks: data.overlayTracks,
    exportPresetId: data.exportPresetId,
    markers: data.markers,
    captionsEnabled: data.captionsEnabled,
    captionCues: data.captionCues,
    captionWords: data.captionWords,
    captionStyle: data.captionStyle,
  };
}

// Apply an editor patch to a timeline node's data. Pure, so the break-point
// matrix is testable without React: an edit that can change the output resets
// `committed` (the workflow re-parks until the human re-renders), while an edit
// that cannot — a ruler marker, toggling caption visibility — leaves it alone.
export function applyDocumentPatch(
  nodeData: TimelineEditorNodeData,
  updater: (document: TimelineDocument) => TimelineDocument,
  options?: TimelinePatchOptions,
): TimelineEditorNodeData {
  const next = updater(documentFromNodeData(nodeData));
  const patched: TimelineEditorNodeData = {
    ...nodeData,
    items: next.items,
    overlayTracks: next.overlayTracks,
    exportPresetId: next.exportPresetId,
    markers: next.markers,
    captionsEnabled: next.captionsEnabled,
    captionCues: next.captionCues,
    captionWords: next.captionWords,
    captionStyle: next.captionStyle,
  };
  if (options?.invalidatesRender ?? true) patched.committed = false;
  return patched;
}

// The canvas store surface a document patch needs: write the node, then autosave
// the whole canvas session. Taken as a parameter so the write-through contract is
// exercisable without React or a live store.
export interface TimelineCanvasWriter {
  updateNode: (id: string, updater: (node: StudioNode) => StudioNode) => void;
  triggerSave: () => void;
}

export function patchNodeDocument(
  writer: TimelineCanvasWriter,
  nodeId: string,
  updater: (document: TimelineDocument) => TimelineDocument,
  options?: TimelinePatchOptions,
): void {
  writer.updateNode(nodeId, (node) => ({
    ...node,
    data: applyDocumentPatch(node.data as TimelineEditorNodeData, updater, options),
  }));
  writer.triggerSave();
}

export function useCanvasTimelineAdapter(nodeId: string): TimelineEditorAdapter {
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);
  const brandId = useStudioStore((state) => state.brandId);
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const setKeyboardScope = useStudioStore((state) => state.setKeyboardScope);
  const executionControls = useWorkflowExecution();
  const { show } = useToast();

  const nodeData = useMemo(
    () => nodes.find((node) => node.id === nodeId)?.data as TimelineEditorNodeData | undefined,
    [nodes, nodeId],
  );
  const document = useMemo(() => documentFromNodeData(nodeData ?? EMPTY_NODE_DATA), [nodeData]);
  const pool = useMemo(
    () => resolveTimelineInputPool(nodeId, edges, nodes),
    [nodeId, edges, nodes],
  );

  // The render path must never composite a stale props closure, so it reads the
  // node straight from the store instead of the reactive snapshot above.
  const getDocument = useCallback((): TimelineDocument => {
    const current = (useStudioStore.getState().nodes as StudioNode[]).find(
      (node) => node.id === nodeId,
    );
    return documentFromNodeData((current?.data as TimelineEditorNodeData) ?? EMPTY_NODE_DATA);
  }, [nodeId]);

  const patchDocument = useCallback(
    (updater: (document: TimelineDocument) => TimelineDocument, options?: TimelinePatchOptions) => {
      patchNodeDocument({ updateNode, triggerSave }, nodeId, updater, options);
    },
    [nodeId, triggerSave, updateNode],
  );

  const resolveSources = useCallback(
    (items: TimelineItem[]) => {
      const state = useStudioStore.getState();
      return resolveTimelineSources(
        items,
        state.edges,
        state.nodes as StudioNode[],
        new Map<string, NodeOutput>(),
        nodeId,
      );
    },
    [nodeId],
  );

  const resolveOverlays = useCallback(
    (tracks: TimelineTrack[]) => {
      const state = useStudioStore.getState();
      return resolveTimelineOverlays(
        tracks,
        state.edges,
        state.nodes as StudioNode[],
        new Map<string, NodeOutput>(),
        nodeId,
      );
    },
    [nodeId],
  );

  const reportRenderProgress = useCallback(
    (progress: number) => {
      useStudioStore.getState().updateNodeData(nodeId, { progress });
    },
    [nodeId],
  );

  const reportRenderState = useCallback(
    (state: { isExecuting: boolean; error?: string }) => {
      updateNode(nodeId, (node) => ({
        ...node,
        data: {
          ...(node.data as TimelineEditorNodeData),
          isExecuting: state.isExecuting,
          error: state.error,
        },
      }));
    },
    [nodeId, updateNode],
  );

  const completeRender = useCallback(
    async (blob: Blob) => {
      const objectUrl = URL.createObjectURL(blob);
      updateNode(nodeId, (node) => ({
        ...node,
        data: {
          ...(node.data as TimelineEditorNodeData),
          generatedVideo: objectUrl,
          progress: 1,
        },
      }));

      // Persist the finalized clip to the media library. Prefer the durable signed
      // URL + storage coords so the output survives canvas reloads; fall back to
      // the in-memory object URL when the brand is anonymous (local preview).
      const brand = useStudioStore.getState().brandId;
      let committedUrl = objectUrl;
      let storagePath: string | undefined;
      let bucket: string | undefined;
      if (brand && brand !== 'default-brand') {
        try {
          const persisted = await persistTimelineRender({ blob, brandId: brand, nodeId });
          committedUrl = persisted.signedUrl;
          storagePath = persisted.storagePath;
          bucket = persisted.bucket;
        } catch (persistError) {
          const message =
            persistError instanceof Error ? persistError.message : 'Library save failed';
          show({ title: 'Saved locally only', description: message, variant: 'warning' });
        }
      }

      updateNode(nodeId, (node) => ({
        ...node,
        data: {
          ...(node.data as TimelineEditorNodeData),
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
      const state = useStudioStore.getState();
      const currentNodes = state.nodes as StudioNode[];
      const leafIds = collectDownstreamLeafIds(
        nodeId,
        state.edges,
        new Map(currentNodes.map((candidate) => [candidate.id, candidate])),
      );
      for (const leafId of leafIds) {
        await executeWorkflow(executionControls, {
          targetNodeId: leafId,
          clearDownstream: false,
          brandId: brand,
        });
      }
    },
    [executionControls, nodeId, show, triggerSave, updateNode],
  );

  // Claim the keyboard while the editor is open so the canvas-level Delete/copy/
  // undo handlers stand down (see useStudioStore.keyboardScope + the canvas key
  // handler).
  const onEditorOpenChange = useCallback(
    (open: boolean) => setKeyboardScope(open ? 'modal' : 'canvas'),
    [setKeyboardScope],
  );

  return useMemo(
    () => ({
      scope: 'canvas',
      brandId: brandId ?? null,
      header: CANVAS_HEADER,
      document,
      getDocument,
      patchDocument,
      pool,
      resolveSources,
      resolveOverlays,
      renderSinks: CANVAS_RENDER_SINKS,
      completeRender,
      reportRenderProgress,
      reportRenderState,
      onEditorOpenChange,
    }),
    [
      brandId,
      completeRender,
      document,
      getDocument,
      onEditorOpenChange,
      patchDocument,
      pool,
      reportRenderProgress,
      reportRenderState,
      resolveOverlays,
      resolveSources,
    ],
  );
}
