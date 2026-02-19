import React, { useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode } from '@xyflow/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useStudioStore } from '../stores/useStudioStore';
import { cn } from '@/lib/utils';
import { NanoGenNodeData } from '../types';
import { CustomHandle } from '../components/CustomHandle';
import { Link2Icon } from '@radix-ui/react-icons';
import { NodeStatus, NodeExecutionStatus } from '../components/NodeStatus';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { Node as CanvasNode, NodeContent, NodeHeader } from '@/components/ai-elements/node';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Sparkles } from 'lucide-react';

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

export function NanoGenNode({ id, data, selected }: NodeProps<ReactFlowNode<NanoGenNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const getConnectedEdges = useStudioStore((state) => state.getConnectedEdges);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const debouncedSave = useDebouncedSave();

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
    updateNodeData(id, { model: value as NanoGenNodeData['model'] });
    triggerSave();
  }, [id, updateNodeData, triggerSave]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { positivePrompt: e.target.value });
    debouncedSave();
  }, [id, updateNodeData, debouncedSave]);



  const handleAspectRatioChange = useCallback((value: string) => {
    updateNodeData(id, { aspectRatio: value });
    triggerSave();
  }, [id, updateNodeData, triggerSave]);

  const handleImageSizeChange = useCallback((value: string) => {
    updateNodeData(id, { imageSize: value as '1K' | '2K' | '4K' });
    triggerSave();
  }, [id, updateNodeData, triggerSave]);

  const ratio = resolveAspectRatioValue(data.aspectRatio);
  const generatorDescription = `Nano Gen • ${data.model === 'nano-banana-pro' ? (data.imageSize || '1K') : 'Flash'} • ${data.aspectRatio || '1:1'}`;

  return (
    <TooltipProvider>
      <div className="relative">
        <CanvasNode
          handles={{ target: false, source: false }}
          selected={selected}
          className={cn(
            "w-80 border border-border/60 bg-background relative transition-shadow p-0 shadow-sm hover:shadow-md",
            isSelectedByOther && "selected-by-other"
          )}
          style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
        >
        <NodeStatus status={status} errorMessage={data.error} />
        <NodeHeader className="!px-3 !py-2 bg-muted/60 border-b border-border/60 flex flex-row items-center justify-between gap-2 rounded-none">
          <div className="text-sm font-medium flex items-center gap-2 whitespace-nowrap text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Nano Gen</span>
          </div>
          <div className="flex gap-1">
            <Select value={data.model} onValueChange={handleModelChange}>
                <SelectTrigger className="h-6 text-[10px] px-2 py-0 border-border/70 bg-background/90 min-w-[60px]">
                    <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="nano-banana">Flash</SelectItem>
                    <SelectItem value="nano-banana-pro">Pro</SelectItem>
                </SelectContent>
            </Select>
            {data.model === 'nano-banana-pro' && (
                <Select value={data.imageSize || '1K'} onValueChange={handleImageSizeChange}>
                    <SelectTrigger className="h-6 w-14 text-[10px] px-2 py-0 border-border/70 bg-background/90">
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
                <SelectTrigger className="h-6 w-16 text-[10px] px-2 py-0 border-border/70 bg-background/90">
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
        </NodeHeader>
        
        <NodeContent className="space-y-4 p-4 bg-muted/20">
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
              <span className="text-[10px] text-brand-primary flex items-center gap-1">
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
                  "text-xs h-20 resize-none bg-background/90 border-border/70",
                  isPromptConnected && "bg-muted/70 text-muted-foreground italic placeholder:text-muted-foreground/70"
                )}
                placeholder={isPromptConnected ? "Using connected prompt node" : "A cyberpunk city..."}
             />
             {isPromptConnected && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <span className="text-xs text-muted-foreground font-medium">Using connected prompt node</span>
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
          <div className="mt-2 text-xs text-brand-primary animate-pulse">
            Generating...
          </div>
        )}

        {data.error && (
          <div className="mt-2 text-xs text-red-600 p-2 bg-red-50/80 rounded border border-red-200">
            {data.error}
          </div>
        )}

        {data.generatedImage && (
          <div className="mt-2 overflow-hidden rounded-md border border-border/70 bg-black/85">
            <AspectRatio ratio={ratio} className="w-full">
              <img src={data.generatedImage as string} alt="Generated" className="h-full w-full object-contain" />
            </AspectRatio>
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
        </NodeContent>
      </CanvasNode>

      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
        {generatorDescription}
      </div>
      </div>
    </TooltipProvider>
  );
}
