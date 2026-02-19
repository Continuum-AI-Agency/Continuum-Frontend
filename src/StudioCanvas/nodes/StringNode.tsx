import React, { useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer, useEdges } from '@xyflow/react';
import { Textarea } from '@/components/ui/textarea';
import { useStudioStore } from '../stores/useStudioStore';
import { StringNodeData } from '../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MagicWandIcon } from '@radix-ui/react-icons';
import { Badge } from '@/components/ui/badge';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { Node as CanvasNode, NodeContent, NodeHeader } from '@/components/ai-elements/node';
import { FileText, Sparkles, CircleSlash2 } from 'lucide-react';

export function StringNode({ id, data, selected }: NodeProps<ReactFlowNode<StringNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const brandId = useStudioStore((state) => state.brandId);
  const edges = useEdges();
  const executionControls = useWorkflowExecution();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const debouncedSave = useDebouncedSave();
  
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
    if (!connectedEdge) {
      return { label: 'Text', icon: FileText, edgeColor: 'var(--edge-text)', border: 'border-border/60' };
    }

    if (connectedEdge.targetHandle === 'prompt' || connectedEdge.targetHandle === 'prompt-in') {
      return { label: 'Prompt', icon: Sparkles, edgeColor: 'var(--edge-text)', border: 'border-brand-primary/40' };
    }

    if (connectedEdge.targetHandle === 'negative') {
      return { label: 'Negative Prompt', icon: CircleSlash2, edgeColor: 'var(--edge-text)', border: 'border-red-500/40' };
    }

    return { label: 'Text', icon: FileText, edgeColor: 'var(--edge-text)', border: 'border-border/60' };
  }, [connectedEdge]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { value: e.target.value });
    debouncedSave();
  }, [id, updateNodeData, debouncedSave]);

  const handleEnrich = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (data.isExecuting) return;
    
    try {
      await executeWorkflow(executionControls, { 
        targetNodeId: id,
        clearDownstream: false,
        brandId
      });
    } catch (err) {
      console.error("Enrichment trigger failed", err);
    }
  }, [id, executionControls, data.isExecuting, brandId]);

  return (
    <div 
      className={cn(
        "relative min-w-[280px] min-h-[180px] w-full h-full max-w-[400px] rounded-lg transition-shadow",
        isSelectedByOther && "selected-by-other"
      )}
      style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
    >
      <NodeResizer
        minWidth={280}
        minHeight={180}
        maxWidth={600}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />
      
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className={cn(
          "border bg-background rounded-lg overflow-hidden transition-all duration-300 h-full w-full flex flex-col min-h-[inherit] shadow-sm hover:shadow-md",
          context.border,
          hasInputs && "ring-1 ring-brand-primary/30"
        )}
      >
          <NodeHeader className="!h-8 !px-3 !py-1 rounded-none bg-muted/60 border-b border-border/60 flex items-center justify-between min-h-[32px] shrink-0">
              <div className="flex items-center gap-1.5">
                <context.icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{context.label}</span>
              </div>
              
              {hasInputs && (
                  <div className="flex items-center gap-1">
                      {inputCounts.image > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{inputCounts.image} img</Badge>}
                      {inputCounts.audio > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{inputCounts.audio} aud</Badge>}
                      {inputCounts.video > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{inputCounts.video} vid</Badge>}
                      {inputCounts.document > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{inputCounts.document} doc</Badge>}
                  </div>
              )}
          </NodeHeader>
          
          <NodeContent className="relative flex-1 flex flex-col min-h-0 overflow-hidden p-0 bg-muted/20">
              <Textarea 
                value={data.value} 
                onChange={handleChange} 
                onKeyDown={(event) => event.stopPropagation()}
                className="nodrag text-xs text-primary placeholder:text-muted-foreground/70 flex-1 w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none bg-transparent p-3 pr-8 overflow-y-auto whitespace-pre-wrap break-words block h-full min-h-[100px]" 
                placeholder={hasInputs ? "Enter instructions for prompt enrichment..." : "Enter prompt..."} 
              />
              
              <div className="p-2 border-t border-border/60 bg-background/70 flex justify-end relative z-20 shrink-0">
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="h-6 px-3 text-[10px] shadow-sm nodrag cursor-pointer"
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
          </NodeContent>
      </CanvasNode>

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
