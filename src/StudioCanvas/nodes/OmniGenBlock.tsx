import type { BrandBookPieceKind,
  DesignSection,
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
import { Copy, Download, Pencil, Play, Trash2, Video } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { useBrandDesignSections } from '@/lib/brands/useBrandDesignSections.client';
import { GroundingChip } from '../components/GroundingChip';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { OmniGenNodeData, OmniVariation } from '../types';
import {
  OMNI_GENERATOR_NODE_BOUNDS,
  snapNodeDimensionsToAspectRatio,
} from '../utils/aspectRatioSizing';
import { toggleBrandPiece, toggleSkillId,
  toggleDesignSection,
} from '../utils/brandEnforcement';
import { downloadAsset } from '../utils/downloadAsset';
import { executeWorkflow } from '../utils/executeWorkflow';

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

export function OmniGenBlock({ id, data, selected }: NodeProps<ReactFlowNode<OmniGenNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const executionControls = useWorkflowExecution();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  const [isHovered, setIsHovered] = useState(false);
  const [editText, setEditText] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const aspectRatio = data.aspectRatio ?? '16:9';
  const variations = useMemo(() => data.variations ?? [], [data.variations]);
  const activeVariation = useMemo(
    () =>
      variations.find((v) => v.id === data.activeVariationId) ?? variations[variations.length - 1],
    [variations, data.activeVariationId],
  );
  const hasChain = variations.length > 0;
  const isToolbarVisible = selected || isHovered || Boolean(data.isToolbarVisible);
  const previewVideo = activeVariation?.videoUrl ?? data.generatedVideo ?? data.generatedVideoUrl;
  const previewPending = data.isExecuting || activeVariation?.status === 'pending';
  const canEdit = Boolean(activeVariation && activeVariation.status === 'done');

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      updateNode(id, (node) => {
        const next = snapNodeDimensionsToAspectRatio({
          aspectRatio: value,
          currentWidth: node.style?.width ?? node.width ?? node.measured?.width,
          currentHeight: node.style?.height ?? node.height ?? node.measured?.height,
          minWidth: OMNI_GENERATOR_NODE_BOUNDS.minWidth,
          minHeight: OMNI_GENERATOR_NODE_BOUNDS.minHeight,
          fallbackWidth: OMNI_GENERATOR_NODE_BOUNDS.fallbackWidth,
        });
        return {
          ...node,
          data: { ...(node.data as OmniGenNodeData), aspectRatio: value as '16:9' | '9:16' },
          style: { ...(node.style ?? {}), width: next.width, height: next.height },
        };
      });
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

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

  const handlePromptChange = useCallback(
    (value: string) => {
      updateNodeData(id, { prompt: value });
    },
    [id, updateNodeData],
  );

  const handleRun = useCallback(async () => {
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [executionControls, id, brandId]);

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

  const handleSubmitEdit = useCallback(async () => {
    const instruction = editText.trim();
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

    setIsEditing(true);
    setEditOpen(false);
    setEditText('');
    updateNode(id, (node) => ({
      ...node,
      data: {
        ...(node.data as OmniGenNodeData),
        variations: [...((node.data as OmniGenNodeData).variations ?? []), pending],
        activeVariationId: variationId,
        isExecuting: false,
      },
    }));

    try {
      const result = await executionControls.executeOmniTurn(id, {
        brandId,
        turn: 'edit',
        prompt: instruction,
        aspectRatio,
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
    } finally {
      setIsEditing(false);
    }
  }, [
    activeVariation,
    aspectRatio,
    brandId,
    editText,
    executionControls,
    id,
    show,
    triggerSave,
    updateNode,
  ]);

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
                'relative group h-full w-full min-w-[320px] min-h-[260px] rounded-xl transition-shadow',
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
                  <div className="relative flex-1 min-h-0 bg-muted/30">
                    {/* The node's own box carries the aspect ratio now, so the preview simply
                        fills it. A Radix AspectRatio here sized itself from the WIDTH and
                        ignored h-full: a 9:16 ratio in a 512-wide box computed ~512x910 and
                        the overflow-hidden card clipped it, which read as extreme zoom
                        (Airtable #232). object-contain letterboxes instead of cropping. */}
                    <div
                      className="relative h-full w-full overflow-hidden bg-muted"
                      data-testid="studio-node-preview"
                    >
                      {previewPending ? (
                        <div className="flex h-full w-full items-center justify-center bg-muted p-4">
                          <GenerationPulseLoader />
                        </div>
                      ) : previewVideo ? (
                        <div className="relative flex h-full w-full items-center justify-center bg-black/85">
                          {/* biome-ignore lint/a11y/useMediaCaption: generated preview clip has no caption track */}
                          <video
                            src={previewVideo as string}
                            controls
                            className="h-full w-full object-contain"
                          />
                          <Button
                            variant="secondary"
                            size="icon"
                            className="nodrag absolute right-2 top-2 z-20 h-7 w-7 border border-border/70 bg-background/90 opacity-90 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDownload();
                            }}
                            title="Download Output"
                            aria-label="Download generated video"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-secondary">
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon" className="bg-default text-secondary">
                                <Video />
                              </EmptyMedia>
                              <EmptyTitle>Omni Flash</EmptyTitle>
                              <EmptyDescription>
                                Describe a clip, then chat to edit it
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                          <Textarea
                            value={data.prompt ?? ''}
                            onChange={(event) => handlePromptChange(event.target.value)}
                            onMouseDown={(event) => event.stopPropagation()}
                            placeholder="A marble rolling down a track…"
                            className="nodrag h-16 w-[85%] resize-none text-xs"
                          />
                          <Button
                            size="sm"
                            className="nodrag"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRun();
                            }}
                          >
                            <Play className="mr-1.5 h-3.5 w-3.5" /> Generate
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {hasChain && (
                    <div className="flex items-center gap-1.5 border-t border-border/60 bg-background/95 p-1.5">
                      <div className="nodrag flex flex-1 gap-1.5 overflow-x-auto">
                        {variations.map((variation, index) => {
                          const isActive = variation.id === (activeVariation?.id ?? '');
                          return (
                            <button
                              type="button"
                              key={variation.id}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSelectVariation(variation);
                              }}
                              title={variation.label}
                              className={cn(
                                'relative h-11 w-16 shrink-0 overflow-hidden rounded-md border bg-muted text-3xs transition-colors',
                                isActive
                                  ? 'border-brand-primary ring-1 ring-brand-primary'
                                  : 'border-border/70',
                                variation.status === 'error' && 'border-destructive',
                              )}
                            >
                              {variation.status === 'pending' ? (
                                <span className="flex h-full w-full items-center justify-center">
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-brand-primary" />
                                </span>
                              ) : variation.videoUrl ? (
                                // biome-ignore lint/a11y/useMediaCaption: silent thumbnail, no captions
                                <video
                                  src={variation.videoUrl}
                                  muted
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  !
                                </span>
                              )}
                              <span className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-1 text-[8px] leading-tight text-white">
                                {index === 0 ? 'Original' : `v${index + 1}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <Popover open={editOpen} onOpenChange={setEditOpen}>
                        <PopoverTrigger
                          render={
                            <Button
                              size="sm"
                              variant="secondary"
                              className="nodrag h-8 shrink-0"
                              disabled={!canEdit || isEditing}
                              onMouseDown={(event) => event.stopPropagation()}
                              title={canEdit ? 'Edit this clip' : 'Generate a clip first'}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                            </Button>
                          }
                        />
                        <PopoverContent
                          align="end"
                          className="nodrag w-72"
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          <p className="mb-2 text-xs text-muted-foreground">
                            Describe a change. Omni keeps the rest of the clip.
                          </p>
                          <Textarea
                            value={editText}
                            onChange={(event) => setEditText(event.target.value)}
                            placeholder="Make the sky sunset orange…"
                            className="mb-2 h-20 resize-none text-xs"
                            onKeyDown={(event) => {
                              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                                event.preventDefault();
                                void handleSubmitEdit();
                              }
                            }}
                          />
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              disabled={!editText.trim() || isEditing}
                              onClick={() => void handleSubmitEdit()}
                            >
                              Send edit
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </NodeContent>
              </CanvasNode>

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
                    <p>Prompt (optional — or type inline)</p>
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
              </div>

              <div
                className={cn(
                  'pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded bg-background/85 px-2 py-0.5 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity',
                  selected || isHovered ? 'opacity-100' : 'opacity-0',
                )}
              >
                Gemini Omni Flash • {aspectRatio}
                {hasChain
                  ? ` • ${variations.length} variation${variations.length === 1 ? '' : 's'}`
                  : ''}
              </div>
            </div>
          }
        />
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Omni Flash</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={hasChain}>Aspect Ratio</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              {['16:9', '9:16'].map((value) => (
                <ContextMenuCheckboxItem
                  key={value}
                  checked={aspectRatio === value}
                  onClick={() => handleAspectRatioChange(value)}
                >
                  {value}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
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
