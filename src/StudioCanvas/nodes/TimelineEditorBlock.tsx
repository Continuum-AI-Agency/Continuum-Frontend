import {
  editorCommandBatchSchema,
  TIMELINE_MEDIA_INPUT_HANDLE,
  TIMELINE_MEDIA_POOL_LIMIT,
  timelineAuthoringDocumentSchema,
  timelineDocumentFingerprint,
} from '@continuum/contracts';
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
import {
  Copy,
  Download,
  ExternalLink,
  Library,
  Play,
  SquarePen,
  Trash2,
  Video,
} from 'lucide-react';
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
import {
  applyVideoProjectCommands,
  createVideoProject,
  getVideoProject,
  getVideoProjectSummary,
  resolveVideoProject,
} from '@/lib/api/videoProjects.client';
import { cn } from '@/lib/utils';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { TimelineEditorNodeData } from '../types';
import { downloadAsset } from '../utils/downloadAsset';
import { TimelineEditorDialog } from './timeline/TimelineEditorDialog';
import { useCanvasTimelineAdapter } from './timeline/useCanvasTimelineAdapter';
import { useTimelineRender } from './timeline/useTimelineRender';
import { VideoProductionWorkspaceDialog } from './timeline/VideoProductionWorkspaceDialog';

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
  const projectSetup = useRef(false);
  const seedSetup = useRef(false);
  const handledRenderRequests = useRef(new Set<string>());

  const edges = useEdges();

  useEffect(() => {
    if (!adapter.brandId || data.videoProjectId || projectSetup.current) return;
    projectSetup.current = true;
    let cancelled = false;
    const binding = { bindingType: 'canvas_node' as const, externalId: id };
    void (async () => {
      let projectId = await resolveVideoProject({ brandId: adapter.brandId as string, binding });
      if (!projectId) {
        try {
          const project = await createVideoProject({
            brandId: adapter.brandId as string,
            title:
              typeof data.label === 'string' && data.label.trim() ? data.label : 'Video production',
            width: 1080,
            height: 1920,
            binding,
          });
          projectId = project.projectId;
        } catch (error) {
          // A second tab may have won the unique binding race. Resolve once more
          // before surfacing an error.
          projectId = await resolveVideoProject({ brandId: adapter.brandId as string, binding });
          if (!projectId) throw error;
        }
      }
      if (cancelled) return;
      const summary = await getVideoProjectSummary(projectId);
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as TimelineEditorNodeData),
          videoProjectId: projectId,
          videoProductionSummary: summary,
        },
      }));
      triggerSave();
    })().catch((error) => {
      projectSetup.current = false;
      if (cancelled) return;
      show({
        title: 'Video production unavailable',
        description: error instanceof Error ? error.message : 'Could not create the project.',
        variant: 'error',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [adapter.brandId, data.label, data.videoProjectId, id, show, triggerSave, updateNode]);

  useEffect(() => {
    if (!data.videoProjectId) return;
    const refresh = () =>
      void getVideoProjectSummary(data.videoProjectId as string)
        .then((summary) => {
          updateNode(id, (node) => ({
            ...node,
            data: { ...(node.data as TimelineEditorNodeData), videoProductionSummary: summary },
          }));
        })
        .catch(() => undefined);
    refresh();
    const interval = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(interval);
  }, [data.videoProjectId, id, updateNode]);

  useEffect(() => {
    const seed = data.productionSeed;
    if (!seed || !data.videoProjectId || data.videoProductionSeeded || seedSetup.current) return;
    seedSetup.current = true;
    let cancelled = false;
    void (async () => {
      const project = await getVideoProject(data.videoProjectId as string);
      const poolById = new Map(adapter.pool.map((source) => [source.nodeId, source]));
      const references = seed.references.flatMap((reference) => {
        const source = poolById.get(reference.nodeId);
        if (!source?.sourceAssetId || !source.sourceVersionId) return [];
        return [
          {
            id: reference.nodeId,
            role: reference.role,
            asset: { assetId: source.sourceAssetId, versionId: source.sourceVersionId },
            label: source.label,
          },
        ];
      });
      const commandDrafts = [
        ...(references.length > 0 && project.production.references.length === 0
          ? [{ commandType: 'set_production_references' as const, references }]
          : []),
        ...(project.production.shots.length === 0
          ? seed.shots.map((shot) => ({
              commandType: 'upsert_shot' as const,
              shot: { ...shot, referenceIds: [], takes: [], selection: {} },
            }))
          : []),
      ];
      if (commandDrafts.length > 0) {
        const issuedAt = new Date().toISOString();
        const actor = { actorId: 'current-user', actorType: 'user' as const };
        const batchId = crypto.randomUUID();
        const batch = editorCommandBatchSchema.parse({
          batchId,
          projectId: project.projectId,
          sequenceId: project.sequenceId,
          idempotencyKey: `production-seed:${batchId}`,
          expectedRevision: project.revision,
          expectedFingerprint: project.fingerprint,
          atomic: true,
          issuedAt,
          actor,
          commands: commandDrafts.map((command) => {
            const commandId = crypto.randomUUID();
            return {
              ...command,
              commandId,
              idempotencyKey: `production-seed-command:${commandId}`,
              expectedRevision: project.revision,
              issuedAt,
              actor,
            };
          }),
        });
        await applyVideoProjectCommands(batch);
      }
      if (cancelled) return;
      const fullyPinned = references.length === seed.references.length;
      if (!fullyPinned) seedSetup.current = false;
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as TimelineEditorNodeData),
          videoProductionSeeded: fullyPinned,
        },
      }));
      triggerSave();
    })().catch(() => {
      seedSetup.current = false;
    });
    return () => {
      cancelled = true;
    };
  }, [
    adapter.pool,
    data.productionSeed,
    data.videoProductionSeeded,
    data.videoProjectId,
    id,
    triggerSave,
    updateNode,
  ]);

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
  const production = data.videoProductionSummary;
  const isRunning = Boolean(data.isExecuting) || isRendering;
  const isAwaiting =
    Boolean((data as { awaitingInput?: boolean }).awaitingInput) && !data.committed;
  const progress = isRendering
    ? renderProgress
    : typeof data.progress === 'number'
      ? Math.max(0, Math.min(1, data.progress))
      : 0;
  const displayVideo = data.generatedVideo ?? data.generatedVideoUrl;
  // A finished render always lands in the media Library, even when it could not be
  // applied back to the node (timeline changed mid-render). Nothing on the node used
  // to name that destination, so the tester watched it render and had no idea where
  // it went (#253).
  const libraryHref = data.renderOutputAssetId
    ? `/library?assetId=${encodeURIComponent(data.renderOutputAssetId)}`
    : null;

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
        <ContextMenuTrigger
          render={
            // biome-ignore lint/a11y/noStaticElementInteractions: node hover only toggles toolbar visibility; no semantic role applies
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
                  onClick={() => {
                    setEditorOpen(true);
                  }}
                  title="Open editor"
                >
                  <SquarePen className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (data.videoProjectId) {
                      setEditorOpen(true);
                      return;
                    }
                    void render();
                  }}
                  disabled={data.videoProjectId ? false : renderDisabled}
                  title={data.videoProjectId ? 'Open production' : 'Render & Continue'}
                >
                  <Play className="h-4 w-4" />
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
                      {production
                        ? `${production.approvedMasters}/${production.shotCount} masters`
                        : `${inputCount} input${inputCount === 1 ? '' : 's'} · ${clipCount} clip${clipCount === 1 ? '' : 's'}`}
                    </span>
                  </div>

                  {support && !support.ok ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                      {support.reason}
                    </div>
                  ) : null}

                  {isAwaiting ? (
                    <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                      Paused — open the editor and click Render &amp; Continue to resume the
                      workflow.
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
                          aria-label="Download edited video"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditorOpen(true);
                        }}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Video className="h-6 w-6 opacity-30" />
                        <span className="text-2xs">
                          {production
                            ? production.stage.replaceAll('_', ' ')
                            : 'Double-click to open the editor'}
                        </span>
                      </button>
                    )}
                  </div>

                  {data.error ? (
                    <div
                      className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive"
                      data-testid="studio-timeline-render-error"
                    >
                      {data.error}
                    </div>
                  ) : null}

                  {libraryHref ? (
                    <a
                      href={libraryHref}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="studio-timeline-render-destination"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      className="nodrag nopan flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Library className="h-3.5 w-3.5" />
                      <span className="font-medium text-foreground">Saved to Library</span>
                      <ExternalLink className="ml-auto h-3 w-3" />
                    </a>
                  ) : null}

                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 w-full justify-center text-xs"
                    onClick={() => {
                      setEditorOpen(true);
                    }}
                  >
                    <SquarePen className="mr-1 h-3.5 w-3.5" />
                    {production ? 'Open production' : 'Open editor'}
                  </Button>
                </NodeContent>
              </CanvasNode>

              <div
                className="pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2"
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <LimitedHandle
                        type="target"
                        position={Position.Left}
                        id={TIMELINE_MEDIA_INPUT_HANDLE}
                        maxConnections={TIMELINE_MEDIA_POOL_LIMIT}
                        className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                      />
                    }
                  />
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
                  <TooltipTrigger
                    render={
                      <Handle
                        type="source"
                        position={Position.Right}
                        id="video"
                        className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                      />
                    }
                  />
                  <TooltipContent>
                    <p>Edited Video Output</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          }
        />
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Video Editor</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => setEditorOpen(true)}>
            <SquarePen className="mr-2 h-4 w-4" />
            Open editor
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              if (data.videoProjectId) setEditorOpen(true);
              else void render();
            }}
            disabled={data.videoProjectId ? false : renderDisabled}
          >
            <Play className="mr-2 h-4 w-4" />
            {data.videoProjectId ? 'Open production' : 'Render & Continue'}
            <ContextMenuShortcut>R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDownload} disabled={!displayVideo}>
            <Download className="mr-2 h-4 w-4" />
            Download Output
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

      {editorOpen ? (
        data.videoProjectId && adapter.brandId ? (
          <VideoProductionWorkspaceDialog
            projectId={data.videoProjectId}
            brandId={adapter.brandId}
            pool={adapter.pool}
            open={editorOpen}
            onOpenChange={setEditorOpen}
          />
        ) : (
          <TimelineEditorDialog adapter={adapter} open={editorOpen} onOpenChange={setEditorOpen} />
        )
      ) : null}
    </TooltipProvider>
  );
}
