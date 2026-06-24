import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer, useEdges } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { BaseNodeData } from '../types';
import { LinkBreak2Icon, ReloadIcon, VideoIcon, UploadIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { useToast } from '@/components/ui/ToastProvider';
import { useNodeSelection } from '../contexts/PresenceContext';
import { cn } from '@/lib/utils';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { CheckCircle2, Copy, Loader2, Trash2, XCircle } from 'lucide-react';
import { referenceStatusBadge } from './referenceStatusBadge';
import { isUploadOnDropEnabled, uploadReferenceFile } from '../utils/uploadReferenceFile';

export interface VideoNodeData extends BaseNodeData {
  video?: string;
  fileName?: string;
  sourcePath?: string;
  bucket?: string;
  sourceUrl?: string;
  referenceStatus?: 'processing' | 'ready' | 'error';
  referenceError?: string;
}

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"


const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

export function VideoReferenceNode({ id, data, selected }: NodeProps<ReactFlowNode<VideoNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const detachNodeConnections = useStudioStore((state) => state.detachNodeConnections);
  const getConnectedEdges = useStudioStore((state) => state.getConnectedEdges);
  const brandId = useStudioStore((state) => state.brandId);
  const edges = useEdges();
  const [preview, setPreview] = useState<string | undefined>(data.video);
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const refBadge = referenceStatusBadge(data.referenceStatus);

  // Calculate connection counts for tooltips
  const videoConnections = edges.filter(edge => edge.source === id && edge.sourceHandle === 'video').length;

  // Upload the local file to durable storage and swap to its signed URL. The
  // base64 preview remains the emergency fallback if the upload fails.
  const uploadLocalReference = useCallback((file: File) => {
    if (!isUploadOnDropEnabled() || !brandId) return;
    void uploadReferenceFile({ nodeId: id, file, brandId, field: 'video' }, { updateNodeData });
  }, [brandId, id, updateNodeData]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        updateNodeData(id, {
          video: result,
          fileName: file.name,
          sourcePath: undefined,
          bucket: undefined,
          sourceUrl: undefined,
        });
        triggerSave();
        uploadLocalReference(file);
      };
      reader.readAsDataURL(file);
    }
  }, [id, triggerSave, updateNodeData, uploadLocalReference]);

  // Retry a failed upload from the retained local preview (the base64 the node
  // kept on failure). If no local bytes remain (e.g. after a reload), reopen the
  // file picker instead.
  const handleRetryUpload = useCallback(async () => {
    const src = data.video;
    if (!src || !src.startsWith('data:')) {
      document.getElementById(`video-file-${id}`)?.click();
      return;
    }
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], data.fileName || 'upload', {
        type: blob.type || 'application/octet-stream',
      });
      uploadLocalReference(file);
    } catch {
      document.getElementById(`video-file-${id}`)?.click();
    }
  }, [data.video, data.fileName, id, uploadLocalReference]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const fileToDataUrl = useCallback((file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  }), []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        show({
          title: 'Unsupported asset',
          description: 'Only video files can be dropped here.',
          variant: 'warning',
        });
        return;
      }
      try {
        const result = await fileToDataUrl(file);
        setPreview(result);
        updateNodeData(id, {
          video: result,
          fileName: file.name,
          sourcePath: undefined,
          sourceUrl: undefined,
        });
        triggerSave();
        uploadLocalReference(file);
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

    if (resolved.nodeType !== 'video') {
      show({
        title: 'Unsupported asset',
        description: 'Only video assets can be dropped here.',
        variant: 'warning',
      });
      return;
    }

    setPreview(resolved.dataUrl);
    updateNodeData(id, {
      video: resolved.dataUrl,
      fileName: resolved.fileName,
      sourcePath: resolved.sourcePath,
      bucket: resolved.bucket,
      sourceUrl: resolved.sourceUrl,
    });
    triggerSave();
  }, [fileToDataUrl, id, triggerSave, updateNodeData, show, uploadLocalReference]);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div 
        className={cn(
          "relative group w-full h-full min-w-[180px] min-h-[180px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
        onDragOver={handleDragOver} 
        onDrop={handleDrop}
      >
      <NodeResizer
        minWidth={160}
        minHeight={160}
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
        <NodeContent className="relative flex-1 min-h-0 p-0 nodrag bg-muted/30 group/preview">
            {refBadge && refBadge.tone !== 'error' && (
              <div
                className={cn(
                  "absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-sm",
                  refBadge.tone === 'processing' && "bg-blue-500/90 text-white",
                  refBadge.tone === 'ready' && "bg-emerald-500/90 text-white",
                )}
              >
                {refBadge.tone === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
                {refBadge.tone === 'ready' && <CheckCircle2 className="h-3 w-3" />}
                {refBadge.label}
              </div>
            )}
            {refBadge && refBadge.tone === 'error' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute left-2 top-2 z-20 flex cursor-help items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
                    <XCircle className="h-3 w-3" />
                    {refBadge.label}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="flex max-w-[220px] flex-col items-start gap-1.5">
                  <p className="text-xs">{data.referenceError ?? "Upload failed — try again"}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-[11px]"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={handleRetryUpload}
                  >
                    <ReloadIcon className="mr-1 h-3 w-3" />
                    Retry
                  </Button>
                </TooltipContent>
              </Tooltip>
            )}
            <label
              htmlFor={`video-file-${id}`}
              className="absolute right-2 top-2 z-20 cursor-pointer rounded bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/preview:opacity-100 focus-visible:opacity-100"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <UploadIcon className="h-3 w-3" />
            </label>
            <label
              htmlFor={`video-file-${id}`}
              className="cursor-pointer flex h-full w-full items-center justify-center transition-colors hover:bg-muted/40"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
                {preview ? (
                    <div className="h-full w-full bg-black/80">
                      <AspectRatio ratio={16 / 9} className="h-full w-full">
                        <video
                          src={preview}
                          className="h-full w-full object-contain"
                          muted
                          loop
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => e.currentTarget.pause()}
                        />
                      </AspectRatio>
                    </div>
                ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <VideoIcon />
                        </EmptyMedia>
                        <EmptyTitle>Upload Video</EmptyTitle>
                        <EmptyDescription>Drag & drop or click</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                )}
            </label>
            <Input
                id={`video-file-${id}`}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileUpload}
            />

            {data.fileName && (
                <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-surface/90 backdrop-blur border-t border-subtle text-[9px] text-secondary truncate">
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
            id="video"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
            className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>Video Output: {videoConnections} connections</p>
        </TooltipContent>
      </Tooltip>
    </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>Video Reference</ContextMenuLabel>
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
          <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteNode(id)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
  );
}
