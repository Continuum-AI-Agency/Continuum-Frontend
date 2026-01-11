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

export function ImageGenBlock({ id, data, selected }: NodeProps<Node<NanoGenNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  
  const [isHovered, setIsHovered] = useState(false);

  const handleModelChange = useCallback((value: string) => {
    updateNodeData(id, { model: value as any });
  }, [id, updateNodeData]);

  const handleAspectRatioChange = useCallback((value: string) => {
    updateNodeData(id, { aspectRatio: value });
  }, [id, updateNodeData]);

  const previewImage = data.generatedImage;
  const refImageLimit = data.model === 'nano-banana-pro' ? 4 : 1;

  return (
    <div 
      className="relative group h-full w-full min-w-[200px] min-h-[200px]" 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <NodeResizer 
        minWidth={200} 
        minHeight={200} 
        isVisible={selected} 
        lineClassName="border-indigo-400" 
        handleClassName="h-3 w-3 bg-indigo-500 border-2 border-white rounded-full"
      />

      <NodeToolbar isVisible={selected} position={Position.Top} className="flex gap-2 items-center bg-background/95 backdrop-blur p-1 rounded-md border shadow-sm">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">Image Generation</Label>
          <Select value={data.model || 'nano-banana'} onValueChange={handleModelChange}>
            <SelectTrigger className="h-7 text-xs border-slate-200 w-32 bg-white">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nano-banana">Nano Banana</SelectItem>
              <SelectItem value="nano-banana-pro">Nano Banana Pro</SelectItem>
            </SelectContent>
          </Select>
          <Select value={data.aspectRatio || '1:1'} onValueChange={handleAspectRatioChange}>
            <SelectTrigger className="h-7 text-xs border-slate-200 w-20 bg-white">
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
        onRun={() => console.log('Run image node')}
        onDownload={() => console.log('Download image')}
      />

      <Card className="h-full border-2 border-slate-200 shadow-md bg-white flex flex-col overflow-hidden">
        <div className="relative flex-1 bg-slate-100 group/preview min-h-0">
            {data.isExecuting ? (
              <div className="w-full h-full flex items-center justify-center bg-slate-950 p-4">
                  <AspectRatio ratio={1 / 1} className="w-full h-full">
                      <Skeleton className="w-full h-full bg-slate-800" />
                  </AspectRatio>
              </div>
            ) : previewImage ? (
              <div className="w-full h-full flex items-center justify-center bg-slate-950">
                  <AspectRatio ratio={1 / 1} className="w-full h-full">
                      <img
                        src={previewImage as string}
                        alt="Generated Image"
                        className="w-full h-full object-cover"
                      />
                  </AspectRatio>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
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
