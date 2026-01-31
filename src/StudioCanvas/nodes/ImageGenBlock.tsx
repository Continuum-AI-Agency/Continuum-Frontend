import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, NodeToolbar, HandleProps } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStudioStore } from '../stores/useStudioStore';
import { NanoGenNodeData } from '../types';
import { BlockToolbar } from '../components/BlockToolbar';
import { ImageIcon } from '@radix-ui/react-icons';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useToast } from '@/components/ui/ToastProvider';
import { downloadAsset } from '../utils/downloadAsset';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useNodeSelection } from '../contexts/PresenceContext';

const resolveAspectRatioValue = (value?: string) => {
  switch (value) {
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '4:3':
      return 4 / 3;
    case '3:4':
      return 3 / 4;
    case '1:1':
    default:
      return 1;
  }
};

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

export function ImageGenBlock({ id, data, selected }: NodeProps<Node<NanoGenNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const executionControls = useWorkflowExecution();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  
  const [isHovered, setIsHovered] = useState(false);

  const handleModelChange = useCallback((value: string) => {
    updateNodeData(id, { model: value as any });
    triggerSave();
  }, [id, updateNodeData, triggerSave]);

  const handleAspectRatioChange = useCallback((value: string) => {
    updateNodeData(id, { aspectRatio: value });
    triggerSave();
  }, [id, updateNodeData, triggerSave]);

  const handleRun = useCallback(async () => {
    console.info("[studio] run image node", { nodeId: id });
    await executeWorkflow(executionControls, { targetNodeId: id });
  }, [executionControls, id]);

  const previewImage = data.generatedImage;
  const refImageLimit = 14;
  const aspectRatio = data.aspectRatio || '16:9';
  const ratio = resolveAspectRatioValue(aspectRatio);
  const fileBaseName = `image-${id}`;

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: previewImage as string | Blob | undefined,
      baseName: fileBaseName,
      fallbackExtension: 'png',
    });

    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Run the node to generate an image before downloading.',
        variant: 'warning',
      });
    }
  }, [previewImage, fileBaseName, show]);

  return (
    <div 
      className={cn(
        "relative group h-full w-full min-w-[200px] min-h-[200px] rounded-xl transition-shadow",
        isSelectedByOther && "selected-by-other"
      )}
      style={{ 
        ['--other-user-color' as any]: selectingUser?.color 
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <NodeResizer 
        minWidth={200} 
        minHeight={200} 
        isVisible={selected} 
        lineClassName="border-brand-primary/60" 
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />

      <NodeToolbar isVisible={selected} position={Position.Bottom} className="flex gap-2 items-center bg-background/95 backdrop-blur p-1 rounded-md border shadow-sm">
          <Label className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2">Image Generation</Label>
          <Select value={data.model || 'nano-banana'} onValueChange={handleModelChange}>
            <SelectTrigger className="h-7 text-xs border-subtle w-32 bg-surface text-primary">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nano-banana">Nano Banana</SelectItem>
              <SelectItem value="nano-banana-pro">Nano Banana Pro</SelectItem>
            </SelectContent>
          </Select>
          <Select value={data.aspectRatio || '16:9'} onValueChange={handleAspectRatioChange}>
            <SelectTrigger className="h-7 text-xs border-subtle w-20 bg-surface text-primary">
              <SelectValue placeholder="Ratio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1:1">1:1</SelectItem>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="9:16">9:16</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
              <SelectItem value="3:4">3:4</SelectItem>
            </SelectContent>
          </Select>
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
            {data.isExecuting ? (
              <div className="w-full h-full flex items-center justify-center bg-default p-4">
                  <AspectRatio ratio={ratio} className="w-full h-full">
                      <Skeleton className="w-full h-full bg-muted" />
                  </AspectRatio>
              </div>
            ) : previewImage ? (
              <div className="w-full h-full flex items-center justify-center bg-default">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="w-full h-full" onContextMenu={(event) => event.stopPropagation()}>
                      <AspectRatio ratio={ratio} className="w-full h-full">
                        <img
                          src={previewImage as string}
                          alt="Generated Image"
                          className="w-full h-full object-cover"
                        />
                      </AspectRatio>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-[160px]">
                    <ContextMenuItem onClick={handleDownload}>Download Image</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-secondary gap-2">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ImageIcon />
                    </EmptyMedia>
                    <EmptyTitle>No Image</EmptyTitle>
                    <EmptyDescription>Generated image will appear here</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
        </div>
      </Card>

      <div
        className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none"
        style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
      >
        <Handle 
          type="source" 
          position={Position.Right} 
          id="image" 
          className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto" 
        />
      </div>

      {/* Handles Container - Outside of Card to prevent clipping */}
      <div className="absolute -left-2 top-0 bottom-0 flex flex-col justify-evenly py-4 pointer-events-none h-full z-20">
          
          <div
            className="relative pointer-events-auto group/handle"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
          >
            <LimitedHandle 
              type="target" 
              position={Position.Left} 
              id="prompt" 
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
          


          <div
            className="relative pointer-events-auto group/handle"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
          >
            <LimitedHandle 
              type="target" 
              position={Position.Left} 
              id="ref-image" 
              maxConnections={refImageLimit}
              className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125" 
            />
            <span className={cn(
              "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
              (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
            )}>
              Ref Image
            </span>
          </div>
       </div>
    </div>
  );
}
