import React, { useCallback } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useStudioStore } from '../stores/useStudioStore';
import { VeoDirectorNodeData } from '../types';
import { CustomHandle } from '../components/CustomHandle';

export function VeoDirectorNode({ id, data }: NodeProps<Node<VeoDirectorNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);

  const handleModelChange = useCallback((value: string) => {
    updateNodeData(id, { model: value as any });
  }, [id, updateNodeData]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { prompt: e.target.value });
  }, [id, updateNodeData]);

  const handleEnhanceChange = useCallback((checked: boolean) => {
    updateNodeData(id, { enhancePrompt: checked });
  }, [id, updateNodeData]);

  return (
    <Card className="w-80 border-2 border-purple-500/20 bg-background/95 backdrop-blur shadow-xl">
      <CardHeader className="py-3 bg-purple-500/10">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          🎥 Veo Director (Model)
          {data.isExecuting && <span className="animate-spin ml-auto">⚙️</span>}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4 p-4 relative">
        <div className="absolute left-0 top-16 flex flex-col gap-4 -ml-1.5">
           <CustomHandle 
             type="target" 
             position={Position.Left} 
             id="first-frame" 
             maxConnections={1}
             className="relative !bg-indigo-500 !w-3 !h-3 mb-4" 
             title="First frame"
           />
           <CustomHandle 
             type="target" 
             position={Position.Left} 
             id="last-frame" 
             maxConnections={1}
             className="relative !bg-indigo-500 !w-3 !h-3 mb-4" 
             title="Last frame"
           />
           <CustomHandle 
             type="target" 
             position={Position.Left} 
             id="ref-image" 
             maxConnections={3}
             className="relative !bg-indigo-500 !w-3 !h-3" 
             title="Reference image"
           />
        </div>
        
        <CustomHandle 
          type="target" 
          position={Position.Left} 
          id="prompt-in" 
          maxConnections={1}
          className="!bg-slate-400 !w-3 !h-3" 
          style={{ top: '55%' }}
        />

        <div className="space-y-2 pl-2">
          <Label className="text-xs text-muted-foreground">Model</Label>
          <Select value={data.model} onValueChange={handleModelChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="veo-3.1">Veo 3.1 (Cinematic)</SelectItem>
              <SelectItem value="veo-3.1-fast">Veo Fast (Social)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 pl-2">
          <Label className="text-xs text-muted-foreground">Motion Prompt</Label>
          <Textarea 
            value={data.prompt} 
            onChange={handlePromptChange} 
            className="text-xs h-20 resize-none" 
            placeholder="Camera pans slowly..." 
          />
        </div>

        <div className="flex items-center space-x-2 pl-2">
          <Switch id="enhance" checked={data.enhancePrompt} onCheckedChange={handleEnhanceChange} />
          <Label htmlFor="enhance" className="text-xs">Enhance Prompt</Label>
        </div>

        {data.isExecuting && (
          <div className="mt-2 text-xs text-purple-500 animate-pulse pl-2">
            Generating Video...
          </div>
        )}

        {data.error && (
          <div className="mt-2 text-xs text-red-500 p-2 bg-red-50 rounded mx-2">
            {data.error}
          </div>
        )}

        {data.generatedVideo && (
          <div className="mt-2 rounded-md overflow-hidden border aspect-video bg-black">
            <video src={data.generatedVideo as string} controls className="w-full h-full" />
          </div>
        )}

        <Handle type="source" position={Position.Right} id="video" className="!bg-purple-500 !w-3 !h-3" />
      </CardContent>
    </Card>
  );
}
