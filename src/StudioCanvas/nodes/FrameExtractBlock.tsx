import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
} from '@xyflow/react';
import { Camera, Loader2 } from 'lucide-react';
import type React from 'react';
import { useCallback } from 'react';

import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { FrameExtractNodeData } from '../types';
import { executeWorkflow } from '../utils/executeWorkflow';
import { NodeOverlayNote, NodeTitleBar } from './NodeChrome';

export function FrameExtractBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<FrameExtractNodeData>>) {
  const edges = useEdges();
  const executionControls = useWorkflowExecution();
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const brandId = useStudioStore((state) => state.brandId);
  const roomId = useStudioStore((state) => state.activeRoomId);
  const hasVideo = edges.some((edge) => edge.target === id && edge.targetHandle === 'video');
  const selector = data.selector ?? 'last';

  const extract = useCallback(async () => {
    await executeWorkflow(executionControls, {
      targetNodeId: id,
      clearDownstream: false,
      brandId,
      roomId,
    });
  }, [brandId, executionControls, id, roomId]);

  return (
    <div className="relative size-full min-h-[220px] min-w-[280px]">
      <NodeResizer
        minWidth={280}
        minHeight={220}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
      />
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="size-full overflow-hidden border-border/60 bg-background"
      >
        <NodeTitleBar icon={Camera} label="Continuity Frame">
          <select
            className="nodrag h-5 rounded-sm border border-border/60 bg-background px-1 text-[10px]"
            value={selector}
            aria-label="Which frame to extract"
            onChange={(event) =>
              updateNodeData(id, {
                selector: event.target.value as FrameExtractNodeData['selector'],
              })
            }
          >
            <option value="first">First</option>
            <option value="last">Last</option>
            <option value="timestamp">At time</option>
          </select>
          {selector === 'timestamp' ? (
            <Input
              className="nodrag h-5 w-12 px-1 text-[10px]"
              type="number"
              min={0}
              step={0.1}
              value={data.timestampSec ?? 0}
              onChange={(event) => updateNodeData(id, { timestampSec: Number(event.target.value) })}
              aria-label="Frame timestamp in seconds"
            />
          ) : null}
        </NodeTitleBar>
        <NodeContent className="group/preview relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30 p-0">
          {data.generatedImage ? (
            // biome-ignore lint/performance/noImgElement: data URLs and signed rendition URLs are valid here.
            <img
              src={data.generatedImage}
              alt={`${selector} extracted video frame`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="px-3 text-center text-xs text-muted-foreground">
              {hasVideo ? 'Ready to extract' : 'Connect a video'}
            </span>
          )}
          <Button
            className="nodrag absolute right-1.5 bottom-1.5 z-10 h-6 px-2 text-[11px] opacity-70 transition-opacity group-hover/preview:opacity-100 focus-visible:opacity-100"
            size="sm"
            disabled={!hasVideo || data.isExecuting}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void extract()}
          >
            {data.isExecuting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
            Extract
          </Button>
          {data.error ? <NodeOverlayNote tone="destructive">{data.error}</NodeOverlayNote> : null}
        </NodeContent>
      </CanvasNode>
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        className="studio-handle !size-3"
        style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        className="studio-handle !size-3"
        style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
      />
    </div>
  );
}
