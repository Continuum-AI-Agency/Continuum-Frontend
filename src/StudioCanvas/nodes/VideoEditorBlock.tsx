import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Handle,
  Position,
  type NodeProps,
  type Node as ReactFlowNode,
  NodeResizer,
  type HandleProps,
  useEdges,
  useNodeId,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import {
  CopyIcon,
  DownloadIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  VideoIcon,
} from '@radix-ui/react-icons';
import { ArrowDown, ArrowUp, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';

import { useStudioStore } from '../stores/useStudioStore';
import type { ClipSlot, VideoEditorNodeData } from '../types';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useToast } from '@/components/ui/ToastProvider';
import { downloadAsset } from '../utils/downloadAsset';
import { useNodeSelection } from '../contexts/PresenceContext';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { checkSpliceSupport, type WebCodecsSupport } from '../utils/splice/webcodecsSupport';

const MIN_SLOTS = 2;
const MAX_SLOTS = 12;

const LimitedHandle = ({
  maxConnections,
  isConnectable,
  ...props
}: HandleProps & { maxConnections?: number }) => {
  const edges = useEdges();
  const nodeId = useNodeId();
  const handleId = props.id ?? null;

  const connectionCount = edges.filter((edge) => {
    if (!nodeId) return false;
    if (props.type === 'target') {
      return edge.target === nodeId && (edge.targetHandle ?? null) === handleId;
    }
    return edge.source === nodeId && (edge.sourceHandle ?? null) === handleId;
  }).length;

  const withinLimit = !maxConnections || connectionCount < maxConnections;
  const baseConnectable = isConnectable ?? true;
  return <Handle {...props} isConnectable={baseConnectable && withinLimit} />;
};

function createSlot(order: number): ClipSlot {
  return { id: uuidv4(), order };
}

function normalizeSlots(slots: ClipSlot[] | undefined): ClipSlot[] {
  if (!slots || slots.length < MIN_SLOTS) {
    const base = slots ?? [];
    const padded = [...base];
    while (padded.length < MIN_SLOTS) {
      padded.push(createSlot(padded.length));
    }
    return padded.map((slot, index) => ({ ...slot, order: index }));
  }
  return [...slots].sort((a, b) => a.order - b.order).map((slot, index) => ({ ...slot, order: index }));
}

export function VideoEditorBlock({ id, data, selected }: NodeProps<ReactFlowNode<VideoEditorNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const executionControls = useWorkflowExecution();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  const [isHovered, setIsHovered] = useState(false);
  const [support, setSupport] = useState<WebCodecsSupport | null>(null);
  const [dragSlotId, setDragSlotId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    checkSpliceSupport().then((result) => {
      if (!mounted) return;
      setSupport(result);
      if (!result.ok && data.unsupportedReason !== result.reason) {
        updateNode(id, (node) => ({
          ...node,
          data: { ...(node.data as VideoEditorNodeData), unsupportedReason: result.reason },
        }));
      } else if (result.ok && data.unsupportedReason) {
        updateNode(id, (node) => ({
          ...node,
          data: { ...(node.data as VideoEditorNodeData), unsupportedReason: undefined },
        }));
      }
    });
    return () => {
      mounted = false;
    };
  }, [data.unsupportedReason, id, updateNode]);

  const slots = useMemo(() => normalizeSlots(data.clipSlots), [data.clipSlots]);

  const writeSlots = useCallback(
    (next: ClipSlot[]) => {
      const normalized = next.map((slot, index) => ({ ...slot, order: index }));
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as VideoEditorNodeData), clipSlots: normalized },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  const handleAddSlot = useCallback(() => {
    if (slots.length >= MAX_SLOTS) return;
    writeSlots([...slots, createSlot(slots.length)]);
  }, [slots, writeSlots]);

  const handleRemoveSlot = useCallback(
    (slotId: string) => {
      if (slots.length <= MIN_SLOTS) return;
      writeSlots(slots.filter((slot) => slot.id !== slotId));
    },
    [slots, writeSlots],
  );

  const handleMoveSlot = useCallback(
    (slotId: string, direction: -1 | 1) => {
      const index = slots.findIndex((slot) => slot.id === slotId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= slots.length) return;
      const next = [...slots];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      writeSlots(next);
    },
    [slots, writeSlots],
  );

  const handleSlotDrop = useCallback(
    (targetSlotId: string) => {
      if (!dragSlotId || dragSlotId === targetSlotId) return;
      const fromIndex = slots.findIndex((slot) => slot.id === dragSlotId);
      const toIndex = slots.findIndex((slot) => slot.id === targetSlotId);
      if (fromIndex < 0 || toIndex < 0) return;
      const next = [...slots];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      writeSlots(next);
      setDragSlotId(null);
    },
    [dragSlotId, slots, writeSlots],
  );

  const handleTrimChange = useCallback(
    (slotId: string, field: 'trimStartSec' | 'trimEndSec', value: string) => {
      const numeric = value.trim() === '' ? undefined : Number(value);
      if (numeric !== undefined && (Number.isNaN(numeric) || numeric < 0)) return;
      writeSlots(
        slots.map((slot) => (slot.id === slotId ? { ...slot, [field]: numeric } : slot)),
      );
    },
    [slots, writeSlots],
  );

  const handleRun = useCallback(async () => {
    if (support && !support.ok) {
      show({
        title: 'Splice unavailable',
        description: support.reason,
        variant: 'warning',
      });
      return;
    }
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [brandId, executionControls, id, show, support]);

  const displayVideo = data.generatedVideo ?? data.generatedVideoUrl;
  const isRunning = Boolean(data.isExecuting);
  const progress = typeof data.progress === 'number' ? Math.max(0, Math.min(1, data.progress)) : 0;

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: displayVideo,
      baseName: `spliced-${id}`,
      fallbackExtension: 'mp4',
    });
    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Run the node to generate a spliced video first.',
        variant: 'warning',
      });
    }
  }, [displayVideo, id, show]);

  const isToolbarVisible = selected || isHovered || Boolean(data.isToolbarVisible);
  const connectedCount = useEdges().filter(
    (edge) => edge.target === id && (edge.targetHandle ?? '').startsWith('clip-'),
  ).length;

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              'relative group h-full w-full min-w-[340px] min-h-[260px] rounded-xl transition-shadow',
              isSelectedByOther && 'selected-by-other',
            )}
            style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <NodeResizer
              minWidth={340}
              minHeight={260}
              isVisible={selected}
              lineClassName="border-brand-primary/60"
              handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
            />

            <Toolbar
              isVisible={isToolbarVisible}
              position={Position.Top}
              className="gap-1.5 border-border/80 bg-background/95 shadow-lg backdrop-blur-sm"
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleRun}
                disabled={isRunning || (support ? !support.ok : false)}
                title="Run splice"
              >
                <PlayIcon className="h-4 w-4" />
              </Button>
            </Toolbar>

            <CanvasNode
              handles={{ target: false, source: false }}
              selected={selected}
              className="h-full w-full overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
            >
              <NodeContent className="flex h-full w-full flex-col gap-2 p-3">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Video Splicer</span>
                  <span>
                    {connectedCount}/{slots.length} connected
                  </span>
                </div>

                {support && !support.ok ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                    {support.reason}
                  </div>
                ) : null}

                <div
                  className="nowheel nodrag flex flex-1 min-h-0 flex-col gap-1.5 overflow-y-auto pr-1"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {slots.map((slot, index) => (
                    <div
                      key={slot.id}
                      draggable
                      onDragStart={() => setDragSlotId(slot.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleSlotDrop(slot.id)}
                      onDragEnd={() => setDragSlotId(null)}
                      className={cn(
                        'group/slot relative flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-xs',
                        dragSlotId === slot.id && 'opacity-50',
                      )}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-background text-2xs font-semibold">
                        {index + 1}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="Start"
                        value={slot.trimStartSec ?? ''}
                        onChange={(event) => handleTrimChange(slot.id, 'trimStartSec', event.target.value)}
                        className="nodrag h-6 w-14 rounded border border-border/60 bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        aria-label={`Clip ${index + 1} trim start seconds`}
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="End"
                        value={slot.trimEndSec ?? ''}
                        onChange={(event) => handleTrimChange(slot.id, 'trimEndSec', event.target.value)}
                        className="nodrag h-6 w-14 rounded border border-border/60 bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        aria-label={`Clip ${index + 1} trim end seconds`}
                      />
                      <div className="ml-auto flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleMoveSlot(slot.id, -1)}
                          disabled={index === 0}
                          aria-label={`Move clip ${index + 1} up`}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleMoveSlot(slot.id, 1)}
                          disabled={index === slots.length - 1}
                          aria-label={`Move clip ${index + 1} down`}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-destructive"
                          onClick={() => handleRemoveSlot(slot.id)}
                          disabled={slots.length <= MIN_SLOTS}
                          aria-label={`Remove clip ${index + 1}`}
                        >
                          <XIcon className="h-3 w-3" />
                        </Button>
                      </div>

                      <div
                        className="pointer-events-none absolute -left-5 top-1/2 -translate-y-1/2"
                        style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
                      >
                        <LimitedHandle
                          type="target"
                          position={Position.Left}
                          id={`clip-${slot.id}`}
                          maxConnections={1}
                          className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-center text-xs"
                  onClick={handleAddSlot}
                  disabled={slots.length >= MAX_SLOTS}
                >
                  <PlusIcon className="mr-1 h-3 w-3" />
                  Add clip slot
                </Button>

                <div className="relative overflow-hidden rounded-md border border-border/60 bg-black/85" style={{ aspectRatio: '16 / 9' }}>
                  {isRunning ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-4">
                      <GenerationPulseLoader />
                      <Progress value={progress * 100} className="h-1.5 w-3/4" />
                      <span className="text-2xs text-muted-foreground">
                        {Math.round(progress * 100)}% splicing in browser
                      </span>
                    </div>
                  ) : displayVideo ? (
                    <>
                      <video
                        src={displayVideo}
                        controls
                        className="h-full w-full object-contain"
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        className="nodrag absolute right-2 top-2 z-20 h-7 w-7 border border-border/70 bg-background/90 opacity-90 shadow-sm backdrop-blur-sm hover:opacity-100"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDownload();
                        }}
                        title="Download output"
                        aria-label="Download spliced video"
                      >
                        <DownloadIcon className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                      <VideoIcon className="h-6 w-6 opacity-30" />
                      <span className="text-2xs">Connect clips and run</span>
                    </div>
                  )}
                </div>
              </NodeContent>
            </CanvasNode>

            <div
              className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id="video"
                    className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Spliced Video Output</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Video Splicer</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleRun} disabled={isRunning || (support ? !support.ok : false)}>
            <PlayIcon className="mr-2 h-4 w-4" />
            Run splice
            <ContextMenuShortcut>R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleAddSlot} disabled={slots.length >= MAX_SLOTS}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add clip slot
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <CopyIcon className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDownload} disabled={!displayVideo}>
            <DownloadIcon className="mr-2 h-4 w-4" />
            Download Output
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => deleteNode(id)}
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
  );
}
