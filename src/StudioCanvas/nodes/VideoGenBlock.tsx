import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, NodeToolbar, HandleProps, useEdges } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStudioStore } from '../stores/useStudioStore';
import { VideoGenNodeData } from '../types';
import { BlockToolbar } from '../components/BlockToolbar';
import { VideoIcon } from '@radix-ui/react-icons';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';

import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

const LimitedHandle = ({ maxConnections, isConnectable, ...props }: HandleProps & { maxConnections?: number }) => {
  const edges = useStudioStore((state) => state.edges);
  
  const checkConnectable = useCallback((params: any) => {
    let baseConnectable = true;
    
    if (typeof isConnectable === 'boolean') {
        baseConnectable = isConnectable;
    } else if (typeof isConnectable === 'function') {
        const result = (isConnectable as Function)(params);
        baseConnectable = result === undefined ? true : result;
    }
    
    if (!baseConnectable) return false;
    
    if (maxConnections) {
      const nodeEdges = edges.filter(
        (e) => (e.target === params.nodeId && e.targetHandle === params.handleId) ||
               (e.source === params.nodeId && e.sourceHandle === params.handleId)
      );
      if (nodeEdges.length >= maxConnections) return false;
    }
    
    return true;
  }, [edges, maxConnections, isConnectable]);

  return <Handle {...props} isConnectable={checkConnectable as any} />;
};

export function VideoGenBlock({ id, data, selected }: NodeProps<Node<VideoGenNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const edges = useEdges();
  const executionControls = useWorkflowExecution();

  const [isHovered, setIsHovered] = useState(false);

  // Calculate connection counts for tooltips
  const promptConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'prompt-in').length;
  const negativeConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'negative').length;
  const refVideoConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'ref-video').length;
  const refImageCount = edges.filter(edge => edge.target === id && edge.targetHandle === 'ref-images').length;
  const firstFrameConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'first-frame').length;
  const lastFrameConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'last-frame').length;

  const handleModelChange = useCallback((value: string) => {
    updateNodeData(id, { model: value as any });
  }, [id, updateNodeData]);

  const handleRun = useCallback(async () => {
    await executeWorkflow(executionControls, { targetNodeId: id });
  }, [executionControls, id]);

  return (
    <TooltipProvider>
      <div
        className="relative group h-full w-full min-w-[300px] min-h-[170px]"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
      <NodeResizer 
        minWidth={300} 
        minHeight={170} 
        isVisible={selected} 
        lineClassName="border-brand-primary/60" 
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />

      <NodeToolbar isVisible={selected} position={Position.Bottom} className="flex gap-2 items-center bg-background/95 backdrop-blur p-1 rounded-md border shadow-sm">
          <Label className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2">Video Block</Label>
          <Select value={data.model} onValueChange={handleModelChange}>
            <SelectTrigger className="h-7 text-xs border-subtle w-32 bg-surface text-primary">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="veo-3.1">Veo 3.1 (Cinematic)</SelectItem>
              <SelectItem value="veo-3.1-fast">Veo 3.1 Fast (Social)</SelectItem>
            </SelectContent>
          </Select>
      </NodeToolbar>

      <BlockToolbar 
        isVisible={isHovered || !!data.isToolbarVisible}
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        onRun={handleRun}
        onDownload={() => console.log('Download video')}
      />

       <Card className="h-full border border-subtle shadow-md bg-surface flex flex-col overflow-hidden">
        <div className="relative flex-1 bg-default/60 group/preview min-h-0">
            <AspectRatio ratio={16 / 9} className="h-full w-full">
            {data.isExecuting ? (
              <div className="w-full h-full flex items-center justify-center bg-default p-4">
                      <Skeleton className="w-full h-full bg-muted" />
              </div>
            ) : data.generatedVideo ? (
              <div className="w-full h-full flex items-center justify-center bg-default">
                      <video
                        src={data.generatedVideo as string}
                        controls
                        className="w-full h-full object-cover"
                      />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-secondary gap-2">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-default text-secondary">
                      <VideoIcon />
                    </EmptyMedia>
                    <EmptyTitle>No Video</EmptyTitle>
                    <EmptyDescription>Generated video will appear here</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
            </AspectRatio>

        </div>
      </Card>

      <div
        className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none"
        style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Handle
              type="source"
              position={Position.Right}
              id="video"
              className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>Generated Video Output</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Handles Container - Outside of Card to prevent clipping */}
      <div className="absolute -left-2 top-0 bottom-0 flex flex-col justify-evenly py-4 pointer-events-none h-full z-20">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="prompt-in"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className={cn(
                "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
                (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
              )}>
                Prompt
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Prompt: {promptConnections}/1</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="negative"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className={cn(
                "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
                (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
              )}>
                Negative Prompt
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Negative Prompt: {negativeConnections}/1</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="ref-images"
                maxConnections={3}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className={cn(
                "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
                (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
              )}>
                Ref Images (Max 3)
              </span>
              {refImageCount > 0 && (
                <div className="absolute left-[-24px] top-1/2 -translate-y-1/2 studio-handle-pill text-[9px] px-1 rounded-full font-bold shadow-sm pointer-events-none">
                  {refImageCount}
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reference Images: {refImageCount}/3</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="ref-video"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className={cn(
                "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
                (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
              )}>
                Ref Video
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reference Video: {refVideoConnections}/1</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="first-frame"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className={cn(
                "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
                (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
              )}>
                First Frame
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>First Frame: {firstFrameConnections}/1</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="last-frame"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className={cn(
                "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
                (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
              )}>
                Last Frame
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Last Frame: {lastFrameConnections}/1</p>
          </TooltipContent>
        </Tooltip>
      </div>
     </div>
    </TooltipProvider>
   );
 }
