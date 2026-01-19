import React, { useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStudioStore } from '../stores/useStudioStore';
import { cn } from '@/lib/utils';
import { NanoGenNodeData } from '../types';
import { CustomHandle } from '../components/CustomHandle';
import { Link2Icon } from '@radix-ui/react-icons';
import { NodeStatus, NodeExecutionStatus } from '../components/NodeStatus';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function NanoGenNode({ id, data }: NodeProps<Node<NanoGenNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const getConnectedEdges = useStudioStore((state) => state.getConnectedEdges);

  // Count active connections
  const connectedEdges = getConnectedEdges(id, 'target');
  const refImageCount = connectedEdges.filter(e => e.targetHandle === 'ref-images').length;
  const isPromptConnected = connectedEdges.some(e => e.targetHandle === 'prompt');

  const status: NodeExecutionStatus = useMemo(() => {
    if (data.isExecuting) return 'running';
    if (data.error) return 'error';
    if (data.generatedImage) return 'success';
    return 'idle';
  }, [data.isExecuting, data.error, data.generatedImage]);

  const handleModelChange = useCallback((value: string) => {
    updateNodeData(id, { model: value as any });
  }, [id, updateNodeData]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { positivePrompt: e.target.value });
  }, [id, updateNodeData]);



  const handleAspectRatioChange = useCallback((value: string) => {
    updateNodeData(id, { aspectRatio: value });
  }, [id, updateNodeData]);

  const handleImageSizeChange = useCallback((value: string) => {
    updateNodeData(id, { imageSize: value as '1K' | '2K' | '4K' });
  }, [id, updateNodeData]);

  return (
    <TooltipProvider>
      <Card className="w-80 border-2 border-indigo-500/20 bg-background/95 backdrop-blur shadow-xl relative">
      <NodeStatus status={status} errorMessage={data.error} />
      <CardHeader className="py-3 bg-indigo-500/10 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 whitespace-nowrap">
          🍌 Nano Gen
        </CardTitle>
        <div className="flex gap-1">
            <Select value={data.model} onValueChange={handleModelChange}>
                <SelectTrigger className="h-6 text-[10px] px-2 py-0 border-subtle bg-background/50 min-w-[60px]">
                    <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="nano-banana">Flash</SelectItem>
                    <SelectItem value="nano-banana-pro">Pro</SelectItem>
                </SelectContent>
            </Select>
            {data.model === 'nano-banana-pro' && (
                <Select value={data.imageSize || '1K'} onValueChange={handleImageSizeChange}>
                    <SelectTrigger className="h-6 w-14 text-[10px] px-2 py-0 border-subtle bg-background/50">
                        <SelectValue placeholder="Size" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1K">1K</SelectItem>
                        <SelectItem value="2K">2K</SelectItem>
                        <SelectItem value="4K">4K</SelectItem>
                    </SelectContent>
                </Select>
            )}
            <Select value={data.aspectRatio || '16:9'} onValueChange={handleAspectRatioChange}>
                <SelectTrigger className="h-6 w-16 text-[10px] px-2 py-0 border-subtle bg-background/50">
                    <SelectValue placeholder="Ratio" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="16:9">16:9</SelectItem>
                    <SelectItem value="9:16">9:16</SelectItem>
                    <SelectItem value="1:1">1:1</SelectItem>
                    <SelectItem value="4:3">4:3</SelectItem>
                    <SelectItem value="3:4">3:4</SelectItem>
                </SelectContent>
            </Select>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 p-4">
        {/* Handles */}
        <CustomHandle 
          type="target" 
          position={Position.Left} 
          id="trigger" 
          maxConnections={1}
          style={{ top: '20%', ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
          className="studio-handle !w-3 !h-3" 
        />
        <CustomHandle 
          type="target" 
          position={Position.Left} 
          id="ref-images" 
          maxConnections={14}
          style={{ top: '35%', ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
          className="studio-handle !w-3 !h-3" 
          title="Reference Images (Max 14)"
        />
        {refImageCount > 0 && (
          <div
            className="absolute left-[-24px] top-[32%] studio-handle-pill text-[9px] px-1 rounded-full font-bold shadow-sm pointer-events-none"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
          >
            {refImageCount}
          </div>
        )}
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Prompt</Label>
            {isPromptConnected && (
              <span className="text-[10px] text-indigo-500 flex items-center gap-1">
                <Link2Icon className="w-3 h-3" /> Linked
              </span>
            )}
          </div>
          <div className="relative">
             <Textarea
                value={isPromptConnected ? '' : data.positivePrompt}
                onChange={handlePromptChange}
                disabled={isPromptConnected}
                className={cn(
                  "text-xs h-20 resize-none",
                  isPromptConnected && "bg-indigo-50/50 text-indigo-600 italic placeholder:text-indigo-400"
                )}
                placeholder={isPromptConnected ? "Using connected prompt node" : "A cyberpunk city..."}
             />
             {isPromptConnected && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <span className="text-xs text-indigo-600 font-medium">Using connected prompt node</span>
               </div>
             )}
             <CustomHandle 
               type="target" 
               position={Position.Left} 
               id="prompt" 
               maxConnections={1}
               style={{ top: '50%', left: '-18px', ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
               className="studio-handle !w-3 !h-3" 
             />
          </div>
        </div>



        {data.isExecuting && (
          <div className="mt-2 text-xs text-indigo-500 animate-pulse">
            Generating...
          </div>
        )}

        {data.error && (
          <div className="mt-2 text-xs text-red-500 p-2 bg-red-50 rounded">
            {data.error}
          </div>
        )}

        {data.generatedImage && (
          <div className="mt-2 rounded-md overflow-hidden border">
             <img src={data.generatedImage as string} alt="Generated" className="w-full h-auto object-cover" />
          </div>
        )}

        {/* Output Handle */}
        <Tooltip>
          <TooltipTrigger>
            <Handle
              type="source"
              position={Position.Right}
              id="image"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
              className="studio-handle !w-3 !h-3"
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>Generated Image Output</p>
          </TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
