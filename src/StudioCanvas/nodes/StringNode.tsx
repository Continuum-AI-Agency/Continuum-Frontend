import { LinkBreak2Icon, MagicWandIcon } from '@radix-ui/react-icons';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
} from '@xyflow/react';
import { Copy, Sparkles, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import {
  Node as CanvasNode,
  NodeContent,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { GroundingChip } from '../components/GroundingChip';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { useNodeTitler } from '../hooks/useNodeTitler';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { StringNodeData } from '../types';
import { resolveInheritedGrounding } from '../utils/buildNodePayload';
import { executeWorkflow } from '../utils/executeWorkflow';

export function StringNode({ id, data, selected }: NodeProps<ReactFlowNode<StringNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const detachNodeConnections = useStudioStore((state) => state.detachNodeConnections);
  const getConnectedEdges = useStudioStore((state) => state.getConnectedEdges);
  const brandId = useStudioStore((state) => state.brandId);
  const edges = useEdges();
  const executionControls = useWorkflowExecution();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const debouncedSave = useDebouncedSave();
  const { isTitling } = useNodeTitler({ id, value: data.value, isExecuting: !!data.isExecuting });

  const connectedEdge = edges.find((e) => e.source === id);
  const incomingEdges = edges.filter((e) => e.target === id);
  const hasInputs = incomingEdges.length > 0;

  // Grounding the Enrich button will apply, inherited from the downstream
  // generator (fallback: default-ON brand book). Surfaces that "tele-fill" is
  // brand-guarded + skill-aware right next to the button.
  const nodes = useStudioStore((state) => state.nodes);
  const inheritedGrounding = useMemo(
    () => resolveInheritedGrounding(id, nodes, edges),
    [id, nodes, edges],
  );

  const context = useMemo(() => {
    if (!connectedEdge) {
      return { edgeColor: 'var(--edge-text)', border: 'border-border/60' };
    }

    if (connectedEdge.targetHandle === 'prompt' || connectedEdge.targetHandle === 'prompt-in') {
      return { edgeColor: 'var(--edge-text)', border: 'border-brand-primary/40' };
    }

    if (connectedEdge.targetHandle === 'negative') {
      return { edgeColor: 'var(--edge-text)', border: 'border-red-500/40' };
    }

    return { edgeColor: 'var(--edge-text)', border: 'border-border/60' };
  }, [connectedEdge]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { value: e.target.value });
      debouncedSave();
    },
    [id, updateNodeData, debouncedSave],
  );

  const handleEnrich = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (data.isExecuting) return;

      try {
        await executeWorkflow(executionControls, {
          targetNodeId: id,
          clearDownstream: false,
          brandId,
        });
      } catch (err) {
        console.error('Enrichment trigger failed', err);
      }
    },
    [id, executionControls, data.isExecuting, brandId],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-tour-id={data.isTourSeed ? 'studio-node-prompt' : undefined}
          className={cn(
            'relative min-w-[280px] min-h-[180px] w-full h-full max-w-[400px] rounded-lg transition-shadow',
            isSelectedByOther && 'selected-by-other',
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
              'border bg-background rounded-lg overflow-hidden transition-all duration-300 h-full w-full flex flex-col min-h-[inherit] shadow-sm hover:shadow-md',
              context.border,
              hasInputs && 'ring-1 ring-brand-primary/30',
            )}
          >
            <NodeHeader className="flex items-center gap-1.5 border-b border-border/60 bg-muted/30 px-2.5! py-1.5!">
              <Sparkles
                className={cn(
                  'h-3 w-3 shrink-0 text-brand-primary/70',
                  isTitling && 'animate-pulse',
                )}
              />
              <NodeTitle className="min-w-0 flex-1 truncate text-2xs font-medium text-muted-foreground">
                {data.label || (isTitling ? 'Naming…' : 'Untitled prompt')}
              </NodeTitle>
            </NodeHeader>

            <NodeContent className="relative flex-1 flex flex-col min-h-0 overflow-hidden p-0 bg-muted/20">
              <Textarea
                value={data.value}
                onChange={handleChange}
                onKeyDown={(event) => event.stopPropagation()}
                className="nodrag text-xs text-primary placeholder:text-muted-foreground/70 flex-1 w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none bg-transparent p-3 pr-8 overflow-y-auto whitespace-pre-wrap break-words block h-full min-h-[100px]"
                placeholder="Enter prompt or instructions..."
              />

              <div className="p-2 border-t border-border/60 bg-background/70 flex items-center justify-between gap-2 relative z-20 shrink-0">
                <GroundingChip
                  inherited
                  brandId={brandId}
                  skillIds={inheritedGrounding.skillIds}
                  brandBookPieces={inheritedGrounding.brandBookPieces}
                />
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 px-3 text-2xs shadow-sm nodrag cursor-pointer"
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
            </div>
            <div className="relative group/handle">
              <Handle
                type="target"
                position={Position.Left}
                id="audio"
                style={{
                  ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-audio, #10b981)',
                }}
                className="studio-handle !w-3 !h-3 !border-2 shadow-sm transition-transform hover:scale-125"
              />
            </div>
            <div className="relative group/handle">
              <Handle
                type="target"
                position={Position.Left}
                id="video"
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
                className="studio-handle !w-3 !h-3 !border-2 shadow-sm transition-transform hover:scale-125"
              />
            </div>
            <div className="relative group/handle">
              <Handle
                type="target"
                position={Position.Left}
                id="document"
                style={{
                  ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-document, #f59e0b)',
                }}
                className="studio-handle !w-3 !h-3 !border-2 shadow-sm transition-transform hover:scale-125"
              />
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
                'studio-handle !w-4 !h-4 !border-2 shadow-sm transition-all duration-300 hover:scale-125 pointer-events-auto',
              )}
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel>Text Block</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => void handleEnrich()}>
          <MagicWandIcon className="mr-2 h-4 w-4" />
          Enrich Prompt
          <ContextMenuShortcut>R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => duplicateNode(id)}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={getConnectedEdges(id).length === 0}
          onClick={() => detachNodeConnections(id)}
        >
          <LinkBreak2Icon className="mr-2 h-4 w-4" />
          Detach connections
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => deleteNode(id)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
