import React, { useCallback } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer, useEdges } from '@xyflow/react';
import { Textarea } from '@/components/ui/textarea';
import { useStudioStore } from '../stores/useStudioStore';
import { VideoDecodeNodeData } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Clapperboard } from 'lucide-react';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Copy, Trash2 } from 'lucide-react';

export function VideoDecoderBlock({ id, data, selected }: NodeProps<ReactFlowNode<VideoDecodeNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const edges = useEdges();
  const executionControls = useWorkflowExecution();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const debouncedSave = useDebouncedSave();

  const hasVideoInput = edges.some((edge) => edge.target === id && edge.targetHandle === 'video');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { value: e.target.value });
    debouncedSave();
  }, [id, updateNodeData, debouncedSave]);

  const handleDecode = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (data.isExecuting) return;

    try {
      await executeWorkflow(executionControls, {
        targetNodeId: id,
        clearDownstream: false,
        brandId,
      });
    } catch (err) {
      console.error('Video decode trigger failed', err);
    }
  }, [id, executionControls, data.isExecuting, brandId]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "relative min-w-[300px] min-h-[220px] w-full h-full max-w-[440px] rounded-lg transition-shadow",
            isSelectedByOther && "selected-by-other"
          )}
          style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
        >
          <NodeResizer
            minWidth={300}
            minHeight={220}
            maxWidth={640}
            isVisible={selected}
            lineClassName="border-brand-primary/60"
            handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
          />

          <CanvasNode
            handles={{ target: false, source: false }}
            selected={selected}
            className={cn(
              "border bg-background rounded-lg overflow-hidden transition-all duration-300 h-full w-full flex flex-col min-h-[inherit] shadow-sm hover:shadow-md",
              "border-border/60",
              hasVideoInput && "ring-1 ring-brand-primary/30"
            )}
          >
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-muted/40 text-[11px] font-semibold tracking-wide text-muted-foreground shrink-0">
              <Clapperboard className="h-3.5 w-3.5" />
              <span>Video Decoder</span>
            </div>

            <NodeContent className="relative flex-1 flex flex-col min-h-0 overflow-hidden p-0 bg-muted/20">
              <Textarea
                value={data.value}
                onChange={handleChange}
                onKeyDown={(event) => event.stopPropagation()}
                className="nodrag text-xs text-primary placeholder:text-muted-foreground/70 flex-1 w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none bg-transparent p-3 pr-8 overflow-y-auto whitespace-pre-wrap break-words block h-full min-h-[120px]"
                placeholder="Connect a video, then Decode to extract a frame-by-frame creative breakdown..."
              />

              {data.error ? (
                <div className="px-3 py-1.5 text-[10px] text-destructive border-t border-destructive/30 bg-destructive/5 shrink-0">
                  {data.error}
                </div>
              ) : null}

              <div className="p-2 border-t border-border/60 bg-background/70 flex justify-end relative z-20 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 px-3 text-[10px] shadow-sm nodrag cursor-pointer"
                  onClick={handleDecode}
                  disabled={data.isExecuting}
                >
                  {data.isExecuting ? (
                    <div className="flex items-center gap-1.5">
                      <div className="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full" />
                      <span>Decoding...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Clapperboard className="w-3.5 h-3.5" />
                      <span className="font-semibold tracking-wide">Decode Video</span>
                    </div>
                  )}
                </Button>
              </div>
            </NodeContent>
          </CanvasNode>

          <div className="absolute -left-2 top-10 flex flex-col gap-3 z-10">
            <Handle
              type="target"
              position={Position.Left}
              id="video"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
              className="studio-handle !w-3 !h-3 !border-2 shadow-sm transition-transform hover:scale-125"
            />
          </div>

          <div
            className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
          >
            <Handle
              type="source"
              position={Position.Right}
              id="text"
              className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-all duration-300 hover:scale-125 pointer-events-auto"
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel>Video Decoder</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => void handleDecode()}>
          <Clapperboard className="mr-2 h-4 w-4" />
          Decode Video
          <ContextMenuShortcut>R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => duplicateNode(id)}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteNode(id)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
