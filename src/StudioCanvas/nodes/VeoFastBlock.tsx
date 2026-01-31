import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, NodeToolbar, HandleProps, useEdges, type Edge } from '@xyflow/react';
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
import { useToast } from '@/components/ui/ToastProvider';
import { downloadAsset } from '../utils/downloadAsset';
import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useNodeSelection } from '../contexts/PresenceContext';

const LimitedHandle = ({ maxConnections, isConnectable, ...props }: HandleProps & { maxConnections?: number }) => {
  
  const checkConnectable = useCallback((params: { node: Node; connectedEdges: Edge[] }) => {
    const { connectedEdges } = params;
    
    let baseConnectable = true;
    
    if (typeof isConnectable === 'boolean') {
        baseConnectable = isConnectable;
    } else if (typeof isConnectable === 'function') {
        baseConnectable = (isConnectable as Function)(params);
    }
    
    if (!baseConnectable) return false;
    
    if (maxConnections) {
      const handleId = props.id;
      const connectionCount = connectedEdges.filter(
        (e) => e.targetHandle === handleId || e.sourceHandle === handleId
      ).length;
      
      if (connectionCount >= maxConnections) return false;
    }
    
    return true;
  }, [maxConnections, isConnectable, props.id]);

  return <Handle {...props} isConnectable={checkConnectable as any} />;
};

export function VeoFastBlock({ id, data, selected }: NodeProps<Node<VideoGenNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const flowEdges = useEdges();
  const executionControls = useWorkflowExecution();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  const [isHovered, setIsHovered] = useState(false);

  // Calculate connection counts for tooltips
  const promptConnections = flowEdges.filter(edge => edge.target === id && edge.targetHandle === 'prompt-in').length;
  const negativeConnections = flowEdges.filter(edge => edge.target === id && edge.targetHandle === 'negative').length;
  const firstFrameConnections = flowEdges.filter(edge => edge.target === id && edge.targetHandle === 'first-frame').length;
  const lastFrameConnections = flowEdges.filter(edge => edge.target === id && edge.targetHandle === 'last-frame').length;

  const handleAspectRatioChange = useCallback((value: string) => {
    updateNodeData(id, { aspectRatio: value as '16:9' | '9:16' });
    triggerSave();
  }, [id, updateNodeData, triggerSave]);

  const handleRun = useCallback(async () => {
    console.info("[studio] run veo-fast node", { nodeId: id });
    await executeWorkflow(executionControls, { targetNodeId: id });
  }, [executionControls, id]);

  const fileBaseName = `video-${id}`;

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: data.generatedVideo as string | Blob | undefined,
      baseName: fileBaseName,
      fallbackExtension: 'mp4',
    });

    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Run the node to generate a video before downloading.',
        variant: 'warning',
      });
    }
  }, [data.generatedVideo, fileBaseName, show]);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "relative group h-full w-full min-w-[300px] min-h-[170px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ 
          ['--other-user-color' as any]: selectingUser?.color 
        }}
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
          <Label className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2">Veo 3.1 Fast</Label>
          <Select value={data.aspectRatio ?? '16:9'} onValueChange={handleAspectRatioChange}>
            <SelectTrigger className="h-7 text-xs border-subtle w-20 bg-surface text-primary">
              <SelectValue placeholder="Ratio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="9:16">9:16</SelectItem>
            </SelectContent>
          </Select>
          <Select 
            value={(data as any).resolution ?? '720p'} 
            onValueChange={(val) => {
              updateNodeData(id, { resolution: val });
              triggerSave();
            }}
          >
            <SelectTrigger className="h-7 text-xs border-subtle w-20 bg-surface text-primary">
              <SelectValue placeholder="Res" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="720p">720p</SelectItem>
              <SelectItem value="1080p">1080p</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 border-l border-subtle pl-2">
            <span className="text-[10px] font-medium text-secondary px-2">First/Last Frame Only</span>
          </div>
      </NodeToolbar>

      <BlockToolbar 
        isVisible={isHovered || !!data.isToolbarVisible}
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        onRun={handleRun}
        onDownload={handleDownload}
      />

       <Card className="h-full border border-subtle shadow-md bg-surface flex flex-col overflow-hidden">
        <div className="relative flex-1 bg-default/60 group/preview min-h-0">
            <AspectRatio ratio={(data.aspectRatio ?? '16:9') === '16:9' ? 16 / 9 : 9 / 16} className="h-full w-full">
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

        {/* Always Frames Mode for Veo Fast */}
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
