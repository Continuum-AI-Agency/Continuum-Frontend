import React, { useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useEdges } from '@xyflow/react';
import { Textarea } from '@/components/ui/textarea';
import { useStudioStore } from '../stores/useStudioStore';
import { StringNodeData } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MagicWandIcon } from '@radix-ui/react-icons';
import { Badge } from '@/components/ui/badge';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';

export function StringNode({ id, data, selected }: NodeProps<Node<StringNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const edges = useEdges();
  const executionControls = useWorkflowExecution();
  
  const connectedEdge = edges.find(e => e.source === id);
  const incomingEdges = edges.filter(e => e.target === id);
  
  const hasInputs = incomingEdges.length > 0;
  
  const inputCounts = useMemo(() => ({
    image: incomingEdges.filter(e => e.targetHandle === 'image').length,
    audio: incomingEdges.filter(e => e.targetHandle === 'audio').length,
    video: incomingEdges.filter(e => e.targetHandle === 'video').length,
    document: incomingEdges.filter(e => e.targetHandle === 'document').length,
  }), [incomingEdges]);

  const context = useMemo(() => {
    if (!connectedEdge) return { label: 'Text', icon: '📝', edgeColor: 'var(--edge-text)', border: 'border-subtle' };

    if (connectedEdge.targetHandle === 'prompt' || connectedEdge.targetHandle === 'prompt-in') {
      return { label: 'Prompt', icon: '✨', edgeColor: 'var(--edge-text)', border: 'border-brand-primary/60 shadow-brand-glow' };
    }

    if (connectedEdge.targetHandle === 'negative') {
      return { label: 'Negative Prompt', icon: '🚫', edgeColor: 'var(--edge-text)', border: 'border-red-500/60' };
    }

    return { label: 'Text', icon: '📝', edgeColor: 'var(--edge-text)', border: 'border-subtle' };
  }, [connectedEdge]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { value: e.target.value });
  }, [id, updateNodeData]);

  const handleEnrich = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (data.isExecuting) return;
    
    console.log("Triggering enrichment for node", id);
    try {
      await executeWorkflow(executionControls, { 
        targetNodeId: id,
        clearDownstream: false
      });
    } catch (err) {
      console.error("Enrichment trigger failed", err);
    }
  }, [id, executionControls, data.isExecuting]);

  return (
    <div className="relative min-w-[280px] min-h-[180px] w-full h-full max-w-[400px]">
      <NodeResizer
        minWidth={280}
        minHeight={180}
        maxWidth={600}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />
      
      <div className={cn(
          "border shadow-md bg-surface rounded-lg overflow-hidden transition-all duration-300 h-full w-full flex flex-col min-h-[inherit]", 
          context.border,
          hasInputs && "ring-1 ring-brand-primary/30"
      )}>
          <div className="bg-default/70 px-3 py-1 border-b border-subtle flex items-center justify-between min-h-[32px] shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-secondary">{context.icon}</span>
                <span className="text-[9px] font-bold text-secondary uppercase tracking-widest">{context.label}</span>
              </div>
              
              {hasInputs && (
                  <div className="flex items-center gap-1">
                      {inputCounts.image > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{inputCounts.image} img</Badge>}
                      {inputCounts.audio > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{inputCounts.audio} aud</Badge>}
                      {inputCounts.video > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-purple-100 text-purple-700 hover:bg-purple-100">{inputCounts.video} vid</Badge>}
                      {inputCounts.document > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-100">{inputCounts.document} doc</Badge>}
                  </div>
              )}
          </div>
          
          <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
              <Textarea 
                value={data.value} 
                onChange={handleChange} 
                onKeyDown={(event) => event.stopPropagation()}
                className="nodrag text-xs text-primary placeholder:text-secondary/70 flex-1 w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none bg-transparent p-3 pr-8 overflow-y-auto whitespace-pre-wrap break-words block h-full min-h-[100px]" 
                placeholder={hasInputs ? "Enter instructions for prompt enrichment..." : "Enter prompt..."} 
              />
              
              <div className="p-2 border-t border-subtle bg-background/50 flex justify-end relative z-20 shrink-0">
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="h-6 px-3 text-[10px] bg-brand-primary text-white hover:bg-brand-primary/90 shadow-sm nodrag cursor-pointer"
                    onClick={handleEnrich}
                    disabled={data.isExecuting}
                  >
                    {data.isExecuting ? (
                        <div className="flex items-center gap-1.5">
                          <div className="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full" />
                          <span>Enriching...</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <MagicWandIcon className="w-3.5 h-3.5 fill-white" />
                            <span className="font-semibold tracking-wide">Enrich Prompt</span>
                        </div>
                    )}
                  </Button>
              </div>
          </div>
      </div>

      <div className="absolute -left-2 top-8 flex flex-col gap-3 z-10">
        <div className="relative group/handle">
            <Handle 
                type="target" 
                position={Position.Left} 
                id="image" 
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
                className="studio-handle !w-3 !h-3 !border-2 shadow-sm transition-transform hover:scale-125" 
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground opacity-0 group-hover/handle:opacity-100 transition-opacity bg-background/80 px-1 rounded pointer-events-none">
                IMG
            </span>
        </div>
        <div className="relative group/handle">
            <Handle 
                type="target" 
                position={Position.Left} 
                id="audio" 
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-audio, #10b981)' }}
                className="studio-handle !w-3 !h-3 !border-2 shadow-sm transition-transform hover:scale-125" 
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground opacity-0 group-hover/handle:opacity-100 transition-opacity bg-background/80 px-1 rounded pointer-events-none">
                AUD
            </span>
        </div>
        <div className="relative group/handle">
            <Handle 
                type="target" 
                position={Position.Left} 
                id="video" 
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
                className="studio-handle !w-3 !h-3 !border-2 shadow-sm transition-transform hover:scale-125" 
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground opacity-0 group-hover/handle:opacity-100 transition-opacity bg-background/80 px-1 rounded pointer-events-none">
                VID
            </span>
        </div>
        <div className="relative group/handle">
            <Handle 
                type="target" 
                position={Position.Left} 
                id="document" 
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-document, #f59e0b)' }}
                className="studio-handle !w-3 !h-3 !border-2 shadow-sm transition-transform hover:scale-125" 
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground opacity-0 group-hover/handle:opacity-100 transition-opacity bg-background/80 px-1 rounded pointer-events-none">
                DOC
            </span>
        </div>
      </div>

      <div
        className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none"
        style={{ ['--edge-color' as keyof React.CSSProperties]: context.edgeColor }}
      >
        <Handle 
          type="source" 
          position={Position.Right} 
          id="text" 
          className={cn(
              "studio-handle !w-4 !h-4 !border-2 shadow-sm transition-all duration-300 hover:scale-125 pointer-events-auto"
          )} 
        />
        <span className={cn(
          "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none uppercase tracking-tighter",
          selected ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
        )}>
          {context.label} Output
        </span>
      </div>
    </div>
  );
}
