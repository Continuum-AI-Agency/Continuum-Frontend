import React, { useCallback } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useStudioStore } from '../stores/useStudioStore';
import { StringNodeData } from '../types';

export function StringNode({ id, data }: NodeProps<Node<StringNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { value: e.target.value });
  }, [id, updateNodeData]);

  return (
    <Card className="w-60 border border-slate-200 shadow-sm">
      <CardContent className="p-3">
        <Textarea 
          value={data.value} 
          onChange={handleChange} 
          className="text-xs h-16 resize-none border-none focus-visible:ring-0 p-0" 
          placeholder="Enter text..." 
        />
        <Handle type="source" position={Position.Right} id="text" className="!bg-slate-400 !w-3 !h-3" />
      </CardContent>
    </Card>
  );
}
