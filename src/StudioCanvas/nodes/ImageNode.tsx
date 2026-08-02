import {
  IMAGE_REFORMAT_ASPECT_RATIOS,
  IMAGE_REFORMAT_PRESETS,
  type ImageReformatCompletedData,
} from '@continuum/contracts';
import {
  Cross1Icon,
  ImageIcon,
  LinkBreak2Icon,
  Pencil2Icon,
  ReloadIcon,
  UploadIcon,
} from '@radix-ui/react-icons';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
} from '@xyflow/react';
import { CheckCircle2, Copy, Crop, Expand, Loader2, Scaling, Trash2, XCircle } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import {
  ImageMarkupDialog,
  type ImageMarkupSaveResult,
} from '@/components/ai-studio/markup/ImageMarkupDialog';
import {
  QuickReformatMenu,
  useQuickReformat,
} from '@/components/library/reformat/QuickReformatMenu';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { ImageNodeData, ImageReferenceType, StudioNode } from '../types';
import { simplifyAspectRatio, snapNodeDimensionsToAspectRatio } from '../utils/aspectRatioSizing';
import { parseDataUrl } from '../utils/dataUrl';
import { resolveCollisions } from '../utils/nodeCollisions';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import {
  stageAndUploadReferenceFile,
  uploadReferenceFile,
} from '../utils/uploadReferenceFile';
import { referenceStatusBadge } from './referenceStatusBadge';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

export function ImageNode({ id, data, selected }: NodeProps<ReactFlowNode<ImageNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const detachNodeConnections = useStudioStore((state) => state.detachNodeConnections);
  const getConnectedEdges = useStudioStore((state) => state.getConnectedEdges);
  const brandId = useStudioStore((state) => state.brandId);
  const edges = useEdges();
  const [preview, setPreview] = useState<string | undefined>(data.image);
  const [refType, setRefType] = useState<string>(data.referenceType || 'default');
  const [markupOpen, setMarkupOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const refBadge = referenceStatusBadge(data.referenceStatus);

  const handleRefTypeChange = useCallback(
    (value: string) => {
      setRefType(value);
      updateNodeData(id, { referenceType: value as ImageReferenceType });
      triggerSave();
    },
    [id, updateNodeData, triggerSave],
  );

  const imageConnections = edges.filter(
    (edge) => edge.source === id && edge.sourceHandle === 'image',
  ).length;

  const snapNodeToAspectRatio = useCallback(
    (value: string) => {
      updateNode(id, (node) => {
        const nextDimensions = snapNodeDimensionsToAspectRatio({
          aspectRatio: value,
          currentWidth: node.style?.width ?? node.width ?? node.measured?.width,
          currentHeight: node.style?.height ?? node.height ?? node.measured?.height,
          minWidth: 200,
          minHeight: 200,
          fallbackWidth: 200,
        });

        return {
          ...node,
          data: {
            ...(node.data as ImageNodeData),
            aspectRatio: value,
          },
          style: {
            ...(node.style ?? {}),
            width: nextDimensions.width,
            height: nextDimensions.height,
          },
        };
      });
    },
    [id, updateNode],
  );

  const detectAspectRatioFromImage = useCallback(
    (src: string) =>
      new Promise<string | null>((resolve) => {
        if (typeof Image === 'undefined') {
          resolve(null);
          return;
        }

        const imageElement = new Image();
        imageElement.onload = () => {
          const width = imageElement.naturalWidth;
          const height = imageElement.naturalHeight;
          if (width > 0 && height > 0) {
            resolve(simplifyAspectRatio(width, height));
            return;
          }
          resolve(null);
        };
        imageElement.onerror = () => resolve(null);
        imageElement.src = src;
      }),
    [],
  );

  const applyPreviewImage = useCallback(
    (opts: {
      src: string;
      fileName?: string;
      assetId?: string;
      sourcePath?: string;
      bucket?: string;
      sourceUrl?: string;
    }) => {
      setPreview(opts.src);
      updateNodeData(id, {
        image: opts.src,
        originalImage: opts.src,
        markupLayer: undefined,
        hasMarkup: false,
        fileName: opts.fileName,
        assetId: opts.assetId,
        sourcePath: opts.sourcePath,
        bucket: opts.bucket,
        sourceUrl: opts.sourceUrl,
      });
      triggerSave();
    },
    [id, triggerSave, updateNodeData],
  );

  const handleMarkupSave = useCallback(
    (result: ImageMarkupSaveResult) => {
      const markupLayerDataUrl = `data:${result.markupLayer.mime};base64,${result.markupLayer.base64}`;
      updateNodeData(id, {
        markupLayer: markupLayerDataUrl,
        hasMarkup: true,
      });
      setMarkupOpen(false);
      triggerSave();
      show({ title: 'Markup saved', variant: 'success' });
    },
    [id, updateNodeData, triggerSave, show],
  );

  const handleResetToOriginal = useCallback(() => {
    const original = data.originalImage ?? data.image;
    if (!original) return;
    setPreview(original);
    updateNodeData(id, {
      image: original,
      markupLayer: undefined,
      hasMarkup: false,
    });
    triggerSave();
    show({ title: 'Reset to original', variant: 'success' });
  }, [data.originalImage, data.image, id, updateNodeData, triggerSave, show]);

  const handleClearReference = useCallback(() => {
    setPreview(undefined);
    updateNodeData(id, {
      image: undefined,
      originalImage: undefined,
      markupLayer: undefined,
      hasMarkup: false,
      fileName: undefined,
      assetId: undefined,
      sourcePath: undefined,
      bucket: undefined,
      sourceUrl: undefined,
      aspectRatio: '1:1',
    });
    snapNodeToAspectRatio('1:1');
    triggerSave();
  }, [id, snapNodeToAspectRatio, triggerSave, updateNodeData]);

  useEffect(() => {
    if (data.image !== preview) {
      setPreview(data.image);
    }
  }, [data.image, preview]);

  useEffect(() => {
    if (!preview) return;

    let cancelled = false;
    void detectAspectRatioFromImage(preview).then((detectedAspectRatio) => {
      if (!detectedAspectRatio || cancelled || data.aspectRatio === detectedAspectRatio) {
        return;
      }
      snapNodeToAspectRatio(detectedAspectRatio);
      triggerSave();
    });

    return () => {
      cancelled = true;
    };
  }, [data.aspectRatio, detectAspectRatioFromImage, preview, snapNodeToAspectRatio, triggerSave]);

  // Upload the local file to durable storage and swap the node to its signed URL
  // (processing -> ready/error badge). The base64 preview set by applyPreviewImage
  // remains the emergency fallback if the upload fails.
  const uploadLocalReference = useCallback(
    (
      file: File,
      previewData?: {
        image: string;
        originalImage: string;
        markupLayer?: undefined;
        hasMarkup: false;
        fileName: string;
        assetId?: undefined;
        assetVersionId?: undefined;
        sourcePath?: undefined;
        bucket?: undefined;
        sourceUrl?: undefined;
      },
    ) => {
      if (!brandId) {
        if (previewData) updateNodeData(id, previewData);
        return;
      }
      const deps = { updateNodeData, triggerSave };
      if (previewData) {
        void stageAndUploadReferenceFile(
          { nodeId: id, file, brandId, field: 'image', previewData },
          deps,
        );
        return;
      }
      void uploadReferenceFile({ nodeId: id, file, brandId, field: 'image' }, deps);
    },
    [brandId, id, triggerSave, updateNodeData],
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          setPreview(result);
          uploadLocalReference(file, {
            image: result,
            originalImage: result,
            markupLayer: undefined,
            hasMarkup: false,
            fileName: file.name,
            assetId: undefined,
            assetVersionId: undefined,
            sourcePath: undefined,
            bucket: undefined,
            sourceUrl: undefined,
          });
        };
        reader.readAsDataURL(file);
      }
    },
    [uploadLocalReference],
  );

  // Retry a failed upload from the retained local preview (the base64 the node
  // kept on failure). If no local bytes remain (e.g. after a reload), reopen the
  // file picker instead.
  const handleRetryUpload = useCallback(async () => {
    const src = data.image;
    if (!src || !src.startsWith('data:')) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], data.fileName || 'upload', {
        type: blob.type || 'application/octet-stream',
      });
      uploadLocalReference(file);
    } catch {
      fileInputRef.current?.click();
    }
  }, [data.image, data.fileName, uploadLocalReference]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const fileToDataUrl = useCallback(
    (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      }),
    [],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const file = event.dataTransfer.files?.[0];
      if (file) {
        if (!file.type.startsWith('image/')) {
          show({
            title: 'Unsupported asset',
            description: 'Only image files can be dropped here.',
            variant: 'warning',
          });
          return;
        }
        try {
          const result = await fileToDataUrl(file);
          setPreview(result);
          uploadLocalReference(file, {
            image: result,
            originalImage: result,
            markupLayer: undefined,
            hasMarkup: false,
            fileName: file.name,
            assetId: undefined,
            assetVersionId: undefined,
            sourcePath: undefined,
            bucket: undefined,
            sourceUrl: undefined,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to read dropped file';
          show({
            title: 'Drop failed',
            description: message,
            variant: 'error',
          });
        }
        return;
      }

      const rawPayload =
        event.dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) ||
        event.dataTransfer.getData(RF_DRAG_MIME) ||
        event.dataTransfer.getData(TEXT_MIME);

      if (!rawPayload) return;

      const resolved = await resolveCreativeAssetDrop(rawPayload, resolveDroppedBase64);
      if (resolved.status === 'error') {
        show({
          title: resolved.title,
          description: resolved.description,
          variant: resolved.variant ?? 'error',
        });
        return;
      }

      if (resolved.nodeType !== 'image') {
        show({
          title: 'Unsupported asset',
          description: 'Only image assets can be dropped here.',
          variant: 'warning',
        });
        return;
      }

      applyPreviewImage({
        src: resolved.dataUrl,
        fileName: resolved.fileName,
        assetId: resolved.assetId,
        sourcePath: resolved.sourcePath,
        bucket: resolved.bucket,
        sourceUrl: resolved.sourceUrl,
      });
    },
    [applyPreviewImage, fileToDataUrl, show, uploadLocalReference],
  );

  const addReformattedNode = useCallback(
    (result: ImageReformatCompletedData) => {
      const store = useStudioStore.getState();
      const sourceNode = store.getNodeById(id);
      if (!sourceNode) return;
      const dimensions = snapNodeDimensionsToAspectRatio({
        aspectRatio: result.aspectRatio,
        currentWidth: 260,
        currentHeight: 260,
        minWidth: 200,
        minHeight: 200,
        fallbackWidth: 260,
      });
      const derivedNode: StudioNode = {
        id: `image-reformat-${result.assetId}`,
        type: 'image',
        position: {
          x: sourceNode.position.x + (sourceNode.measured?.width ?? sourceNode.width ?? 260) + 40,
          y: sourceNode.position.y,
        },
        style: { width: dimensions.width, height: dimensions.height },
        data: {
          label: result.fileName,
          image: result.signedUrl,
          originalImage: result.signedUrl,
          fileName: result.fileName,
          assetId: result.assetId,
          sourcePath: result.storagePath,
          bucket: result.bucket,
          sourceUrl: result.signedUrl,
          aspectRatio: result.aspectRatio,
          referenceStatus: 'ready',
        },
      };
      store.setNodes(resolveCollisions([...store.nodes, derivedNode]) as StudioNode[]);
      store.triggerSave();
      show({ title: `${result.aspectRatio} copy added`, variant: 'success' });
    },
    [id, show],
  );
  const quickReformat = useQuickReformat({
    brandId,
    asset:
      preview && data.assetId
        ? {
            id: data.assetId,
            kind: 'image',
            signedUrl: data.sourceUrl ?? preview,
          }
        : null,
    onCompleted: addReformattedNode,
  });

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the node body is a
              drag-and-drop target for reference media; the same media is settable from
              the keyboard through the file input below. */}
          <div
            data-tour-id={data.isTourSeed ? 'studio-node-reference-image' : undefined}
            className={cn(
              'relative group w-full h-full min-w-[200px] min-h-[200px] rounded-xl transition-shadow',
              isSelectedByOther && 'selected-by-other',
            )}
            style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <NodeResizer
              minWidth={200}
              minHeight={200}
              keepAspectRatio
              isVisible={selected}
              lineClassName="border-brand-primary/60"
              handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
            />
            <CanvasNode
              handles={{ target: false, source: false }}
              selected={selected}
              className="relative h-full w-full min-w-0 overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
            >
              <NodeContent className="relative flex-1 min-h-0 p-0 bg-muted/30 group/preview">
                {/* biome-ignore lint/a11y/noStaticElementInteractions: mousedown is swallowed
                    only so React Flow does not start dragging the node when the buttons inside
                    are pressed; the buttons carry the interactivity. */}
                <div
                  className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover/preview:opacity-100 focus-within:opacity-100"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-6 w-6 nodrag border border-border/60 bg-background/90 text-muted-foreground"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    title={preview ? 'Replace image' : 'Upload image'}
                    aria-label={preview ? 'Replace image' : 'Upload image'}
                  >
                    <UploadIcon className="h-3 w-3" />
                  </Button>
                  {preview && (
                    <QuickReformatMenu
                      asset={{
                        id: data.assetId ?? '',
                        kind: 'image',
                        signedUrl: data.sourceUrl ?? preview,
                      }}
                      brandId={brandId ?? ''}
                      onCompleted={addReformattedNode}
                      trigger={
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-6 w-6 nodrag border border-border/60 bg-background/90 text-muted-foreground"
                          disabled={!data.assetId || !brandId}
                          onMouseDown={(event) => event.stopPropagation()}
                          title="Reformat image"
                          aria-label="Reformat image"
                        >
                          <Scaling className="h-3 w-3" />
                        </Button>
                      }
                    />
                  )}
                  {preview && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="h-6 w-6 nodrag border border-border/60 bg-background/90 text-muted-foreground"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleClearReference();
                      }}
                      title="Clear image"
                      aria-label="Clear image"
                    >
                      <Cross1Icon className="h-3 w-3" />
                    </Button>
                  )}
                  {preview && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className={cn(
                        'h-6 w-6 nodrag border border-border/60 bg-background/90 text-muted-foreground',
                        data.hasMarkup && 'text-amber-500',
                      )}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMarkupOpen(true);
                      }}
                      title="Markup image"
                      aria-label="Markup image"
                    >
                      <Pencil2Icon className="h-3 w-3" />
                    </Button>
                  )}
                  <Select value={refType} onValueChange={handleRefTypeChange}>
                    <SelectTrigger className="h-6 w-[94px] text-2xs px-1.5 py-0 border border-border/60 bg-background/90 shadow-sm">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="product">Product</SelectItem>
                      <SelectItem value="color">Color/Theme</SelectItem>
                      <SelectItem value="person">Person</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {preview ? (
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-default">
                    <img
                      src={data.originalImage ?? preview}
                      alt="Preview"
                      className="h-full w-full select-none object-contain"
                      draggable={false}
                    />
                    {data.markupLayer && (
                      <img
                        src={data.markupLayer}
                        alt="Markup overlay"
                        className="absolute inset-0 h-full w-full select-none object-contain pointer-events-none"
                        draggable={false}
                      />
                    )}
                    {data.hasMarkup && (
                      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-3xs font-medium text-white shadow-sm">
                        <Pencil2Icon className="h-2.5 w-2.5" />
                        <span>Marked up</span>
                      </div>
                    )}
                    {refBadge && refBadge.tone !== 'error' && (
                      <div
                        className={cn(
                          'absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-3xs font-medium text-white shadow-sm',
                          refBadge.tone === 'processing' && 'bg-blue-500/90',
                          refBadge.tone === 'ready' && 'bg-emerald-500/90',
                        )}
                      >
                        {refBadge.tone === 'processing' && (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        )}
                        {refBadge.tone === 'ready' && <CheckCircle2 className="h-2.5 w-2.5" />}
                        <span>{refBadge.label}</span>
                      </div>
                    )}
                    {refBadge && refBadge.tone === 'error' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="absolute top-2 right-2 z-10 flex cursor-help items-center gap-1 rounded-full bg-red-500/90 px-1.5 py-0.5 text-3xs font-medium text-white shadow-sm">
                            <XCircle className="h-2.5 w-2.5" />
                            <span>{refBadge.label}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="flex max-w-[220px] flex-col items-start gap-1.5">
                          <p className="text-xs">
                            {data.referenceError ?? 'Upload failed — try again'}
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-6 px-2 text-xs"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={handleRetryUpload}
                          >
                            <ReloadIcon className="mr-1 h-3 w-3" />
                            Retry
                          </Button>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ) : (
                  <Label
                    htmlFor={`file-${id}`}
                    className="cursor-pointer flex h-full w-full items-center justify-center transition-colors hover:bg-muted/40"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <ImageIcon />
                        </EmptyMedia>
                        <EmptyTitle>Upload Image</EmptyTitle>
                        <EmptyDescription>Drag & drop or click</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </Label>
                )}
                <Input
                  id={`file-${id}`}
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {data.fileName && (
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-surface/90 backdrop-blur border-t border-subtle text-3xs text-secondary truncate">
                    {data.fileName}
                  </div>
                )}
              </NodeContent>
            </CanvasNode>

            <Tooltip>
              <TooltipTrigger asChild>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="image"
                  style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
                  className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>Image Output: {imageConnections} connections</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Image Reference</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Reference Type</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              {[
                { value: 'default', label: 'Default' },
                { value: 'product', label: 'Product' },
                { value: 'color', label: 'Color/Theme' },
                { value: 'person', label: 'Person' },
              ].map((option) => (
                <ContextMenuCheckboxItem
                  key={option.value}
                  checked={refType === option.value}
                  onClick={() => handleRefTypeChange(option.value)}
                >
                  {option.label}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {preview && (
            <>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger
                  disabled={quickReformat.unavailable || Boolean(quickReformat.running)}
                >
                  <Scaling className="mr-2 h-4 w-4" />
                  Reformat image
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-52">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <Crop className="mr-2 h-4 w-4" />
                      Fast crop
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-48">
                      {IMAGE_REFORMAT_PRESETS.map((preset) => (
                        <ContextMenuItem
                          key={preset}
                          onClick={() => void quickReformat.reformat('crop', preset)}
                        >
                          {IMAGE_REFORMAT_ASPECT_RATIOS[preset]}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <Expand className="mr-2 h-4 w-4" />
                      Smart expand
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-48">
                      {IMAGE_REFORMAT_PRESETS.map((preset) => (
                        <ContextMenuItem
                          key={preset}
                          onClick={() => void quickReformat.reformat('smart_expand', preset)}
                        >
                          {IMAGE_REFORMAT_ASPECT_RATIOS[preset]}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem onClick={() => setMarkupOpen(true)}>
                <Pencil2Icon className="mr-2 h-4 w-4" />
                Markup Image
              </ContextMenuItem>
              {data.hasMarkup && (data.originalImage ?? data.image) && (
                <ContextMenuItem onClick={handleResetToOriginal}>
                  <ReloadIcon className="mr-2 h-4 w-4" />
                  Reset to Original
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={handleClearReference}>
                <Cross1Icon className="mr-2 h-4 w-4" />
                Clear Reference
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
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

      {preview && (
        <ImageMarkupDialog
          open={markupOpen}
          sourceBase64={parseDataUrl(data.originalImage ?? data.image)?.base64 ?? ''}
          sourceMime={parseDataUrl(data.originalImage ?? data.image)?.mimeType ?? 'image/png'}
          initialMarkup={data.markupLayer ? parseDataUrl(data.markupLayer)?.base64 : undefined}
          title="Markup reference image"
          onClose={() => setMarkupOpen(false)}
          onSave={handleMarkupSave}
        />
      )}
    </TooltipProvider>
  );
}
