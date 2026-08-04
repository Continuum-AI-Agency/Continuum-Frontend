import {
  type BrandBookPieceKind,
  type BrandDirectionPiece,
  coerceImageSize,
  FIXED_IMAGE_PIXELS,
  getImageVariationHandleId,
  type ImageGeneratorModel,
  imageSizesForModel,
  supportsImageSize,
  variationIndexFromHandle,
} from '@continuum/contracts';
import {
  CopyIcon,
  DownloadIcon,
  ExclamationTriangleIcon,
  ImageIcon,
  PlayIcon,
  TrashIcon,
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
  useUpdateNodeInternals,
} from '@xyflow/react';
import type React from 'react';
import { useCallback, useRef, useState } from 'react';
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
import { useBrandDirectionPieces } from '@/lib/brands/useBrandDirectionPieces.client';
import { cn } from '@/lib/utils';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { GroundingChip } from '../components/GroundingChip';
import { NodeStatus } from '../components/NodeStatus';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { NanoGenNodeData, StudioNode } from '../types';
import {
  IMAGE_GENERATOR_NODE_BOUNDS,
  snapNodeDimensionsToAspectRatio,
} from '../utils/aspectRatioSizing';
import { toggleBrandPiece, toggleDirectionPiece, toggleSkillId } from '../utils/brandEnforcement';
import { downloadAsset } from '../utils/downloadAsset';
import { executeWorkflow } from '../utils/executeWorkflow';
import { generationErrorCopy } from '../utils/generationErrorCopy';
import { resignCanvasNodes } from '../utils/resignCanvasNodes';

// One or a full quadrant. Anything between would leave the 2x2 grid ragged and
// buys nothing: the ceiling is IMAGE_VARIATION_LIMIT either way.
const VARIATION_COUNTS = [1, 4] as const;
type VariationCount = (typeof VARIATION_COUNTS)[number];

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

export function ImageGenBlock({ id, data, selected }: NodeProps<ReactFlowNode<NanoGenNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const setEdges = useStudioStore((state) => state.setEdges);
  const currentEdges = useStudioStore((state) => state.edges);
  const updateNodeInternals = useUpdateNodeInternals();
  const executionControls = useWorkflowExecution();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  const [isHovered, setIsHovered] = useState(false);

  const handleModelChange = useCallback(
    (value: string) => {
      const model = value as ImageGeneratorModel;

      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as NanoGenNodeData),
          model,
          // The new model decides what the current size means: undefined when it takes
          // none, the same size when it still supports it, its default when it does not.
          imageSize: coerceImageSize(model, (node.data as NanoGenNodeData).imageSize),
          maxReferenceImages:
            model === 'gpt-image-2' || model === 'flux-2-pro' || model === 'flux-2-max'
              ? 1
              : undefined,
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  const handleImageSizeChange = useCallback(
    (value: string) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as NanoGenNodeData),
          imageSize: value as NanoGenNodeData['imageSize'],
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      updateNode(id, (node) => {
        const nextDimensions = snapNodeDimensionsToAspectRatio({
          aspectRatio: value,
          currentWidth: node.style?.width ?? node.width ?? node.measured?.width,
          currentHeight: node.style?.height ?? node.height ?? node.measured?.height,
          minWidth: IMAGE_GENERATOR_NODE_BOUNDS.minWidth,
          minHeight: IMAGE_GENERATOR_NODE_BOUNDS.minHeight,
          fallbackWidth: IMAGE_GENERATOR_NODE_BOUNDS.fallbackWidth,
        });

        return {
          ...node,
          data: {
            ...(node.data as NanoGenNodeData),
            aspectRatio: value,
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

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as NanoGenNodeData),
          skillIds: toggleSkillId((node.data as NanoGenNodeData).skillIds, skillId),
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
          ...(node.data as NanoGenNodeData),
          brandBookPieces: toggleBrandPiece((node.data as NanoGenNodeData).brandBookPieces, kind),
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode],
  );

  /*
   * The compiler half of the same control. `authoredDirectionPieces` is what the brand has
   * actually written, and it is the set the first toggle expands into — see
   * `toggleDirectionPiece`, which is what keeps "no preference" from collapsing to a
   * one-element selection the moment somebody switches one piece off.
   */
  const { pieces: authoredDirection } = useBrandDirectionPieces(brandId);
  const handleToggleDirectionPiece = useCallback(
    (piece: BrandDirectionPiece) => {
      const authored = authoredDirection.map((entry) => entry.piece);
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as NanoGenNodeData),
          brandDirectionPieces: toggleDirectionPiece(
            (node.data as NanoGenNodeData).brandDirectionPieces,
            piece,
            authored,
          ),
        },
      }));
      triggerSave();
    },
    [authoredDirection, id, triggerSave, updateNode],
  );

  const handleVariationCountChange = useCallback(
    (count: VariationCount) => {
      const previousCount = data.variationCount ?? 1;
      if (count === previousCount) return;

      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as NanoGenNodeData), variationCount: count },
      }));

      // Dropping to fewer variations removes the handles the surviving edges point
      // at. React Flow would keep those edges in state pointed at a handle that is
      // no longer in the DOM, so they stop being drawn while still looking connected.
      if (count < previousCount) {
        setEdges(
          currentEdges.map((edge) =>
            edge.source === id && variationIndexFromHandle(edge.sourceHandle) >= count
              ? { ...edge, sourceHandle: getImageVariationHandleId(0) }
              : edge,
          ),
        );
      }

      triggerSave();
      // The handle set changed shape; without this React Flow keeps the old handle
      // positions and edges render to the wrong point on the node.
      updateNodeInternals(id);
    },
    [currentEdges, data.variationCount, id, setEdges, triggerSave, updateNode, updateNodeInternals],
  );

  const handleRun = useCallback(async () => {
    console.info('[studio] run image node', { nodeId: id });
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [executionControls, id, brandId]);

  // A failed run leaves the node with no preview at all (the run clears it before
  // regenerating), so the failure is the ONLY thing left to show — and it stays
  // shown. The toast that used to be the sole signal auto-dismissed after five
  // seconds, which is how "no image returned, change your prompt" reached the user
  // as an empty node.
  const generationError = typeof data.error === 'string' ? data.error : undefined;
  const errorCopy = generationError
    ? generationErrorCopy(data.errorCode, generationError)
    : undefined;

  const handleDismissError = useCallback(() => {
    useStudioStore.getState().updateNodeData(id, { error: undefined, errorCode: undefined });
  }, [id]);

  const variationCount = data.variationCount ?? 1;
  const generatedVariations = data.generatedImages ?? [];
  const showVariationGrid = generatedVariations.length > 1;
  const previewImage = showVariationGrid
    ? undefined
    : ((data.generatedImage as string | Blob | undefined) ?? data.generatedImageUrl);
  // Handles follow what EXISTS once a run has produced variations, and what is
  // REQUESTED before that, so the node never draws a handle with nothing behind it.
  const outputHandleIds = Array.from(
    { length: showVariationGrid ? generatedVariations.length : variationCount },
    (_unused, index) => getImageVariationHandleId(index),
  );

  // Expiry recovery: a signed URL can expire while the canvas is open. On an image
  // load error, re-sign this node once from its durable storage path/bucket.
  const resignAttemptedRef = useRef(false);
  const handleImageError = useCallback(async () => {
    if (resignAttemptedRef.current) return;
    if (!data.generatedImageStoragePath || !data.generatedImageBucket) return;
    resignAttemptedRef.current = true;
    try {
      const [resigned] = await resignCanvasNodes(
        [{ id, type: 'nanoGen', position: { x: 0, y: 0 }, data } as unknown as StudioNode],
        brandId,
      );
      const url = (resigned?.data as Record<string, unknown> | undefined)?.generatedImageUrl;
      if (typeof url === 'string' && url) {
        useStudioStore
          .getState()
          .updateNodeData(id, { generatedImage: url, generatedImageUrl: url });
      }
    } catch (err) {
      console.warn('[studio] failed to re-sign expired image url', err);
    }
  }, [data, id]);
  // A node used to RE-SIZE ITSELF when a generation came back at a ratio other than the
  // one selected — the box moved under the user with no gesture behind it ("images
  // should be still unless you change the format", Airtable #232). The box is derived
  // from the selected ratio at creation and on ratio change, and nowhere else; a
  // mismatched render is letterboxed by object-contain rather than resizing the node.
  const refImageLimit = data.maxReferenceImages ?? 14;
  const aspectRatio = data.aspectRatio || '16:9';
  const fileBaseName = `image-${id}`;
  const isToolbarVisible = selected || isHovered || !!data.isToolbarVisible;
  const model = data.model ?? 'nano-banana-2';
  const sizeOptions = imageSizesForModel(model);
  const currentImageSize = coerceImageSize(model, data.imageSize);
  const modelLabel =
    model === 'nano-banana-pro'
      ? 'Nano Banana Pro'
      : model === 'nano-banana-2'
        ? 'Nano Banana 2'
        : model === 'gpt-image-2'
          ? 'GPT Image 2'
          : model === 'flux-2-pro'
            ? 'FLUX.2 Pro'
            : model === 'flux-2-max'
              ? 'FLUX.2 Max'
              : 'Nano Banana';
  // A model with no size parameter still renders at SOME size. Saying nothing let
  // users believe the node had chosen one; say the size it actually produces.
  const fixedPixels = FIXED_IMAGE_PIXELS[model];
  const sizeLabel = currentImageSize ?? (fixedPixels ? `${fixedPixels}px (fixed)` : undefined);
  const generatorDescription = [modelLabel, sizeLabel, aspectRatio].filter(Boolean).join(' • ');

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: previewImage as string | Blob | undefined,
      baseName: fileBaseName,
      fallbackExtension: 'png',
    });

    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Run the node to generate an image before downloading.',
        variant: 'warning',
      });
    }
  }, [previewImage, fileBaseName, show]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas node hover affordance, not an interactive control */}
        <div
          data-tour-id={data.isTourSeed ? 'studio-node-image-gen' : undefined}
          className={cn(
            'relative group h-full w-full min-w-[200px] min-h-[200px] rounded-xl transition-shadow',
            isSelectedByOther && 'selected-by-other',
          )}
          style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Legible at any zoom, and it survives the toast: a run that failed is not
              the same as a node nobody has run yet. */}
          <NodeStatus status={errorCopy ? 'error' : 'idle'} errorMessage={generationError} />

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
              brandDirectionPieces={data.brandDirectionPieces}
              onToggleDirectionPiece={handleToggleDirectionPiece}
              className="bg-background/90 shadow-sm backdrop-blur-sm"
            />
          </div>
          <NodeResizer
            minWidth={IMAGE_GENERATOR_NODE_BOUNDS.minWidth}
            minHeight={IMAGE_GENERATOR_NODE_BOUNDS.minHeight}
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
            <div className="flex items-center gap-0.5 rounded border border-border/60 bg-muted/50 p-0.5">
              {VARIATION_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={variationCount === count}
                  className={cn(
                    'h-5 min-w-[1.25rem] rounded px-1 text-[10px] font-medium transition-colors',
                    variationCount === count
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => handleVariationCountChange(count)}
                  title={`Generate ${count} variation${count > 1 ? 's' : ''}`}
                >
                  {count}
                </button>
              ))}
            </div>
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
            {/* The node's own box carries the aspect ratio now (and re-snaps to whatever
                the model actually returned, see handleImageLoad), so the preview simply
                fills it. A Radix AspectRatio here sized itself from the WIDTH and ignored
                h-full: a 9:16 ratio in a 400-wide box computed ~400x711 and the
                overflow-hidden card clipped it, which read as extreme zoom (#232). */}
            <NodeContent
              className="relative flex-1 min-h-0 p-0 bg-muted/30 group/preview"
              data-testid="studio-node-preview"
            >
              {data.isExecuting ? (
                <div className="w-full h-full flex items-center justify-center bg-muted p-4">
                  <GenerationPulseLoader />
                </div>
              ) : errorCopy ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-destructive/5 p-4 text-center"
                  data-testid="studio-image-node-error"
                >
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ExclamationTriangleIcon className="text-destructive" />
                      </EmptyMedia>
                      <EmptyTitle>{errorCopy.title}</EmptyTitle>
                      <EmptyDescription>{errorCopy.guidance}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                  <Button
                    variant="outline"
                    size="sm"
                    className="nodrag"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDismissError();
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              ) : showVariationGrid ? (
                <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 bg-muted">
                  {generatedVariations.map((variation, index) => (
                    <div
                      key={variation.storagePath ?? variation.preview}
                      className="relative overflow-hidden bg-muted group/variation"
                    >
                      <img
                        src={variation.preview}
                        alt={`Generated variation ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        className="nodrag absolute right-1 top-1 z-20 h-6 w-6 border border-border/70 bg-background/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/variation:opacity-90 hover:opacity-100"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          downloadAsset({
                            data: variation.preview,
                            baseName: `${fileBaseName}-${index + 1}`,
                            fallbackExtension: 'png',
                          });
                        }}
                        title={`Download variation ${index + 1}`}
                        aria-label={`Download variation ${index + 1}`}
                      >
                        <DownloadIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : previewImage ? (
                <div className="relative w-full h-full flex items-center justify-center bg-muted">
                  <img
                    src={previewImage as string}
                    alt="Generated result"
                    className="h-full w-full object-contain"
                    onError={handleImageError}
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
                    aria-label="Download generated image"
                  >
                    <DownloadIcon className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-secondary gap-2">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ImageIcon />
                      </EmptyMedia>
                      <EmptyTitle>No Image</EmptyTitle>
                      <EmptyDescription>Generated image will appear here</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              )}
            </NodeContent>
          </CanvasNode>

          <div
            className="absolute -right-2 top-0 bottom-0 z-20 flex flex-col items-center justify-evenly py-4 pointer-events-none"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
          >
            {outputHandleIds.map((handleId, index) => (
              <div key={handleId} className="relative pointer-events-auto group/handle">
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handleId}
                  className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                />
                {outputHandleIds.length > 1 ? (
                  <span className="studio-handle-pill absolute right-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                    {`Variation ${index + 1}`}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Handles Container - Outside of Card to prevent clipping */}
          <div className="absolute -left-5 top-0 bottom-0 flex flex-col justify-evenly py-4 pointer-events-none h-full z-20">
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="prompt"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                Prompt
              </span>
            </div>

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

            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="ref-image"
                maxConnections={refImageLimit}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                Ref Image
              </span>
            </div>
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
        <ContextMenuLabel>Image Generator</ContextMenuLabel>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Model</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuCheckboxItem
              checked={(data.model || 'nano-banana-2') === 'nano-banana'}
              onClick={() => handleModelChange('nano-banana')}
            >
              Nano Banana
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem
              checked={data.model === 'nano-banana-pro'}
              onClick={() => handleModelChange('nano-banana-pro')}
            >
              Nano Banana Pro
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem
              checked={(data.model || 'nano-banana-2') === 'nano-banana-2'}
              onClick={() => handleModelChange('nano-banana-2')}
            >
              Nano Banana 2
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem
              checked={data.model === 'gpt-image-2'}
              onClick={() => handleModelChange('gpt-image-2')}
            >
              GPT Image 2
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem
              checked={data.model === 'flux-2-pro'}
              onClick={() => handleModelChange('flux-2-pro')}
            >
              FLUX.2 Pro
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem
              checked={data.model === 'flux-2-max'}
              onClick={() => handleModelChange('flux-2-max')}
            >
              FLUX.2 Max
            </ContextMenuCheckboxItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {supportsImageSize(model) && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Size</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              {sizeOptions.map((value) => (
                <ContextMenuCheckboxItem
                  key={value}
                  checked={currentImageSize === value}
                  onClick={() => handleImageSizeChange(value)}
                >
                  {value}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSub>
          <ContextMenuSubTrigger>Aspect Ratio</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-36">
            {(data.model === 'nano-banana-2'
              ? ['1:1', '4:5', '5:4', '16:9', '9:16', '4:3', '3:4']
              : data.model === 'flux-2-pro' || data.model === 'flux-2-max'
                ? ['1:1', '4:5', '5:4', '16:9', '9:16', '4:3', '3:4', '21:9']
                : ['1:1', '16:9', '9:16', '4:3', '3:4']
            ).map((value) => (
              <ContextMenuCheckboxItem
                key={value}
                checked={(data.aspectRatio || '16:9') === value}
                onClick={() => handleAspectRatioChange(value)}
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
        <ContextMenuItem onClick={handleDownload} disabled={!previewImage}>
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
  );
}
