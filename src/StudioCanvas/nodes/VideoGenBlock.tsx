import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, NodeToolbar, HandleProps, useEdges } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { VideoGenNodeData } from '../types';
import { BlockToolbar } from '../components/BlockToolbar';
import { VideoIcon } from '@radix-ui/react-icons';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

  const [isHovered, setIsHovered] = useState(false);

  // Calculate connection counts for tooltips
  const promptConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'prompt-in').length;
  const refVideoConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'ref-video').length;
  const refImageCount = edges.filter(edge => edge.target === id && edge.targetHandle === 'ref-images').length;
  const firstFrameConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'first-frame').length;
  const lastFrameConnections = edges.filter(edge => edge.target === id && edge.targetHandle === 'last-frame').length;

  const handleModelChange = useCallback((value: string) => {
    updateNodeData(id, { model: value as any });
  }, [id, updateNodeData]);

  const handleNegativeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateNodeData(id, { negativePrompt: e.target.value });
  }, [id, updateNodeData]);

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
        lineClassName="border-purple-400" 
        handleClassName="h-3 w-3 bg-purple-500 border-2 border-white rounded-full"
      />

      <NodeToolbar isVisible={selected} position={Position.Top} className="flex gap-2 items-center bg-background/95 backdrop-blur p-1 rounded-md border shadow-sm">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">Video Block</Label>
          <Select value={data.model} onValueChange={handleModelChange}>
            <SelectTrigger className="h-7 text-xs border-slate-200 w-32 bg-white">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="veo-3.1">Veo 3.1 (Cinematic)</SelectItem>
              <SelectItem value="veo-3.1-fast">Veo Fast (Social)</SelectItem>
            </SelectContent>
          </Select>
      </NodeToolbar>

      <BlockToolbar 
        isVisible={isHovered || !!data.isToolbarVisible}
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        onRun={() => console.log('Run video node')}
        onDownload={() => console.log('Download video')}
      />

       <Card className="h-full border-2 border-slate-200 shadow-md bg-white flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Negative Prompt</Label>
            <Input
              value={data.negativePrompt || ''}
              onChange={handleNegativeChange}
              className="h-8 text-xs"
              placeholder="blurry, low quality, distorted"
            />
          </div>
        </div>
        <div className="relative flex-1 bg-black group/preview min-h-0">
           {data.generatedVideo ? (
             <div className="w-full h-full flex items-center justify-center bg-black">
                 <AspectRatio ratio={16 / 9} className="w-full h-full">
                     <video 
                       src={data.generatedVideo as string} 
                       controls 
                       className="w-full h-full object-cover"
                     />
                 </AspectRatio>
             </div>
           ) : (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
               <Empty className="text-slate-400">
                 <EmptyHeader>
                   <EmptyMedia variant="icon" className="bg-slate-800 text-slate-400">
                     <VideoIcon />
                   </EmptyMedia>
                   <EmptyTitle>No Video</EmptyTitle>
                   <EmptyDescription>Generated video will appear here</EmptyDescription>
                 </EmptyHeader>
               </Empty>
             </div>
           )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="video"
                  className="!w-4 !h-4 !bg-purple-500 !border-2 !border-white shadow-sm !-right-2 transition-transform hover:scale-125"
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>Generated Video Output</p>
              </TooltipContent>
            </Tooltip>
        </div>
      </Card>

      {/* Handles Container - Outside of Card to prevent clipping */}
      <div className="absolute -left-2 top-0 bottom-0 flex flex-col justify-evenly py-4 pointer-events-none h-full z-20">
          
           <Tooltip>
             <TooltipTrigger asChild>
           <div className="relative pointer-events-auto group/handle">
             <LimitedHandle
               type="target"
               position={Position.Left}
               id="prompt-in"
               maxConnections={1}
               className="!w-4 !h-4 !bg-indigo-500 !border-2 !border-white shadow-sm transition-transform hover:scale-125"
             />
             <span className={cn(
               "absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white bg-indigo-500 px-2 py-1 rounded-md shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
               (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
             )}>
               Prompt
             </span>
           </div>

           <Tooltip>
             <TooltipTrigger asChild>
               <div className="relative pointer-events-auto group/handle">
                 <LimitedHandle
                   type="target"
                   position={Position.Left}
                   id="ref-images"
                   maxConnections={3}
                   className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white shadow-sm transition-transform hover:scale-125"
                 />
                 <span className={cn(
                   "absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white bg-blue-500 px-2 py-1 rounded-md shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
                   (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
                 )}>
                   Ref Images (Max 3)
                 </span>
                 {refImageCount > 0 && (
                   <div className="absolute left-[-24px] top-1/2 -translate-y-1/2 bg-blue-500 text-white text-[9px] px-1 rounded-full font-bold shadow-sm pointer-events-none">
                     {refImageCount}
                   </div>
                 )}
               </div>
             </TooltipTrigger>
             <TooltipContent>
               <p>Reference Images: {refImageCount}/3</p>
             </TooltipContent>
           </Tooltip>
             </TooltipTrigger>
             <TooltipContent>
               <p>Prompt: {promptConnections}/1</p>
             </TooltipContent>
           </Tooltip>
          
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="relative pointer-events-auto group/handle">
                 <LimitedHandle
                   type="target"
                   position={Position.Left}
                   id="ref-video"
                   maxConnections={1}
                   className="!w-4 !h-4 !bg-pink-500 !border-2 !border-white shadow-sm transition-transform hover:scale-125"
                 />
                 <span className={cn(
                   "absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white bg-pink-500 px-2 py-1 rounded-md shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
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
               <div className="relative pointer-events-auto group/handle">
                 <LimitedHandle
                   type="target"
                   position={Position.Left}
                   id="first-frame"
                   maxConnections={1}
                   className="!w-4 !h-4 !bg-emerald-500 !border-2 !border-white shadow-sm transition-transform hover:scale-125"
                 />
                 <span className={cn(
                   "absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white bg-emerald-500 px-2 py-1 rounded-md shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
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
               <div className="relative pointer-events-auto group/handle">
                 <LimitedHandle
                   type="target"
                   position={Position.Left}
                   id="last-frame"
                   maxConnections={1}
                   className="!w-4 !h-4 !bg-orange-500 !border-2 !border-white shadow-sm transition-transform hover:scale-125"
                 />
                 <span className={cn(
                   "absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white bg-orange-500 px-2 py-1 rounded-md shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
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
