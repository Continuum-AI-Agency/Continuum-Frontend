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
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold">
          <Camera className="size-3.5" />
          Continuity Frame
        </div>
        <NodeContent className="flex h-full flex-col gap-2 p-2">
          <div className="flex gap-2">
            <select
              className="nodrag h-8 flex-1 rounded-md border bg-background px-2 text-xs"
              value={selector}
              onChange={(event) =>
                updateNodeData(id, {
                  selector: event.target.value as FrameExtractNodeData['selector'],
                })
              }
            >
              <option value="first">First frame</option>
              <option value="last">Last frame</option>
              <option value="timestamp">Timestamp</option>
            </select>
            {selector === 'timestamp' ? (
              <Input
                className="nodrag h-8 w-20 text-xs"
                type="number"
                min={0}
                step={0.1}
                value={data.timestampSec ?? 0}
                onChange={(event) =>
                  updateNodeData(id, { timestampSec: Number(event.target.value) })
                }
                aria-label="Frame timestamp in seconds"
              />
            ) : null}
          </div>
          <div className="flex min-h-24 flex-1 items-center justify-center overflow-hidden rounded border bg-black/90">
            {data.generatedImage ? (
              // biome-ignore lint/performance/noImgElement: data URLs and signed rendition URLs are valid here.
              <img
                src={data.generatedImage}
                alt={`${selector} extracted video frame`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="px-3 text-center text-xs text-white/60">
                {hasVideo ? 'Ready to extract' : 'Connect a video'}
              </span>
            )}
          </div>
          {data.error ? <p className="text-xs text-destructive">{data.error}</p> : null}
          <Button
            className="nodrag h-8"
            size="sm"
            disabled={!hasVideo || data.isExecuting}
            onClick={() => void extract()}
          >
            {data.isExecuting ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
            Extract frame
          </Button>
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
