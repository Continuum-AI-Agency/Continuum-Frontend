import type { BrandBookPieceKind } from '@continuum/contracts';
import { CopyIcon, DownloadIcon, PlayIcon, TrashIcon, VideoIcon } from '@radix-ui/react-icons';
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
import { useCallback, useState } from 'react';
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
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { GroundingChip } from '../components/GroundingChip';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { VideoGenNodeData } from '../types';
import {
  snapNodeDimensionsToAspectRatio,
  VIDEO_GENERATOR_NODE_BOUNDS,
} from '../utils/aspectRatioSizing';
import { toggleBrandPiece, toggleSkillId } from '../utils/brandEnforcement';
import { downloadAsset } from '../utils/downloadAsset';
import { executeWorkflow } from '../utils/executeWorkflow';
import {
  getVideoGeneratorImageLimit,
  getVideoGeneratorImageReferenceHandle,
  getVideoGeneratorReferenceModes,
  getVideoGeneratorTargetHandles,
  resolveVideoGeneratorModel,
  resolveVideoGeneratorReferenceMode,
  VIDEO_GENERATOR_MODEL_GROUPS,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_REFERENCE_MODE_LABELS,
  type VideoGeneratorModel,
  type VideoGeneratorReferenceMode,
} from '../utils/videoModel';

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

const getResolutionOptions = (
  model: VideoGeneratorModel,
): Array<NonNullable<VideoGenNodeData['resolution']>> => {
  if (model === 'veo-3.1' || model === 'veo-3.1-fast') return ['720p', '1080p', '4k'];
  return ['720p', '1080p'];
};

export function VideoGenBlock({
  id,
  data,
  type,
  selected,
}: NodeProps<ReactFlowNode<VideoGenNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const setEdges = useStudioStore((state) => state.setEdges);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const takeSnapshot = useStudioStore((state) => state.takeSnapshot);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const flowEdges = useEdges();
  const executionControls = useWorkflowExecution();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  // The REAL node type, not a hardcoded 'videoGen'. A legacy veoDirector/veoFast node
  // carries no data.model, so the type is the only thing that says which model it is —
  // and the store resolves its allowed handles from that same type. Guessing here made
  // the rail render handles the graph then refused.
  const nodeShape = { type, data: data as unknown as Record<string, unknown> };
  const model = resolveVideoGeneratorModel(nodeShape);
  const modelLabel = VIDEO_GENERATOR_MODEL_LABELS[model];
  const referenceMode = resolveVideoGeneratorReferenceMode(nodeShape);
  const availableReferenceModes = getVideoGeneratorReferenceModes(model);

  // Derived from the contract's handle list rather than a parallel set of booleans,
  // so the rail can never render a handle the graph would refuse to connect.
  const targetHandles = getVideoGeneratorTargetHandles(model, referenceMode);
  const supportsFrameInputs = targetHandles.includes('first-frame');
  const supportsReferenceVideo = targetHandles.includes('ref-video');
  const referenceImageHandle = getVideoGeneratorImageReferenceHandle(model, referenceMode);

  const [isHovered, setIsHovered] = useState(false);
  const isToolbarVisible = selected || isHovered || !!data.isToolbarVisible;
  const generatorDescription = `${modelLabel} • ${data.resolution ?? '720p'} • ${data.aspectRatio ?? '16:9'}`;

  const promptConnections = flowEdges.filter(
    (edge) => edge.target === id && ['prompt-in', 'prompt'].includes(edge.targetHandle ?? ''),
  ).length;
  const negativeConnections = flowEdges.filter(
    (edge) => edge.target === id && edge.targetHandle === 'negative',
  ).length;
  const firstFrameConnections = flowEdges.filter(
    (edge) => edge.target === id && edge.targetHandle === 'first-frame',
  ).length;
  const lastFrameConnections = flowEdges.filter(
    (edge) => edge.target === id && edge.targetHandle === 'last-frame',
  ).length;
  const referenceVideoConnections = flowEdges.filter(
    (edge) => edge.target === id && edge.targetHandle === 'ref-video',
  ).length;
  const refImageCount = flowEdges.filter(
    (edge) =>
      edge.target === id &&
      (edge.targetHandle === 'ref-images' || edge.targetHandle === 'ref-image'),
  ).length;

  const imageLimit = getVideoGeneratorImageLimit(model, referenceVideoConnections > 0);

  // Switching model or mode changes which handles exist, so setEdges → normalizeEdges
  // prunes the connections the new shape cannot hold. That is destructive, hence the
  // undo point and the count in the toast.
  const applyHandleShapeChange = useCallback(
    (patch: Partial<VideoGenNodeData>, title: string) => {
      // Both counts come from the store, and so does the array handed to setEdges.
      // Measuring `before` against React Flow's copy while reading `remaining` from the
      // store let the reported number come from two arrays that need not agree.
      const inboundCount = () =>
        useStudioStore.getState().edges.filter((edge) => edge.target === id).length;

      const before = inboundCount();
      takeSnapshot();
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as VideoGenNodeData), ...patch },
      }));
      // updateNode does not re-run normalizeEdges, so re-seat the edges against the
      // node's new handle shape explicitly.
      setEdges(useStudioStore.getState().edges);
      triggerSave();

      const dropped = before - inboundCount();
      if (dropped > 0) {
        show({
          title,
          description: `${dropped} incompatible connection${dropped === 1 ? '' : 's'} removed. Undo to restore.`,
          variant: 'warning',
        });
      }
    },
    [id, setEdges, show, takeSnapshot, triggerSave, updateNode],
  );

  const handleModelChange = useCallback(
    (nextModel: VideoGeneratorModel) => {
      // Carry the mode across when the new model also supports it. Snapping to the new
      // model's DEFAULT mode silently changed a choice the user never touched — and
      // since veo-3.1-fast defaults to frames and veo-3.1 to images, switching between
      // the two Veo models threw away every frame connection for no reason.
      const legalModes = getVideoGeneratorReferenceModes(nextModel);
      const nextMode = legalModes.includes(referenceMode) ? referenceMode : legalModes[0];

      applyHandleShapeChange(
        { model: nextModel, referenceMode: nextMode },
        `Switched to ${VIDEO_GENERATOR_MODEL_LABELS[nextModel]}`,
      );
    },
    [applyHandleShapeChange, referenceMode],
  );

  const handleReferenceModeChange = useCallback(
    (nextMode: VideoGeneratorReferenceMode) => {
      applyHandleShapeChange(
        { referenceMode: nextMode },
        `Switched to ${VIDEO_GENERATOR_REFERENCE_MODE_LABELS[nextMode]}`,
      );
    },
    [applyHandleShapeChange],
  );

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      updateNode(id, (node) => {
        const nextDimensions = snapNodeDimensionsToAspectRatio({
          aspectRatio: value,
          currentWidth: node.style?.width ?? node.width ?? node.measured?.width,
          currentHeight: node.style?.height ?? node.height ?? node.measured?.height,
          minWidth: VIDEO_GENERATOR_NODE_BOUNDS.minWidth,
          minHeight: VIDEO_GENERATOR_NODE_BOUNDS.minHeight,
          fallbackWidth: VIDEO_GENERATOR_NODE_BOUNDS.fallbackWidth,
        });

        return {
          ...node,
          data: {
            ...(node.data as VideoGenNodeData),
            aspectRatio: value as '16:9' | '9:16',
          },
          style: {
            ...(node.style ?? {}),
            width: nextDimensions.width,
            height: nextDimensions.height,
          },
        };
      });
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  const handleResolutionChange = useCallback(
    (value: string) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as VideoGenNodeData),
          resolution: value as VideoGenNodeData['resolution'],
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as VideoGenNodeData),
          skillIds: toggleSkillId((node.data as VideoGenNodeData).skillIds, skillId),
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
          ...(node.data as VideoGenNodeData),
          brandBookPieces: toggleBrandPiece((node.data as VideoGenNodeData).brandBookPieces, kind),
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  const handleRun = useCallback(async () => {
    console.info('[studio] run video node', { nodeId: id, model });
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [executionControls, id, brandId, model]);

  const fileBaseName = `video-${id}`;

  const displayVideo = (data.generatedVideo as string | Blob | undefined) ?? data.generatedVideoUrl;

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: displayVideo as string | Blob | undefined,
      baseName: fileBaseName,
      fallbackExtension: 'mp4',
    });

    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Run the node to generate a video before downloading.',
        variant: 'warning',
      });
    }
  }, [displayVideo, fileBaseName, show]);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas node hover affordance, not an interactive control */}
          <div
            className={cn(
              'relative group h-full w-full min-w-[300px] min-h-[170px] rounded-xl transition-shadow',
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
                className="bg-background/90 shadow-sm backdrop-blur-sm"
              />
            </div>
            <NodeResizer
              minWidth={VIDEO_GENERATOR_NODE_BOUNDS.minWidth}
              minHeight={VIDEO_GENERATOR_NODE_BOUNDS.minHeight}
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
                title="Run Node"
              >
                <PlayIcon className="h-4 w-4" />
              </Button>
            </Toolbar>

            <CanvasNode
              handles={{ target: false, source: false }}
              selected={selected}
              className="h-full w-full overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
            >
              <NodeContent className="relative flex-1 min-h-0 p-0 bg-muted/30 group/preview">
                {/* The node's own box carries the aspect ratio now, so the preview simply
                    fills it. A Radix AspectRatio here sized itself from the WIDTH and
                    ignored h-full: a 9:16 ratio in a 512-wide box computed ~512x910 and
                    the overflow-hidden card clipped it, which read as extreme zoom
                    (Airtable #232). object-contain letterboxes instead of cropping. */}
                <div
                  className="relative h-full w-full overflow-hidden bg-muted"
                  data-testid="studio-node-preview"
                >
                  {data.isExecuting ? (
                    <div className="w-full h-full flex items-center justify-center bg-muted p-4">
                      <GenerationPulseLoader />
                    </div>
                  ) : displayVideo ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-black/85">
                      {/* biome-ignore lint/a11y/useMediaCaption: generated preview clip has no caption track */}
                      <video
                        src={displayVideo as string}
                        controls
                        className="w-full h-full object-contain"
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        className="nodrag absolute right-2 top-2 z-20 h-7 w-7 border border-border/70 bg-background/90 opacity-90 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDownload();
                        }}
                        title="Download Output"
                        aria-label="Download generated video"
                      >
                        <DownloadIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-secondary gap-2">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon" className="bg-default text-secondary">
                            <VideoIcon />
                          </EmptyMedia>
                          <EmptyTitle>No Video</EmptyTitle>
                          <EmptyDescription>Generated video will appear here</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </div>
                  )}
                </div>
              </NodeContent>
            </CanvasNode>

            <div
              className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id="video"
                    className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Generated Video Output</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="absolute -left-5 top-0 bottom-0 flex flex-col justify-evenly py-4 pointer-events-none h-full z-20">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="relative pointer-events-auto group/handle"
                    style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
                  >
                    <LimitedHandle
                      type="target"
                      position={Position.Left}
                      id="prompt-in"
                      maxConnections={1}
                      className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                    />
                    <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                      Prompt
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Prompt: {promptConnections}/1</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="relative pointer-events-auto group/handle"
                    style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
                  >
                    <LimitedHandle
                      type="target"
                      position={Position.Left}
                      id="negative"
                      maxConnections={1}
                      className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                    />
                    <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                      Negative Prompt
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Negative Prompt: {negativeConnections}/1</p>
                </TooltipContent>
              </Tooltip>

              {supportsFrameInputs && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="relative pointer-events-auto group/handle"
                        style={{
                          ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)',
                        }}
                      >
                        <LimitedHandle
                          type="target"
                          position={Position.Left}
                          id="first-frame"
                          maxConnections={1}
                          className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                        />
                        <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                          First Frame
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>First Frame: {firstFrameConnections}/1</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="relative pointer-events-auto group/handle"
                        style={{
                          ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)',
                        }}
                      >
                        <LimitedHandle
                          type="target"
                          position={Position.Left}
                          id="last-frame"
                          maxConnections={1}
                          className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                        />
                        <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                          Last Frame
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Last Frame: {lastFrameConnections}/1</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}

              {referenceImageHandle && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="relative pointer-events-auto group/handle"
                      style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
                    >
                      <LimitedHandle
                        type="target"
                        position={Position.Left}
                        id={referenceImageHandle}
                        maxConnections={imageLimit}
                        className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                      />
                      <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                        Ref Images{imageLimit ? ` (Max ${imageLimit})` : ''}
                      </span>
                      {refImageCount > 0 && (
                        <div className="absolute left-[-24px] top-1/2 -translate-y-1/2 studio-handle-pill text-3xs px-1 rounded-full font-bold shadow-sm pointer-events-none">
                          {refImageCount}
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Reference Images: {refImageCount}/{imageLimit ?? '∞'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}

              {supportsReferenceVideo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="relative pointer-events-auto group/handle"
                      style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
                    >
                      <LimitedHandle
                        type="target"
                        position={Position.Left}
                        id="ref-video"
                        maxConnections={1}
                        className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                      />
                      <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                        Ref Video (Max 1)
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reference Video: {referenceVideoConnections}/1</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            <div
              className={cn(
                'pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded bg-background/85 px-2 py-0.5 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity',
                selected || isHovered ? 'opacity-100' : 'opacity-0',
              )}
            >
              {generatorDescription}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Video Generator</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Model</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              {VIDEO_GENERATOR_MODEL_GROUPS.map((group) => (
                <ContextMenuSub key={group.provider}>
                  <ContextMenuSubTrigger>{group.label}</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-44">
                    {group.models.map((option) => (
                      <ContextMenuCheckboxItem
                        key={option}
                        checked={model === option}
                        onClick={() => handleModelChange(option)}
                      >
                        {VIDEO_GENERATOR_MODEL_LABELS[option]}
                      </ContextMenuCheckboxItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Reference Mode</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {availableReferenceModes.map((option) => (
                <ContextMenuCheckboxItem
                  key={option}
                  checked={referenceMode === option}
                  disabled={availableReferenceModes.length === 1}
                  onClick={() => handleReferenceModeChange(option)}
                >
                  {VIDEO_GENERATOR_REFERENCE_MODE_LABELS[option]}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Aspect Ratio</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              {['16:9', '9:16'].map((value) => (
                <ContextMenuCheckboxItem
                  key={value}
                  checked={(data.aspectRatio ?? '16:9') === value}
                  onClick={() => handleAspectRatioChange(value)}
                >
                  {value}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Resolution</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              {getResolutionOptions(model).map((value) => (
                <ContextMenuCheckboxItem
                  key={value}
                  checked={(data.resolution ?? '720p').toLowerCase() === value.toLowerCase()}
                  onClick={() => handleResolutionChange(value)}
                >
                  {value}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleRun}>
            <PlayIcon className="mr-2 h-4 w-4" />
            Run Node
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
    </TooltipProvider>
  );
}
