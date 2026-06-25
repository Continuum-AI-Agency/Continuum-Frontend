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
  ImageIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  VideoIcon,
} from '@radix-ui/react-icons';
import { ArrowDown, ArrowUp, Clock, X as XIcon } from 'lucide-react';
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
import type { StudioNode, TimelineItem, TimelineEditorNodeData } from '../types';
import type { NodeOutput } from '../types/execution';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow, collectDownstreamLeafIds } from '../utils/executeWorkflow';
import { useToast } from '@/components/ui/ToastProvider';
import { downloadAsset } from '../utils/downloadAsset';
import { useNodeSelection } from '../contexts/PresenceContext';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { checkSpliceSupport, type WebCodecsSupport } from '../utils/splice/webcodecsSupport';
import { resolveTimelineSources } from '../utils/splice/resolveClipSources';
import { runTimelineInWorker } from '../workers/spliceWorkerClient';
import { persistTimelineRender } from '../utils/persistTimelineRender';

const MIN_ITEMS = 1;
const MAX_ITEMS = 20;
const DEFAULT_STILL_DURATION = 3;

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

function createItem(order: number): TimelineItem {
  return { id: uuidv4(), order };
}

function normalizeItems(items: TimelineItem[] | undefined): TimelineItem[] {
  if (!items || items.length < MIN_ITEMS) {
    const base = items ?? [];
    const padded = [...base];
    while (padded.length < MIN_ITEMS) {
      padded.push(createItem(padded.length));
    }
    return padded.map((item, index) => ({ ...item, order: index }));
  }
  return [...items].sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, order: index }));
}

export function TimelineEditorBlock({ id, data, selected }: NodeProps<ReactFlowNode<TimelineEditorNodeData>>) {
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
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const edges = useEdges();

  useEffect(() => {
    let mounted = true;
    checkSpliceSupport().then((result) => {
      if (!mounted) return;
      setSupport(result);
      if (!result.ok && data.unsupportedReason !== result.reason) {
        updateNode(id, (node) => ({
          ...node,
          data: { ...(node.data as TimelineEditorNodeData), unsupportedReason: result.reason },
        }));
      } else if (result.ok && data.unsupportedReason) {
        updateNode(id, (node) => ({
          ...node,
          data: { ...(node.data as TimelineEditorNodeData), unsupportedReason: undefined },
        }));
      }
    });
    return () => {
      mounted = false;
    };
  }, [data.unsupportedReason, id, updateNode]);

  const items = useMemo(() => normalizeItems(data.items), [data.items]);

  // The kind of each item is derived from its connected source: an image/nanoGen
  // source is a still (duration), any video producer is a clip (trim range).
  const kindByItem = useMemo(() => {
    const nodes = useStudioStore.getState().nodes as StudioNode[];
    const map = new Map<string, 'video' | 'image' | undefined>();
    for (const item of items) {
      const edge = edges.find((e) => e.target === id && e.targetHandle === `media-${item.id}`);
      const source = edge ? nodes.find((n) => n.id === edge.source) : undefined;
      if (!source) {
        map.set(item.id, undefined);
      } else if (source.type === 'image' || source.type === 'nanoGen') {
        map.set(item.id, 'image');
      } else {
        map.set(item.id, 'video');
      }
    }
    return map;
  }, [edges, id, items]);

  const writeItems = useCallback(
    (next: TimelineItem[]) => {
      const normalized = next.map((item, index) => ({ ...item, order: index }));
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as TimelineEditorNodeData), items: normalized },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  const handleAddItem = useCallback(() => {
    if (items.length >= MAX_ITEMS) return;
    writeItems([...items, createItem(items.length)]);
  }, [items, writeItems]);

  const handleRemoveItem = useCallback(
    (itemId: string) => {
      if (items.length <= MIN_ITEMS) return;
      writeItems(items.filter((item) => item.id !== itemId));
    },
    [items, writeItems],
  );

  const handleMoveItem = useCallback(
    (itemId: string, direction: -1 | 1) => {
      const index = items.findIndex((item) => item.id === itemId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return;
      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      writeItems(next);
    },
    [items, writeItems],
  );

  const handleItemDrop = useCallback(
    (targetItemId: string) => {
      if (!dragItemId || dragItemId === targetItemId) return;
      const fromIndex = items.findIndex((item) => item.id === dragItemId);
      const toIndex = items.findIndex((item) => item.id === targetItemId);
      if (fromIndex < 0 || toIndex < 0) return;
      const next = [...items];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      writeItems(next);
      setDragItemId(null);
    },
    [dragItemId, items, writeItems],
  );

  const handleNumberChange = useCallback(
    (itemId: string, field: 'trimStartSec' | 'trimEndSec' | 'durationSec', value: string) => {
      const numeric = value.trim() === '' ? undefined : Number(value);
      if (numeric !== undefined && (Number.isNaN(numeric) || numeric < 0)) return;
      writeItems(items.map((item) => (item.id === itemId ? { ...item, [field]: numeric } : item)));
    },
    [items, writeItems],
  );

  const isRunning = Boolean(data.isExecuting);
  const isAwaiting = Boolean((data as { awaitingInput?: boolean }).awaitingInput) && !data.committed;
  const progress = typeof data.progress === 'number' ? Math.max(0, Math.min(1, data.progress)) : 0;
  const displayVideo = data.generatedVideo ?? data.generatedVideoUrl;

  const connectedCount = edges.filter(
    (edge) => edge.target === id && (edge.targetHandle ?? '').startsWith('media-'),
  ).length;

  const handleRenderAndContinue = useCallback(async () => {
    if (support && !support.ok) {
      show({ title: 'Editor unavailable', description: support.reason, variant: 'warning' });
      return;
    }
    if (connectedCount === 0) {
      show({ title: 'Nothing to render', description: 'Connect at least one clip or image.', variant: 'warning' });
      return;
    }

    const controller = new AbortController();
    updateNode(id, (node) => ({
      ...node,
      data: { ...(node.data as TimelineEditorNodeData), isExecuting: true, error: undefined, progress: 0 },
    }));

    try {
      const nodes = useStudioStore.getState().nodes as StudioNode[];
      const resolved = await resolveTimelineSources(items, edges, nodes, new Map<string, NodeOutput>(), id);
      const result = await runTimelineInWorker({
        items: resolved,
        signal: controller.signal,
        onProgress: ({ progress: value }) => {
          useStudioStore.getState().updateNodeData(id, { progress: value });
        },
      });

      // Show the freshly rendered clip immediately via its in-memory object URL.
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as TimelineEditorNodeData), generatedVideo: result.objectUrl, progress: 1 },
      }));

      // Save the finalized clip to the media library. Prefer the durable signed
      // URL + storage coords so the output survives canvas reloads; fall back to
      // the in-memory object URL if the brand is anonymous (e.g. local preview).
      let committedUrl = result.objectUrl;
      let storagePath: string | undefined;
      let bucket: string | undefined;
      if (brandId && brandId !== 'default-brand') {
        try {
          const persisted = await persistTimelineRender({ blob: result.blob, brandId, nodeId: id });
          committedUrl = persisted.signedUrl;
          storagePath = persisted.storagePath;
          bucket = persisted.bucket;
        } catch (persistError) {
          const message = persistError instanceof Error ? persistError.message : 'Library save failed';
          show({ title: 'Saved locally only', description: message, variant: 'warning' });
        }
      }

      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as TimelineEditorNodeData),
          committed: true,
          generatedVideo: committedUrl,
          generatedVideoUrl: committedUrl,
          generatedVideoStoragePath: storagePath,
          generatedVideoBucket: bucket,
          isExecuting: false,
          isComplete: true,
          awaitingInput: false,
          progress: 1,
        },
      }));
      triggerSave();

      // Resume the workflow: re-run only the parked downstream chain, targeting
      // each leaf so its upstream closure reuses this committed clip (and any
      // completed upstream generators) instead of regenerating the whole graph.
      const currentNodes = useStudioStore.getState().nodes as StudioNode[];
      const leafIds = collectDownstreamLeafIds(id, edges, new Map(currentNodes.map((n) => [n.id, n])));
      for (const leafId of leafIds) {
        await executeWorkflow(executionControls, { targetNodeId: leafId, clearDownstream: false, brandId });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Render failed';
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as TimelineEditorNodeData), isExecuting: false, error: message },
      }));
      show({ title: 'Render failed', description: message, variant: 'warning' });
    }
  }, [brandId, connectedCount, edges, executionControls, id, items, show, support, triggerSave, updateNode]);

  const handleDownload = useCallback(() => {
    const success = downloadAsset({ data: displayVideo, baseName: `video-edit-${id}`, fallbackExtension: 'mp4' });
    if (!success) {
      show({ title: 'Download unavailable', description: 'Render the timeline first.', variant: 'warning' });
    }
  }, [displayVideo, id, show]);

  const isToolbarVisible = selected || isHovered || Boolean(data.isToolbarVisible);
  const renderDisabled = isRunning || (support ? !support.ok : false);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              'relative group h-full w-full min-w-[380px] min-h-[320px] rounded-xl transition-shadow',
              isSelectedByOther && 'selected-by-other',
            )}
            style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <NodeResizer
              minWidth={380}
              minHeight={320}
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
                onClick={handleRenderAndContinue}
                disabled={renderDisabled}
                title="Render & Continue"
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
                  <span>Video Editor</span>
                  <span>{connectedCount}/{items.length} connected</span>
                </div>

                {support && !support.ok ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                    {support.reason}
                  </div>
                ) : null}

                {isAwaiting ? (
                  <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Paused — edit the timeline and click Render &amp; Continue to resume the workflow.
                  </div>
                ) : null}

                <div
                  className="nowheel nodrag flex flex-1 min-h-0 flex-col gap-1.5 overflow-y-auto pr-1"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {items.map((item, index) => {
                    const kind = kindByItem.get(item.id);
                    const isImage = kind === 'image';
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => setDragItemId(item.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleItemDrop(item.id)}
                        onDragEnd={() => setDragItemId(null)}
                        className={cn(
                          'group/item relative flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-xs',
                          dragItemId === item.id && 'opacity-50',
                        )}
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-background text-2xs font-semibold">
                          {index + 1}
                        </span>
                        {isImage ? (
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <VideoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}

                        {isImage ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              placeholder={String(DEFAULT_STILL_DURATION)}
                              value={item.durationSec ?? ''}
                              onChange={(event) => handleNumberChange(item.id, 'durationSec', event.target.value)}
                              className="nodrag h-6 w-14 rounded border border-border/60 bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              aria-label={`Item ${index + 1} still duration seconds`}
                            />
                            <span className="text-2xs text-muted-foreground">s</span>
                          </div>
                        ) : (
                          <>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              placeholder="Start"
                              value={item.trimStartSec ?? ''}
                              onChange={(event) => handleNumberChange(item.id, 'trimStartSec', event.target.value)}
                              className="nodrag h-6 w-14 rounded border border-border/60 bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              aria-label={`Item ${index + 1} trim start seconds`}
                            />
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              placeholder="End"
                              value={item.trimEndSec ?? ''}
                              onChange={(event) => handleNumberChange(item.id, 'trimEndSec', event.target.value)}
                              className="nodrag h-6 w-14 rounded border border-border/60 bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              aria-label={`Item ${index + 1} trim end seconds`}
                            />
                          </>
                        )}

                        <div className="ml-auto flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => handleMoveItem(item.id, -1)}
                            disabled={index === 0}
                            aria-label={`Move item ${index + 1} up`}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => handleMoveItem(item.id, 1)}
                            disabled={index === items.length - 1}
                            aria-label={`Move item ${index + 1} down`}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-destructive"
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={items.length <= MIN_ITEMS}
                            aria-label={`Remove item ${index + 1}`}
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
                            id={`media-${item.id}`}
                            maxConnections={1}
                            className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-center text-xs"
                  onClick={handleAddItem}
                  disabled={items.length >= MAX_ITEMS}
                >
                  <PlusIcon className="mr-1 h-3 w-3" />
                  Add timeline item
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  className="h-8 w-full justify-center text-xs"
                  onClick={handleRenderAndContinue}
                  disabled={renderDisabled}
                >
                  <PlayIcon className="mr-1 h-3.5 w-3.5" />
                  Render &amp; Continue
                </Button>

                <div className="relative overflow-hidden rounded-md border border-border/60 bg-black/85" style={{ aspectRatio: '16 / 9' }}>
                  {isRunning ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-4">
                      <GenerationPulseLoader />
                      <Progress value={progress * 100} className="h-1.5 w-3/4" />
                      <span className="text-2xs text-muted-foreground">
                        {Math.round(progress * 100)}% rendering in browser
                      </span>
                    </div>
                  ) : displayVideo ? (
                    <>
                      <video src={displayVideo} controls className="h-full w-full object-contain" />
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
                        aria-label="Download edited video"
                      >
                        <DownloadIcon className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                      <VideoIcon className="h-6 w-6 opacity-30" />
                      <span className="text-2xs">Connect clips &amp; images, then render</span>
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
                  <p>Edited Video Output</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Video Editor</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleRenderAndContinue} disabled={renderDisabled}>
            <PlayIcon className="mr-2 h-4 w-4" />
            Render &amp; Continue
            <ContextMenuShortcut>R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleAddItem} disabled={items.length >= MAX_ITEMS}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add timeline item
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
