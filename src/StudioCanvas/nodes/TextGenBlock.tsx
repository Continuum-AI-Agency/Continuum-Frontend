import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, useEdges } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useStudioStore } from '../stores/useStudioStore';
import { StringNodeData } from '../types';
import { BlockToolbar } from '../components/BlockToolbar';
import { cn } from '@/lib/utils';

export function TextNode({ id, data }: NodeProps<Node<StringNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  
  const edges = useEdges();
  
  // Determine context based on connection
  const connectedEdge = edges.find(e => e.source === id);
  let label = "Text";
  let icon = "📝";
  let borderColor = "border-slate-200";

  if (connectedEdge) {
    if (connectedEdge.targetHandle === 'prompt' || connectedEdge.targetHandle === 'prompt-in') {
      label = "Positive Prompt";
      icon = "✨";
      borderColor = "border-indigo-200";
    } else if (connectedEdge.targetHandle === 'negative') {
      label = "Negative Prompt";
      icon = "🚫";
      borderColor = "border-red-200";
    }
  }

  const [isHovered, setIsHovered] = useState(false);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { value: e.target.value });
  }, [id, updateNodeData]);

  return (
    <div 
      className="relative group" 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <BlockToolbar 
        isVisible={isHovered || !!data.isToolbarVisible}
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
      />

      <Card className={cn("w-64 shadow-sm bg-white transition-colors border-2", borderColor)}>
        <CardHeader className="py-2 px-3 border-b bg-slate-50/50">
          <CardTitle className="text-xs font-medium text-slate-700 flex items-center gap-2">
            <span>{icon}</span> {label}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-3">
          <div className="relative">
            <Textarea 
              value={data.value} 
              onChange={handleChange} 
              className="text-xs min-h-[80px] resize-y border-slate-200 focus:border-indigo-400 focus:ring-indigo-400 bg-white" 
              placeholder="Enter text..." 
            />
            <Handle type="source" position={Position.Right} id="text" className="!bg-indigo-500 !w-3 !h-3" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
