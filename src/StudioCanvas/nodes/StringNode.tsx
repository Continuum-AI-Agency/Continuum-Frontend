import React, { useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node, useEdges } from '@xyflow/react';
import { Textarea } from '@/components/ui/textarea';
import { useStudioStore } from '../stores/useStudioStore';
import { StringNodeData } from '../types';
import { cn } from '@/lib/utils';

export function StringNode({ id, data, selected }: NodeProps<Node<StringNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const edges = useEdges();
  
  const connectedEdge = edges.find(e => e.source === id);
  
  const context = useMemo(() => {
    if (!connectedEdge) return { label: 'Text', icon: '📝', color: 'bg-slate-400', border: 'border-slate-200' };
    
    if (connectedEdge.targetHandle === 'prompt' || connectedEdge.targetHandle === 'prompt-in') {
      return { label: 'Positive Prompt', icon: '✨', color: 'bg-indigo-500', border: 'border-indigo-400 shadow-indigo-100' };
    }
    
    if (connectedEdge.targetHandle === 'negative') {
      return { label: 'Negative Prompt', icon: '🚫', color: 'bg-red-500', border: 'border-red-400 shadow-red-100' };
    }
    
    return { label: 'Text', icon: '📝', color: 'bg-slate-400', border: 'border-slate-200' };
  }, [connectedEdge]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { value: e.target.value });
  }, [id, updateNodeData]);

  return (
    <div className={cn(
        "w-60 border-2 shadow-md bg-white rounded-lg overflow-hidden transition-all duration-300", 
        context.border
    )}>
        <div className="bg-slate-50/80 px-3 py-1 border-b flex items-center gap-1.5 min-h-[24px]">
            <span className="text-[10px] grayscale brightness-125">{context.icon}</span>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{context.label}</span>
        </div>
        <div className="relative">
            <Textarea 
            value={data.value} 
            onChange={handleChange} 
            className="text-xs min-h-[80px] w-full resize-y border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none bg-transparent p-3 pr-8" 
            placeholder="Enter prompt..." 
            />
            
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none">
              <Handle 
                type="source" 
                position={Position.Right} 
                id="text" 
                className={cn(
                    "!w-4 !h-4 !border-2 !border-white shadow-sm transition-all duration-300 hover:scale-125 pointer-events-auto",
                    context.color
                )} 
              />
              <span className={cn(
                "absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white px-2 py-1 rounded-md shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none uppercase tracking-tighter",
                context.color,
                selected ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
              )}>
                {context.label} Output
              </span>
            </div>
        </div>
    </div>
  );
}
