import {
  TIMELINE_MEDIA_INPUT_HANDLE,
  TIMELINE_MEDIA_POOL_LIMIT,
  timelineAuthoringDocumentSchema,
  timelineDocumentFingerprint,
} from '@continuum/contracts';
import {
  CopyIcon,
  DownloadIcon,
  Pencil2Icon,
  PlayIcon,
  TrashIcon,
  VideoIcon,
} from '@radix-ui/react-icons';
import {
  Handle,
  type HandleProps,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
  useNodeId,
} from '@xyflow/react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
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
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { TimelineEditorNodeData } from '../types';
import { downloadAsset } from '../utils/downloadAsset';
import { TimelineEditorDialog } from './timeline/TimelineEditorDialog';
import { useCanvasTimelineAdapter } from './timeline/useCanvasTimelineAdapter';
import { useTimelineRender } from './timeline/useTimelineRender';

// Compact launcher for the Video Editor (timelineEditor) break-point node. The
// real editing happens in a full-screen dialog (TimelineEditorDialog); the node
// surfaces the input pool, a clip count, the awaiting gate, and the rendered
// output. Inputs land on a single multi-connection `media-in` pool handle.

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

export function TimelineEditorBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<TimelineEditorNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  // The editor runs against a host adapter, not the canvas store. The canvas one
  // is built here and shared by the node's Render button and the editor dialog.
  const adapter = useCanvasTimelineAdapter(id);
  const {
    render,
    isRendering,
    progress: renderProgress,
    status,
    support,
  } = useTimelineRender(adapter);

  const [isHovered, setIsHovered] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const handledRenderRequests = useRef(new Set<string>());

  const edges = useEdges();

  useEffect(() => {
    if (!support) return;
    if (!support.ok && data.unsupportedReason !== support.reason) {
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as TimelineEditorNodeData), unsupportedReason: support.reason },
      }));
    } else if (support.ok && data.unsupportedReason) {
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as TimelineEditorNodeData), unsupportedReason: undefined },
      }));
    }
  }, [support, data.unsupportedReason, id, updateNode]);

  useEffect(() => {
    const request = data.agentRenderRequest;
    if (
      !request ||
      request.status !== 'pending' ||
      !support ||
      handledRenderRequests.current.has(request.requestId)
    ) {
      return;
    }
    handledRenderRequests.current.add(request.requestId);

    const settle = (status: 'accepted' | 'stale' | 'error', error?: string): void => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as TimelineEditorNodeData),
          agentRenderRequest: { ...request, status, error },
        },
      }));
      triggerSave();
    };

    if (!support.ok) {
      settle('error', support.reason);
      return;
    }
    const document = timelineAuthoringDocumentSchema.safeParse(adapter.getDocument());
    if (!document.success) {
      settle('error', 'The Video Editor document is invalid and cannot be rendered.');
      return;
    }
    if (timelineDocumentFingerprint(document.data) !== request.requestedFingerprint) {
      settle('stale', 'The timeline changed before the browser accepted this render.');
      return;
    }

    settle('accepted');
    void render().then((accepted) => {
      if (!accepted) {
        settle('error', 'The browser render queue could not accept this request.');
      }
    });
  }, [adapter, data.agentRenderRequest, id, render, support, triggerSave, updateNode]);

  const inputCount = useMemo(
    () =>
      new Set(
        edges
          .filter(
            (edge) =>
              edge.target === id && (edge.targetHandle ?? '') === TIMELINE_MEDIA_INPUT_HANDLE,
          )
          .map((edge) => edge.source),
      ).size,
    [edges, id],
  );

  const clipCount = (data.items ?? []).length;
  const isRunning = Boolean(data.isExecuting) || isRendering;
  const isAwaiting =
    Boolean((data as { awaitingInput?: boolean }).awaitingInput) && !data.committed;
  const progress = isRendering
    ? renderProgress
    : typeof data.progress === 'number'
      ? Math.max(0, Math.min(1, data.progress))
      : 0;
  const displayVideo = data.generatedVideo ?? data.generatedVideoUrl;

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: displayVideo,
      baseName: `video-edit-${id}`,
      fallbackExtension: 'mp4',
    });
    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Render the timeline first.',
        variant: 'warning',
      });
    }
  }, [displayVideo, id, show]);

  const isToolbarVisible = selected || isHovered || Boolean(data.isToolbarVisible);
  const renderDisabled = isRunning || clipCount === 0 || (support ? !support.ok : false);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: node hover only toggles toolbar visibility; no semantic role applies */}
          <div
            className={cn(
              'relative group h-full w-full min-w-[280px] min-h-[220px] rounded-xl transition-shadow',
              isSelectedByOther && 'selected-by-other',
            )}
            style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <NodeResizer
              minWidth={280}
              minHeight={220}
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
                onClick={() => setEditorOpen(true)}
                title="Open editor"
              >
                <Pencil2Icon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => render()}
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
              <NodeContent
                className="flex h-full w-full flex-col gap-2 p-3"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditorOpen(true);
                }}
              >
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Video Editor</span>
                  <span>
                    {inputCount} input{inputCount === 1 ? '' : 's'} · {clipCount} clip
                    {clipCount === 1 ? '' : 's'}
                  </span>
                </div>

                {support && !support.ok ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                    {support.reason}
                  </div>
                ) : null}

                {isAwaiting ? (
                  <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Paused — open the editor and click Render &amp; Continue to resume the workflow.
                  </div>
                ) : null}

                <div
                  className="relative flex-1 overflow-hidden rounded-md border border-border/60 bg-black/85"
                  style={{ aspectRatio: '16 / 9' }}
                >
                  {isRunning ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-4">
                      <GenerationPulseLoader />
                      <Progress value={progress * 100} className="h-1.5 w-3/4" />
                      <span className="text-2xs text-muted-foreground">
                        {status === 'queued'
                          ? 'Queued for browser rendering'
                          : status === 'preparing'
                            ? 'Preparing media…'
                            : status === 'saving'
                              ? 'Saving render…'
                              : `${Math.round(progress * 100)}% rendering in browser`}
                      </span>
                    </div>
                  ) : displayVideo ? (
                    <>
                      {/* biome-ignore lint/a11y/useMediaCaption: user-rendered edited clip has no caption track */}
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
                    <button
                      type="button"
                      onClick={() => setEditorOpen(true)}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <VideoIcon className="h-6 w-6 opacity-30" />
                      <span className="text-2xs">Double-click to open the editor</span>
                    </button>
                  )}
                </div>

                <Button
                  variant="default"
                  size="sm"
                  className="h-8 w-full justify-center text-xs"
                  onClick={() => setEditorOpen(true)}
                >
                  <Pencil2Icon className="mr-1 h-3.5 w-3.5" />
                  Open editor
                </Button>
              </NodeContent>
            </CanvasNode>

            <div
              className="pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <LimitedHandle
                    type="target"
                    position={Position.Left}
                    id={TIMELINE_MEDIA_INPUT_HANDLE}
                    maxConnections={TIMELINE_MEDIA_POOL_LIMIT}
                    className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Connect images &amp; videos to place in the editor</p>
                </TooltipContent>
              </Tooltip>
            </div>

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
          <ContextMenuItem onClick={() => setEditorOpen(true)}>
            <Pencil2Icon className="mr-2 h-4 w-4" />
            Open editor
          </ContextMenuItem>
          <ContextMenuItem onClick={() => render()} disabled={renderDisabled}>
            <PlayIcon className="mr-2 h-4 w-4" />
            Render &amp; Continue
            <ContextMenuShortcut>R</ContextMenuShortcut>
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

      {editorOpen ? (
        <TimelineEditorDialog adapter={adapter} open={editorOpen} onOpenChange={setEditorOpen} />
      ) : null}
    </TooltipProvider>
  );
}
