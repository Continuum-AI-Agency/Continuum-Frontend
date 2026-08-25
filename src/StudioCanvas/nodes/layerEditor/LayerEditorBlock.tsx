'use client';

import {
  LAYER_EDITOR_IMAGE_INPUT_HANDLE,
  LAYER_EDITOR_IMAGE_OUTPUT_HANDLE,
  LAYER_EDITOR_LAYER_LIMIT,
} from '@continuum/contracts';
import {
  Handle,
  type HandleProps,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
  useNodeId,
  useReactFlow,
} from '@xyflow/react';
import { Copy, Layers, SquarePen, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../../contexts/PresenceContext';
import { useStudioStore } from '../../stores/useStudioStore';
import type { LayerEditorNodeData } from '../../types';
import { readFrame } from '../../utils/layers/frameModel';
import type { LayerDoc } from '../../utils/layers/layerDocReducer';
import { layerSourcesFromGraph } from '../../utils/layers/layerSources';
import { persistLayerComposite } from '../../utils/layers/persistLayerComposite';
import { type ComposeResult, LayerEditorDialog } from './LayerEditorDialog';

/**
 * Compact launcher for the Layer Editor (`layerEditor`) node.
 *
 * The real editing happens in a full-screen dialog; the node surfaces the input pool, a
 * layer count and the composed still. Inputs land on a single multi-connection
 * `image-in` pool handle, capped by contracts at `LAYER_EDITOR_LAYER_LIMIT`.
 *
 * Like the Video Editor, this is a MANUAL break-point: the composite is produced here,
 * by a person pressing Compose, and a run surfaces the result rather than generating it.
 */

const LimitedHandle = ({
  maxConnections,
  isConnectable,
  ...props
}: HandleProps & { maxConnections?: number }) => {
  const edges = useEdges();
  const nodeId = useNodeId();
  const handleId = props.id ?? null;

  const connectionCount = edges.filter((edge) => {
    if (!nodeId) return false;
    if (props.type === 'target') {
      return edge.target === nodeId && (edge.targetHandle ?? null) === handleId;
    }
    return edge.source === nodeId && (edge.sourceHandle ?? null) === handleId;
  }).length;

  const withinLimit = !maxConnections || connectionCount < maxConnections;
  return <Handle {...props} isConnectable={(isConnectable ?? true) && withinLimit} />;
};

export function LayerEditorBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<LayerEditorNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const { getNodes, getEdges } = useReactFlow();
  const edges = useEdges();
  const [open, setOpen] = useState(false);

  const frame = readFrame(data as unknown as Record<string, unknown>);
  const layers = useMemo(() => data.layers ?? [], [data.layers]);
  const preview = data.generatedImageUrl ?? data.generatedImage;

  // Read the graph at open time rather than subscribing: the pool changes when an edge
  // is added, and `useEdges()` above is already the re-render trigger for that.
  const sources = useMemo(
    () => layerSourcesFromGraph(id, getEdges(), getNodes()),
    // biome-ignore lint/correctness/useExhaustiveDependencies: `edges` IS the signal that
    // the graph moved; getEdges/getNodes are stable readers of the live store.
    [id, edges, getEdges, getNodes],
  );

  const inputConnections = edges.filter(
    (edge) => edge.target === id && (edge.targetHandle ?? null) === LAYER_EDITOR_IMAGE_INPUT_HANDLE,
  ).length;

  const onPersist = useCallback(
    (doc: LayerDoc, aspectRatio: string) => {
      updateNodeData(id, { frame: doc.frame, layers: doc.layers, aspectRatio });
      triggerSave();
    },
    [id, triggerSave, updateNodeData],
  );

  const onCompose = useCallback(
    async (result: ComposeResult) => {
      // Mirror the data URL first so the node paints immediately even if the upload is
      // slow or the canvas is anonymous.
      updateNodeData(id, { generatedImage: result.dataUrl });
      if (brandId) {
        const persisted = await persistLayerComposite({ blob: result.blob, brandId, nodeId: id });
        // The durable coordinates are what let a run register this into the Library:
        // `registerCanvasIfDurable` refuses data: URLs and needs a bucket + path.
        updateNodeData(id, {
          generatedImageUrl: persisted.signedUrl,
          generatedImageBucket: persisted.bucket,
          generatedImageStoragePath: persisted.storagePath,
          renderOutputAssetId: persisted.assetId,
          renderOutputAssetVersionId: persisted.versionId,
        });
      }
      triggerSave();
    },
    [brandId, id, triggerSave, updateNodeData],
  );

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={cn(
                'group relative h-full min-h-[200px] w-full min-w-[200px] rounded-xl transition-shadow',
                isSelectedByOther && 'selected-by-other',
              )}
              style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
              data-testid="layer-editor-node"
            >
              <NodeResizer
                minWidth={200}
                minHeight={200}
                isVisible={selected}
                lineClassName="border-brand-primary/60"
                handleClassName="h-3 w-3 rounded-full border-2 border-background bg-brand-primary"
              />
              <CanvasNode
                handles={{ target: false, source: false }}
                selected={selected}
                className="relative h-full w-full min-w-0 overflow-hidden border-border/60 bg-background p-0 shadow-sm"
              >
                <NodeContent className="nodrag relative min-h-0 flex-1 bg-muted/30 p-0">
                  {preview ? (
                    // biome-ignore lint/performance/noImgElement: canvas nodes paint signed
                    // storage URLs that next/image cannot resolve at build time.
                    <img
                      src={preview}
                      alt="Composed layers"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
                      <Layers className="h-6 w-6 text-muted-foreground" />
                      <p className="text-2xs text-muted-foreground">
                        {inputConnections === 0
                          ? 'Connect images to stack them'
                          : 'Open the editor and compose'}
                      </p>
                    </div>
                  )}

                  <Badge
                    variant="secondary"
                    className="absolute left-2 top-2 z-20 h-5 px-2 text-2xs"
                    data-testid="layer-editor-count"
                  >
                    {`${layers.length} ${layers.length === 1 ? 'layer' : 'layers'}`}
                  </Badge>

                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute right-2 top-2 z-20 h-6 px-2 text-2xs"
                    onClick={() => setOpen(true)}
                  >
                    <SquarePen className="mr-1 h-3 w-3" /> Edit
                  </Button>

                  <div className="absolute bottom-0 left-0 right-0 truncate border-t border-subtle bg-surface/90 px-2 py-1 text-3xs text-secondary backdrop-blur">
                    {`${frame.width} × ${frame.height}`}
                  </div>
                </NodeContent>
              </CanvasNode>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <LimitedHandle
                      type="target"
                      position={Position.Left}
                      id={LAYER_EDITOR_IMAGE_INPUT_HANDLE}
                      maxConnections={LAYER_EDITOR_LAYER_LIMIT}
                      style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
                      className="studio-handle !-left-2 !h-4 !w-4 !border-2 top-1/2 shadow-sm transition-transform hover:scale-125"
                    />
                  }
                />
                <TooltipContent>
                  <p>{`Images in: ${inputConnections} of ${LAYER_EDITOR_LAYER_LIMIT}`}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={LAYER_EDITOR_IMAGE_OUTPUT_HANDLE}
                      style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
                      className="studio-handle !-right-2 !h-4 !w-4 !border-2 top-1/2 shadow-sm transition-transform hover:scale-125"
                    />
                  }
                />
                <TooltipContent>
                  <p>Image output: the composed still</p>
                </TooltipContent>
              </Tooltip>
            </div>
          }
        />
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>Layer Editor</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => setOpen(true)}>
            <SquarePen className="mr-2 h-4 w-4" />
            Open editor
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => deleteNode(id)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <LayerEditorDialog
        open={open}
        onOpenChange={setOpen}
        frame={frame}
        layers={layers}
        sources={sources}
        onPersist={onPersist}
        onCompose={onCompose}
      />
    </TooltipProvider>
  );
}
