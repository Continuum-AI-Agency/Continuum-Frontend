import React, { useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStudioStore } from '../stores/useStudioStore';
import { NanoGenNodeData } from '../types';
import { CustomHandle } from '../components/CustomHandle';
import { Link2Icon } from '@radix-ui/react-icons';
import { NodeStatus, NodeExecutionStatus } from '../components/NodeStatus';

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

  const handleNegativeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateNodeData(id, { negativePrompt: e.target.value });
  }, [id, updateNodeData]);

  return (
    <Card className="w-80 border-2 border-indigo-500/20 bg-background/95 backdrop-blur shadow-xl relative">
      <NodeStatus status={status} errorMessage={data.error} />
      <CardHeader className="py-3 bg-indigo-500/10">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          🍌 Nano Gen (Model)
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4 p-4">
        {/* Handles */}
        <CustomHandle 
          type="target" 
          position={Position.Left} 
          id="trigger" 
          maxConnections={1}
          className="!bg-emerald-500 !w-3 !h-3" 
          style={{ top: '20%' }}
        />
        <CustomHandle 
          type="target" 
          position={Position.Left} 
          id="ref-images" 
          maxConnections={14}
          className="!bg-indigo-500 !w-3 !h-3" 
          style={{ top: '35%' }}
          title="Reference Images (Max 14)"
        />
        {refImageCount > 0 && (
          <div className="absolute left-[-24px] top-[32%] bg-indigo-500 text-white text-[9px] px-1 rounded-full font-bold shadow-sm pointer-events-none">
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
             {isPromptConnected ? (
                <div className="h-20 w-full rounded-md border border-indigo-200 bg-indigo-50/50 p-2 text-xs text-indigo-600 flex items-center justify-center text-center italic">
                  Using connected prompt node
                </div>
             ) : (
                <Textarea 
                   value={data.positivePrompt} 
                   onChange={handlePromptChange} 
                   className="text-xs h-20 resize-none" 
                   placeholder="A cyberpunk city..." 
                />
             )}
             <CustomHandle 
               type="target" 
               position={Position.Left} 
               id="prompt" 
               maxConnections={1}
               className="!bg-slate-400 !w-3 !h-3" 
               style={{ top: '50%', left: '-18px' }}
             />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Negative</Label>
          <div className="relative">
             <Input 
                value={data.negativePrompt} 
                onChange={handleNegativeChange} 
                className="h-8 text-xs" 
                placeholder="blurry, bad quality" 
             />
             <CustomHandle 
               type="target" 
               position={Position.Left} 
               id="negative" 
               maxConnections={1}
               className="!bg-slate-400 !w-3 !h-3" 
               style={{ top: '50%', left: '-18px' }}
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
        <Handle type="source" position={Position.Right} id="image" className="!bg-indigo-500 !w-3 !h-3" />
      </CardContent>
    </Card>
  );
}
