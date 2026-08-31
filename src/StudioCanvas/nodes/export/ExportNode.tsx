'use client';

// The terminal writer. Unlike the publisher handoffs (`plannerDraft`, `organicPublish`,
// `paidPublisher`) — which a run deliberately walks up to WITHOUT executing, because a
// human still has to press Publish — Export EXECUTES: writing a file to the user's disk
// is the whole node, and there is nothing downstream of it to wait for.
//
// Local formats only. Google Drive and friends are out by decision, not by omission —
// there is no destination abstraction here to extend, on purpose.

import { EXPORT_MEDIA_INPUT_HANDLE } from '@continuum/contracts';
import { Handle, type NodeProps, Position, type Node as ReactFlowNode } from '@xyflow/react';
import { Download, Loader2, Package } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXPORT_FORMATS, formatsForKind, isExportFormatId } from '@/lib/export/transcode';
import { useWorkflowExecution } from '../../hooks/useWorkflowExecution';
import { useStudioStore } from '../../stores/useStudioStore';
import type { ExportNodeData } from '../../types';
import { executeWorkflow } from '../../utils/executeWorkflow';
import {
  exportKindForSources,
  exportSourcesFromGraph,
  resolveExportFormat,
  runExport,
} from '../../utils/export/runExport';
import { EDGE_COLOR_BY_MODALITY, MODALITY_LABEL } from '../modalityPreview';
import { NodeBadge, NodeTitleBar } from '../NodeChrome';

export function ExportNode({ id, data, selected }: NodeProps<ReactFlowNode<ExportNodeData>>) {
  const executionControls = useWorkflowExecution();
  const brandId = useStudioStore((state) => state.brandId);
  const roomId = useStudioStore((state) => state.activeRoomId);
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const updateNodeData = useStudioStore((state) => state.updateNodeData);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrote, setWrote] = useState<string | null>(null);

  const sources = useMemo(() => exportSourcesFromGraph(id, edges, nodes), [id, edges, nodes]);
  const kind = exportKindForSources(sources);
  const format = resolveExportFormat(data.format, kind);
  // The pool feeding `media-in`, not the resolved sources: an upstream that has not run
  // yet contributes an edge but no bytes, and the button still has to offer to run it.
  const wiredCount = useMemo(
    () =>
      edges.filter(
        (edge) =>
          edge.target === id &&
          (edge.targetHandle ?? EXPORT_MEDIA_INPUT_HANDLE) === EXPORT_MEDIA_INPUT_HANDLE,
      ).length,
    [edges, id],
  );
  const bulk = wiredCount > 1;
  // A mixed pool encodes per source: the picked format covers its own kind, the rest
  // fall back to their kind's default (runExport.exportFormatForSource). Say so.
  const mixedPool =
    format !== null && sources.some((source) => source.kind !== EXPORT_FORMATS[format].kind);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setWrote(null);
    try {
      // Resolve the inputs before writing anything. The executor's OWN run-skip decides
      // whether an upstream actually re-runs — which is exactly what lets two export
      // nodes hanging off one source share ONE upstream execution instead of two.
      const upstreamIds = Array.from(
        new Set(
          useStudioStore
            .getState()
            .edges.filter((edge) => edge.target === id)
            .map((edge) => edge.source),
        ),
      );
      for (const upstreamId of upstreamIds) {
        await executeWorkflow(executionControls, {
          targetNodeId: upstreamId,
          clearDownstream: false,
          brandId,
          roomId,
        });
      }

      // Re-read after the run: the outputs it produced were mirrored into node data.
      const fresh = useStudioStore.getState();
      const resolved = exportSourcesFromGraph(id, fresh.edges, fresh.nodes);
      const resolvedKind = exportKindForSources(resolved);
      const stored = fresh.nodes.find((node) => node.id === id)?.data as ExportNodeData | undefined;
      const resolvedFormat = resolveExportFormat(stored?.format ?? data.format, resolvedKind);
      if (!resolvedFormat) throw new Error('Nothing is connected to export');

      const result = await runExport({ sources: resolved, format: resolvedFormat });
      setWrote(
        result.zipped ? `${result.files[0].name} — ${resolved.length} files` : result.files[0].name,
      );
      if (result.fellBackToH264) {
        setError('This browser cannot encode H.265 — saved as H.264.');
      }
      updateNodeData(id, { isComplete: true, error: undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }, [brandId, data.format, executionControls, id, roomId, updateNodeData]);

  return (
    // `size-full`, never a hardcoded box — see RouterNode. The node is created 280x200.
    <div className="relative size-full min-h-[160px] min-w-[240px]">
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="size-full overflow-hidden border-border/60 bg-background"
      >
        <NodeTitleBar icon={Download} label="Export">
          {kind ? <NodeBadge>{MODALITY_LABEL[kind]}</NodeBadge> : null}
        </NodeTitleBar>
        <NodeContent className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
          {kind && format ? (
            <>
              <Select value={format} onValueChange={(next) => updateNodeData(id, { format: next })}>
                <SelectTrigger
                  className="nodrag h-7 w-full px-2 py-0 text-xs"
                  data-testid="studio-export-format"
                >
                  {/* Base UI's Value renders the raw value unless it is given a formatter,
                      so without this the trigger reads "mp4-h265" instead of "MP4 (H.265)". */}
                  <SelectValue>
                    {(value: unknown) =>
                      isExportFormatId(value) ? EXPORT_FORMATS[value].label : 'Format'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {formatsForKind(kind).map((option) => (
                    <SelectItem key={option} value={option}>
                      {EXPORT_FORMATS[option].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="min-h-8 text-2xs leading-tight text-muted-foreground">
                {EXPORT_FORMATS[format].hint ??
                  (bulk
                    ? mixedPool
                      ? `${wiredCount} inputs — saved as one ZIP. The format applies to matching inputs; others keep their own default.`
                      : `${wiredCount} inputs — saved as one ZIP.`
                    : 'Saved straight to your downloads.')}
              </p>
              <Button
                className="nodrag mt-auto h-8"
                size="sm"
                disabled={busy}
                onClick={() => void run()}
                data-testid="studio-export-download"
              >
                {busy ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
                {bulk ? (
                  <>
                    <Package className="mr-2 size-3.5" />
                    Download All
                  </>
                ) : (
                  'Download'
                )}
              </Button>
            </>
          ) : (
            <p className="my-auto text-center text-xs text-muted-foreground">
              Connect an image or a clip to save it out.
            </p>
          )}
          {wrote ? (
            <p
              className="truncate text-2xs text-muted-foreground"
              data-testid="studio-export-wrote"
            >
              Saved {wrote}
            </p>
          ) : null}
          {error ? (
            <p className="text-2xs text-destructive" data-testid="studio-export-error">
              {error}
            </p>
          ) : null}
        </NodeContent>
      </CanvasNode>
      <Handle
        type="target"
        position={Position.Left}
        id={EXPORT_MEDIA_INPUT_HANDLE}
        className="studio-handle !size-3"
        style={{
          ['--edge-color' as never]: kind ? EDGE_COLOR_BY_MODALITY[kind] : 'var(--edge-text)',
        }}
      />
    </div>
  );
}
