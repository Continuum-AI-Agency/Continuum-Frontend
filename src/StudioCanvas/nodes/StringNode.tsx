import React, { useCallback } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useStudioStore } from '../stores/useStudioStore';
import { StringNodeData } from '../types';

export function StringNode({ id, data }: NodeProps<Node<StringNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { value: e.target.value });
  }, [id, updateNodeData]);

  return (
    <Card className="w-60 border border-slate-200 shadow-sm bg-slate-50/50">
      <CardHeader className="py-2 px-3 border-b bg-slate-100/50">
        <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>📝</span> Prompt / Text
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <Textarea 
          value={data.value} 
          onChange={handleChange} 
          className="text-xs h-24 resize-none border-slate-200 focus:border-indigo-400 focus:ring-indigo-400 bg-white" 
          placeholder="Enter prompt text here..." 
        />
        <Handle type="source" position={Position.Right} id="text" className="!bg-slate-400 !w-3 !h-3" />
      </CardContent>
    </Card>
  );
}
