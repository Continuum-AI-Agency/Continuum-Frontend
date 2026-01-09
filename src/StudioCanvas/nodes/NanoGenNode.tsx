import React, { useCallback } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useStudioStore } from '../stores/useStudioStore';
import { NanoGenNodeData } from '../types';

export function NanoGenNode({ id, data }: NodeProps<Node<NanoGenNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);

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
    <Card className="w-80 border-2 border-indigo-500/20 bg-background/95 backdrop-blur shadow-xl">
      <CardHeader className="py-3 bg-indigo-500/10">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          🍌 Nano Gen
          {data.isExecuting && <span className="animate-spin ml-auto">⚙️</span>}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4 p-4">
        {/* Handles */}
        <Handle type="target" position={Position.Left} id="trigger" className="!bg-emerald-500 !w-3 !h-3" style={{ top: '20%' }} />
        <Handle type="target" position={Position.Left} id="prompt" className="!bg-slate-400 !w-3 !h-3" style={{ top: '50%' }} />

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Model</Label>
          <Select value={data.model} onValueChange={handleModelChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nano-banana">Nano Banana (Fast)</SelectItem>
              <SelectItem value="nano-banana-pro">Banana Pro (Quality)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Prompt</Label>
          <Textarea 
            value={data.positivePrompt} 
            onChange={handlePromptChange} 
            className="text-xs h-20 resize-none" 
            placeholder="A cyberpunk city..." 
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Negative</Label>
          <Input 
            value={data.negativePrompt} 
            onChange={handleNegativeChange} 
            className="h-8 text-xs" 
            placeholder="blurry, bad quality" 
          />
        </div>

        {data.generatedImage && (
          <div className="mt-2 rounded-md overflow-hidden border">
             <img src={data.generatedImage as string} alt="Generated" className="w-full h-auto object-cover" />
          </div>
        )}

        <Handle type="source" position={Position.Right} id="image" className="!bg-indigo-500 !w-3 !h-3" />
      </CardContent>
    </Card>
  );
}
