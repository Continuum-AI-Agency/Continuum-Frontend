'use client';

import { timelineRenderFingerprint } from '@continuum/contracts';
import { useCallback, useMemo } from 'react';
import { completeCanvasRender } from '@/lib/api/canvasRender.client';
import { useCanvasRuntime } from '../../contexts/CanvasRuntimeContext';
import { useStudioStore } from '../../stores/useStudioStore';
import type { StudioNode, TimelineEditorNodeData, TimelineItem, TimelineTrack } from '../../types';
import type { NodeOutput } from '../../types/execution';
import { persistTimelineRender } from '../../utils/persistTimelineRender';
import {
  resolveTimelineAudioTracks,
  resolveTimelineInputPool,
  resolveTimelineOverlays,
  resolveTimelineSources,
} from '../../utils/splice/resolveClipSources';
import type {
  TimelineDocument,
  TimelineEditorAdapter,
  TimelinePatchOptions,
  TimelineRenderCompletionContext,
  TimelineRenderSink,
  TimelineRenderSnapshot,
} from './adapter';

// The canvas implementation of the Video Editor host seam. The document is a
// React Flow node's data, the media bin is the node's incoming `media-in` edges,
// every patch autosaves the whole canvas session, and a finished render commits
// the break-point gate (`committed`) plus a durable continuation marker. The open
// originating room claims that marker and resumes the parked downstream chain.
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

function reportPlannerCompositionStatus(
  brandId: string | undefined,
  compositionId: string | undefined,
  status: 'editing' | 'rendering' | 'failed',
  error?: string,
) {
  if (!brandId || !compositionId) return;
  void fetch('/api/organic/ai-studio/compositions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, compositionId, status, ...(error ? { error } : {}) }),
  });
}

function documentFromNodeData(data: TimelineEditorNodeData): TimelineDocument {
  return {
    items: data.items ?? EMPTY_ITEMS,
    overlayTracks: data.overlayTracks,
    audioTracks: data.audioTracks,
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
    audioTracks: next.audioTracks,
    exportPresetId: next.exportPresetId,
    markers: next.markers,
    captionsEnabled: next.captionsEnabled,
    captionCues: next.captionCues,
    captionWords: next.captionWords,
    captionStyle: next.captionStyle,
  };
  if (options?.invalidatesRender ?? true) {
    patched.committed = false;
    patched.renderContinuation = undefined;
    patched.agentRenderRequest = undefined;
  }
  return patched;
}

// The canvas store surface a document patch needs: write the node, then autosave
// the whole canvas session. Taken as a parameter so the write-through contract is
// exercisable without React or a live store.
export interface TimelineCanvasWriter {
  updateNode: (id: string, updater: (node: StudioNode) => StudioNode) => void;
  takeSnapshot?: () => void;
  triggerSave: () => void;
}

export function patchNodeDocument(
  writer: TimelineCanvasWriter,
  nodeId: string,
  updater: (document: TimelineDocument) => TimelineDocument,
  options?: TimelinePatchOptions,
): void {
  if (options?.recordHistory ?? true) writer.takeSnapshot?.();
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
  const takeSnapshot = useStudioStore((state) => state.takeSnapshot);
  const undo = useStudioStore((state) => state.undo);
  const redo = useStudioStore((state) => state.redo);
  const canUndo = useStudioStore((state) => state.history.past.length > 0);
  const canRedo = useStudioStore((state) => state.history.future.length > 0);
  const setKeyboardScope = useStudioStore((state) => state.setKeyboardScope);
  const runtime = useCanvasRuntime();

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
      patchNodeDocument({ updateNode, takeSnapshot, triggerSave }, nodeId, updater, options);
    },
    [nodeId, takeSnapshot, triggerSave, updateNode],
  );

  const undoManager = useMemo(
    () => ({
      canUndo,
      canRedo,
      undo: () => {
        undo();
        triggerSave();
      },
      redo: () => {
        redo();
        triggerSave();
      },
    }),
    [canRedo, canUndo, redo, triggerSave, undo],
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

  const resolveAudioTracks = useCallback(
    (tracks: TimelineTrack[]) => {
      const state = useStudioStore.getState();
      return resolveTimelineAudioTracks(
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
      const current = (useStudioStore.getState().nodes as StudioNode[]).find(
        (node) => node.id === nodeId,
      );
      const compositionId = (current?.data as TimelineEditorNodeData | undefined)
        ?.plannerCompositionId;
      if (state.isExecuting) {
        reportPlannerCompositionStatus(brandId, compositionId, 'rendering');
      } else if (state.error) {
        reportPlannerCompositionStatus(brandId, compositionId, 'failed', state.error);
      }
      updateNode(nodeId, (node) => ({
        ...node,
        data: (() => {
          const data = node.data as TimelineEditorNodeData;
          const request = data.agentRenderRequest;
          return {
            ...data,
            isExecuting: state.isExecuting,
            error: state.error,
            ...(request
              ? {
                  agentRenderRequest: state.error
                    ? { ...request, status: 'error' as const, error: state.error }
                    : state.isExecuting && request.status === 'pending'
                      ? { ...request, status: 'accepted' as const, error: undefined }
                      : request,
                }
              : {}),
          };
        })(),
      }));
      triggerSave();
    },
    [brandId, nodeId, triggerSave, updateNode],
  );

  const renderOrigin = useMemo(
    () =>
      runtime
        ? {
            brandProfileId: runtime.brandProfileId,
            roomId: runtime.roomId,
            nodeId,
            label: 'Video Editor',
            viewHref: `/ai-studio?roomId=${encodeURIComponent(runtime.roomId)}&focusNodeId=${encodeURIComponent(nodeId)}`,
          }
        : undefined,
    [nodeId, runtime],
  );

  const captureRenderSnapshot = useCallback((): TimelineRenderSnapshot => {
    const state = useStudioStore.getState();
    const snapshotNodes = structuredClone(state.nodes) as StudioNode[];
    const snapshotEdges = structuredClone(state.edges);
    const currentNode = snapshotNodes.find((node) => node.id === nodeId);
    const snapshotDocument = documentFromNodeData(
      (currentNode?.data as TimelineEditorNodeData | undefined) ?? EMPTY_NODE_DATA,
    );
    const inputFingerprint = timelineRenderFingerprint(
      { nodes: snapshotNodes, edges: snapshotEdges },
      nodeId,
    );
    if (!inputFingerprint) throw new Error('The Video Editor node is no longer available');

    const overlayTracks = snapshotDocument.overlayTracks ?? [];
    const audioTracks = snapshotDocument.audioTracks ?? [];
    return {
      document: snapshotDocument,
      inputFingerprint,
      resolveSources: () =>
        resolveTimelineSources(
          snapshotDocument.items,
          snapshotEdges,
          snapshotNodes,
          new Map<string, NodeOutput>(),
          nodeId,
        ),
      resolveOverlays: () =>
        resolveTimelineOverlays(
          overlayTracks,
          snapshotEdges,
          snapshotNodes,
          new Map<string, NodeOutput>(),
          nodeId,
        ),
      resolveAudioTracks: () =>
        resolveTimelineAudioTracks(
          audioTracks,
          snapshotEdges,
          snapshotNodes,
          new Map<string, NodeOutput>(),
          nodeId,
        ),
    };
  }, [nodeId]);

  const flushRenderSnapshot = useCallback(async () => {
    if (!runtime) throw new Error('Canvas workspace is not ready');
    await runtime.flushSave();
  }, [runtime]);

  const completeRender = useCallback(
    async (blob: Blob, _sink: string, context?: TimelineRenderCompletionContext) => {
      if (!runtime || !context) throw new Error('Background render context is unavailable');

      const persisted = await persistTimelineRender({
        blob,
        brandId: runtime.brandProfileId,
        nodeId,
      });
      const response = await completeCanvasRender(
        {
          jobId: context.jobId,
          brandProfileId: runtime.brandProfileId,
          roomId: runtime.roomId,
          nodeId,
          inputFingerprint: context.inputFingerprint,
          output: {
            assetId: persisted.assetId,
            bucket: persisted.bucket,
            storagePath: persisted.storagePath,
            signedUrl: persisted.signedUrl,
            mimeType: blob.type || 'video/mp4',
            durationSec: context.result.durationSec,
            width: context.result.width,
            height: context.result.height,
          },
        },
        context.signal,
      );

      const currentState = useStudioStore.getState();
      const isOriginOpen =
        currentState.brandId === runtime.brandProfileId &&
        currentState.activeRoomId === runtime.roomId &&
        currentState.nodes.some((node) => node.id === nodeId);
      if (isOriginOpen) {
        const currentNode = (currentState.nodes as StudioNode[]).find((node) => node.id === nodeId);
        const request = (currentNode?.data as TimelineEditorNodeData | undefined)
          ?.agentRenderRequest;
        currentState.updateNodeData(nodeId, {
          ...(response.outcome === 'committed'
            ? {
                committed: true,
                generatedVideo: persisted.signedUrl,
                generatedVideoUrl: persisted.signedUrl,
                generatedVideoStoragePath: persisted.storagePath,
                generatedVideoBucket: persisted.bucket,
                renderOutputAssetId: persisted.assetId,
                renderOutputAssetVersionId: persisted.versionId,
                lastRenderJobId: context.jobId,
                renderContinuation: {
                  jobId: context.jobId,
                  status: response.downstreamLeafIds.length > 0 ? 'pending' : 'done',
                  downstreamLeafIds: response.downstreamLeafIds,
                },
                isComplete: true,
                awaitingInput: false,
                error: undefined,
              }
            : {
                committed: false,
                error:
                  response.outcome === 'stale'
                    ? 'Timeline changed while this render was running. Render again to apply it.'
                    : 'The Video Editor node was removed before the render finished.',
              }),
          ...(request
            ? {
                agentRenderRequest: {
                  ...request,
                  jobId: context.jobId,
                  status:
                    response.outcome === 'committed' ? ('completed' as const) : ('stale' as const),
                  error:
                    response.outcome === 'committed'
                      ? undefined
                      : response.outcome === 'stale'
                        ? 'Timeline changed while this render was running.'
                        : 'The Video Editor node was removed before the render finished.',
                },
              }
            : {}),
          isExecuting: false,
          progress: 1,
        } as Partial<StudioNode['data']>);
        currentState.triggerSave();
      }

      return { outcome: response.outcome };
    },
    [nodeId, runtime],
  );

  // Claim the keyboard while the editor is open so the canvas-level Delete/copy/
  // undo handlers stand down (see useStudioStore.keyboardScope + the canvas key
  // handler).
  const onEditorOpenChange = useCallback(
    (open: boolean) => {
      setKeyboardScope(open ? 'modal' : 'canvas');
      if (open) {
        const current = (useStudioStore.getState().nodes as StudioNode[]).find(
          (node) => node.id === nodeId,
        );
        reportPlannerCompositionStatus(
          brandId,
          (current?.data as TimelineEditorNodeData | undefined)?.plannerCompositionId,
          'editing',
        );
      }
    },
    [brandId, nodeId, setKeyboardScope],
  );

  return useMemo(
    () => ({
      scope: 'canvas',
      brandId: brandId ?? null,
      agentContext: runtime ? { roomId: runtime.roomId, nodeId } : undefined,
      header: CANVAS_HEADER,
      document,
      getDocument,
      patchDocument,
      undoManager,
      pool,
      resolveSources,
      resolveOverlays,
      resolveAudioTracks,
      renderSinks: CANVAS_RENDER_SINKS,
      renderOrigin,
      captureRenderSnapshot,
      flushRenderSnapshot,
      completeRender,
      reportRenderProgress,
      reportRenderState,
      onEditorOpenChange,
    }),
    [
      brandId,
      captureRenderSnapshot,
      completeRender,
      document,
      flushRenderSnapshot,
      getDocument,
      onEditorOpenChange,
      patchDocument,
      undoManager,
      pool,
      reportRenderProgress,
      reportRenderState,
      renderOrigin,
      resolveOverlays,
      resolveAudioTracks,
      resolveSources,
      runtime,
    ],
  );
}
