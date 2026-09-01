import type { BrandBookPieceKind, DesignSection } from '@continuum/contracts';
import { VIDEO_REFERENCE_VIDEO_HANDLE } from '@continuum/contracts';
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
import { Copy, Download, Play, SquarePen, Trash2, Video } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBrandDesignSections } from '@/lib/brands/useBrandDesignSections.client';
import { cn } from '@/lib/utils';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { GroundingChip } from '../components/GroundingChip';
import { NodeVideoPreview } from '../components/NodeVideoPreview';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useNodeConfigPatch } from '../hooks/useNodeConfigPatch';
import { useSnapToVideoAspect } from '../hooks/useSnapToVideoAspect';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { OmniGenNodeData, OmniVariation } from '../types';
import { OMNI_GENERATOR_NODE_BOUNDS } from '../utils/aspectRatioSizing';
import { toggleBrandPiece, toggleDesignSection, toggleSkillId } from '../utils/brandEnforcement';
import { downloadAsset } from '../utils/downloadAsset';
import { executeWorkflow } from '../utils/executeWorkflow';
import { NodeDownloadButton } from './NodeDownloadButton';
import { OmniGenDialog } from './omni/OmniGenDialog';

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

const newVariationId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `omni-${Date.now()}-${Math.round(performance.now())}`;
  }
};

const videoSourceOf = (data: Record<string, unknown>): string | undefined => {
  for (const key of ['generatedVideoUrl', 'generatedVideo', 'video', 'sourceUrl']) {
    const value = data[key];
    // generatedVideo is typed `string | Blob`; a Blob in an <video src> is a broken
    // preview, so only a real string counts as a source.
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
};

export function OmniGenBlock({ id, data, selected }: NodeProps<ReactFlowNode<OmniGenNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useEdges();
  const patch = useNodeConfigPatch();
  const executionControls = useWorkflowExecution();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  const [isHovered, setIsHovered] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const aspectRatio = data.aspectRatio ?? '16:9';
  const resolution = data.resolution ?? '720p';
  const videoTask = data.videoTask ?? 'edit';
  const variations = useMemo(() => data.variations ?? [], [data.variations]);
  const activeVariation = useMemo(
    () =>
      variations.find((v) => v.id === data.activeVariationId) ?? variations[variations.length - 1],
    [variations, data.activeVariationId],
  );
  const hasChain = variations.length > 0;
  const isToolbarVisible = selected || isHovered || Boolean(data.isToolbarVisible);
  const previewVideo = activeVariation?.videoUrl ?? videoSourceOf(data as Record<string, unknown>);
  const isTurnPending = useMemo(
    () => variations.some((variation) => variation.status === 'pending'),
    [variations],
  );
  const previewPending = Boolean(data.isExecuting) || isTurnPending;

  // A clip wired into ref-video turns a run into an edit or extend of THAT clip.
  const videoInput = useMemo(() => {
    const edge = edges.find(
      (candidate) =>
        candidate.target === id && candidate.targetHandle === VIDEO_REFERENCE_VIDEO_HANDLE,
    );
    if (!edge) return undefined;
    const source = nodes.find((node) => node.id === edge.source);
    if (!source) return undefined;
    const sourceData = (source.data ?? {}) as Record<string, unknown>;
    const label =
      (typeof sourceData.label === 'string' && sourceData.label) || source.type || 'Wired clip';
    return { label, previewUrl: videoSourceOf(sourceData) };
  }, [edges, id, nodes]);

  // Re-snap the box to whatever the model actually returned — the requested
  // `data.aspectRatio` stays untouched, it is what the next run will ask for.
  useSnapToVideoAspect({ nodeId: id, src: previewVideo, bounds: OMNI_GENERATOR_NODE_BOUNDS });

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as OmniGenNodeData),
          skillIds: toggleSkillId((node.data as OmniGenNodeData).skillIds, skillId),
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  const handleToggleBrandPiece = useCallback(
    (kind: BrandBookPieceKind) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as OmniGenNodeData),
          brandBookPieces: toggleBrandPiece((node.data as OmniGenNodeData).brandBookPieces, kind),
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  /*
   * The design-system half of the same control. `designSections` is what the brand's
   * uploaded system actually has switched on, and it is the set the first toggle expands
   * into: `undefined` is "no preference", so landing on `[section]` would switch every
   * other section off as a side effect of touching one.
   */
  const { sections: designSections } = useBrandDesignSections(brandId);
  const handleToggleDesignSection = useCallback(
    (section: DesignSection) => {
      const enabled = designSections.map((entry) => entry.section);
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as OmniGenNodeData),
          designSystemSections: toggleDesignSection(
            (node.data as OmniGenNodeData).designSystemSections,
            section,
            enabled,
          ),
        },
      }));
      triggerSave();
    },
    [designSections, id, triggerSave, updateNode],
  );

  const handleRun = useCallback(async () => {
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [executionControls, id, brandId]);

  const handleGenerate = useCallback(
    async (prompt: string) => {
      updateNodeData(id, { prompt });
      await handleRun();
    },
    [handleRun, id, updateNodeData],
  );

  const handleSelectVariation = useCallback(
    (variation: OmniVariation) => {
      if (variation.status !== 'done') return;
      updateNodeData(id, {
        activeVariationId: variation.id,
        generatedVideo: variation.videoUrl,
        generatedVideoUrl: variation.videoUrl,
        generatedVideoStoragePath: variation.storagePath,
        generatedVideoBucket: variation.bucket,
        previousInteractionId: variation.interactionId,
      });
      triggerSave();
    },
    [id, triggerSave, updateNodeData],
  );

  /**
   * One conversational turn against the active clip.
   *
   * The in-flight marker is the optimistic `pending` variation in the store, NOT a
   * component boolean: the editor dialog can be closed and reopened mid-turn, and a
   * local flag would reset with it and lose the spinner. Nothing here is persisted
   * until the turn lands — serialization drops pending rows so a tab closed mid-turn
   * does not reload into a tile that spins forever.
   */
  const handleSubmitTurn = useCallback(
    async (instruction: string) => {
      const base = activeVariation;
      if (!instruction || !base || base.status !== 'done') return;
      if (!brandId) {
        show({
          title: 'Select a brand',
          description: 'Editing needs an active brand.',
          variant: 'warning',
        });
        return;
      }
      if (!base.interactionId) {
        show({
          title: 'Edit chain unavailable',
          description: 'This clip has no interaction to edit. Regenerate to start a new chain.',
          variant: 'warning',
        });
        return;
      }

      const variationId = newVariationId();
      const pending: OmniVariation = {
        id: variationId,
        label: instruction.slice(0, 40),
        instruction,
        parentInteractionId: base.interactionId,
        status: 'pending',
        createdAt: Date.now(),
      };

      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as OmniGenNodeData),
          variations: [...((node.data as OmniGenNodeData).variations ?? []), pending],
          activeVariationId: variationId,
        },
      }));

      const result = await executionControls.executeOmniTurn(id, {
        brandId,
        turn: 'edit',
        prompt: instruction,
        aspectRatio,
        resolution,
        previousInteractionId: base.interactionId,
      });

      updateNode(id, (node) => {
        const current = (node.data as OmniGenNodeData).variations ?? [];
        const patched = current.map((variation): OmniVariation => {
          if (variation.id !== variationId) return variation;
          if (result.success && result.output) {
            return {
              ...variation,
              status: 'done',
              videoUrl: result.output.url,
              storagePath: result.output.storagePath,
              bucket: result.output.storageBucket,
              interactionId: result.interactionId,
            };
          }
          return { ...variation, status: 'error', error: result.error ?? 'Edit failed' };
        });
        const succeeded = result.success && result.output;
        return {
          ...node,
          data: {
            ...(node.data as OmniGenNodeData),
            variations: patched,
            ...(succeeded
              ? {
                  generatedVideo: result.output!.url,
                  generatedVideoUrl: result.output!.url,
                  generatedVideoStoragePath: result.output!.storagePath,
                  generatedVideoBucket: result.output!.storageBucket,
                  previousInteractionId: result.interactionId,
                }
              : {}),
          },
        };
      });
      triggerSave();
    },
    [
      activeVariation,
      aspectRatio,
      brandId,
      executionControls,
      id,
      resolution,
      show,
      triggerSave,
      updateNode,
    ],
  );

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: previewVideo,
      baseName: `omni-${id}`,
      fallbackExtension: 'mp4',
    });
    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Generate a clip before downloading.',
        variant: 'warning',
      });
    }
  }, [previewVideo, id, show]);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            // biome-ignore lint/a11y/noStaticElementInteractions: canvas node hover affordance, not an interactive control
            <div
              className={cn(
                'relative group h-full w-full min-w-[240px] min-h-[140px] rounded-xl transition-shadow',
                isSelectedByOther && 'selected-by-other',
              )}
              style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {/* Inside the card's top-left, not straddling its border: `-top-3` against a
                  24px chip put exactly half of it outside the node (Airtable #229). */}
              <div className="absolute left-2 top-2 z-10" data-testid="studio-grounding-chip">
                <GroundingChip
                  nodeId={id}
                  nodeType="omniGen"
                  brandId={brandId}
                  skillIds={data.skillIds}
                  brandBookPieces={data.brandBookPieces}
                  editable
                  onToggleSkill={handleToggleSkill}
                  onTogglePiece={handleToggleBrandPiece}
                  designSystemSections={data.designSystemSections}
                  onToggleDesignSection={handleToggleDesignSection}
                  className="bg-background/90 shadow-sm backdrop-blur-sm"
                />
              </div>
              <NodeResizer
                minWidth={OMNI_GENERATOR_NODE_BOUNDS.minWidth}
                minHeight={OMNI_GENERATOR_NODE_BOUNDS.minHeight}
                keepAspectRatio
                isVisible={selected}
                lineClassName="border-brand-primary/60"
                handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
              />

              <Toolbar
                isVisible={isToolbarVisible}
                position={Position.Top}
                align="end"
                className="gap-1.5 border-border/80 bg-background/95 shadow-lg backdrop-blur-sm"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleRun}
                  title={hasChain ? 'Regenerate Original' : 'Generate'}
                >
                  <Play className="h-4 w-4" />
                </Button>
              </Toolbar>

              <CanvasNode
                handles={{ target: false, source: false }}
                selected={selected}
                className="h-full w-full overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
              >
                <NodeContent className="relative flex h-full min-h-0 flex-col p-0">
                  <div
                    className="relative h-full w-full overflow-hidden bg-muted"
                    data-testid="studio-node-preview"
                  >
                    {previewPending ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted p-4">
                        <GenerationPulseLoader />
                      </div>
                    ) : previewVideo ? (
                      <NodeVideoPreview src={previewVideo} />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-secondary">
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon" className="bg-default text-secondary">
                              <Video />
                            </EmptyMedia>
                            <EmptyTitle>Omni 1.1 Flash</EmptyTitle>
                            <EmptyDescription>
                              Describe a clip, then chat to edit it
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </div>
                    )}

                    {/* Download used to be reachable only from the right-click menu and
                        the editor dialog, which is not the same affordance the sibling
                        generators show on the card itself (Airtable #288). */}
                    <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="nodrag h-7 border border-border/70 bg-background/90 opacity-90 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditorOpen(true);
                        }}
                        title="Open the Omni editor"
                      >
                        <SquarePen className="mr-1 h-3.5 w-3.5" />
                        Open
                      </Button>
                      <NodeDownloadButton
                        nodeType="omniGen"
                        data={data}
                        baseName={`omni-${id}`}
                        className="static h-7 w-7"
                      />
                    </div>

                    {hasChain ? (
                      <span className="pointer-events-none absolute bottom-2 left-2 z-20 rounded bg-background/85 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                        {variations.length} variation{variations.length === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                </NodeContent>
              </CanvasNode>

              {editorOpen ? (
                <OmniGenDialog
                  open={editorOpen}
                  onOpenChange={setEditorOpen}
                  aspectRatio={aspectRatio}
                  resolution={resolution}
                  videoTask={videoTask}
                  prompt={data.prompt ?? ''}
                  variations={variations}
                  activeVariation={activeVariation}
                  videoInput={videoInput}
                  onAspectRatioChange={(value) => patch(id, 'omniGen', { aspectRatio: value })}
                  onResolutionChange={(value) => patch(id, 'omniGen', { resolution: value })}
                  onVideoTaskChange={(value) => patch(id, 'omniGen', { videoTask: value })}
                  onPromptChange={(value) => updateNodeData(id, { prompt: value })}
                  onSelectVariation={handleSelectVariation}
                  onGenerate={handleGenerate}
                  onSubmitTurn={handleSubmitTurn}
                  onDownload={handleDownload}
                />
              ) : null}

              <div
                className="absolute -right-2 top-1/2 flex -translate-y-1/2 flex-col items-center group/handle pointer-events-none"
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Handle
                        type="source"
                        position={Position.Right}
                        id="video"
                        className="studio-handle !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
                      />
                    }
                  />
                  <TooltipContent>
                    <p>Generated Video Output</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="absolute -left-5 top-0 bottom-0 z-20 flex h-full flex-col justify-evenly py-4 pointer-events-none">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div
                        className="relative pointer-events-auto group/handle"
                        style={{
                          ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)',
                        }}
                      >
                        <LimitedHandle
                          type="target"
                          position={Position.Left}
                          id="prompt-in"
                          maxConnections={1}
                          className="studio-handle !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                        />
                        <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap px-2 py-1 text-2xs font-medium opacity-0 shadow-md transition-opacity group-hover/handle:opacity-100 z-50 pointer-events-none">
                          Prompt
                        </span>
                      </div>
                    }
                  />
                  <TooltipContent>
                    <p>Prompt (optional — or type in the editor)</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div
                        className="relative pointer-events-auto group/handle"
                        style={{
                          ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)',
                        }}
                      >
                        <LimitedHandle
                          type="target"
                          position={Position.Left}
                          id="ref-images"
                          maxConnections={3}
                          className="studio-handle !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                        />
                        <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap px-2 py-1 text-2xs font-medium opacity-0 shadow-md transition-opacity group-hover/handle:opacity-100 z-50 pointer-events-none">
                          Ref Images (Max 3)
                        </span>
                      </div>
                    }
                  />
                  <TooltipContent>
                    <p>Reference images (generate only)</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div
                        className="relative pointer-events-auto group/handle"
                        style={{
                          ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)',
                        }}
                      >
                        <LimitedHandle
                          type="target"
                          position={Position.Left}
                          id={VIDEO_REFERENCE_VIDEO_HANDLE}
                          maxConnections={1}
                          className="studio-handle !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                        />
                        <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap px-2 py-1 text-2xs font-medium opacity-0 shadow-md transition-opacity group-hover/handle:opacity-100 z-50 pointer-events-none">
                          Clip In (1)
                        </span>
                      </div>
                    }
                  />
                  <TooltipContent>
                    <p>A clip to edit or extend</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div
                className={cn(
                  'pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded bg-background/85 px-2 py-0.5 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity',
                  selected || isHovered ? 'opacity-100' : 'opacity-0',
                )}
              >
                Gemini Omni 1.1 • {aspectRatio} • {resolution}
              </div>
            </div>
          }
        />
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Omni 1.1 Flash</ContextMenuLabel>
          <ContextMenuItem onClick={() => setEditorOpen(true)}>
            <SquarePen className="mr-2 h-4 w-4" />
            Open Editor
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleRun}>
            <Play className="mr-2 h-4 w-4" />
            {hasChain ? 'Regenerate Original' : 'Generate'}
            <ContextMenuShortcut>R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDownload} disabled={!previewVideo}>
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
    </TooltipProvider>
  );
}
